/** Optional local transport. Rule execution remains exclusively in Python. */
export const MAX_LOCAL_FILE_BYTES = 1_048_576;
const MAX_BODY_BYTES = 2_097_152;
const outcomes = ['pass', 'fail', 'not_evaluated', 'error'] as const;
const operators = ['required_fields', 'types', 'unique', 'allowed_values', 'range', 'coverage', 'freshness', 'consistency', 'row_level', 'reconcile'];
type Outcome = typeof outcomes[number];

export interface PythonCheck {
  id: string; operator: string; outcome: Outcome; reason: string;
  severity: 'info' | 'warning' | 'critical'; required: boolean; blocking: boolean;
  counts: Record<string, number>;
}
export interface PythonPreviewReport {
  report_version: '1.0'; engine_version: string; mode: 'preview'; gate: 'non_gating';
  bundle_digest: string; approval_valid_in_caller_trust: false; gate_reason: string;
  evaluation_time: string | null; row_count: number; rule_count: number;
  outcome_counts: Partial<Record<Outcome, number>>; results: PythonCheck[]; limitations: string[];
}
export interface PythonPreviewInput {
  csv: string; rules: string; evaluationTime: string; references?: Record<string, string>;
}

const bytes = (value: string) => new TextEncoder().encode(value).length;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, max: number) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
function exact(value: unknown, fields: string[]): value is Record<string, unknown> {
  return object(value) && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
}
function code(value: unknown, pattern = /^[a-z0-9_]{1,128}$/): value is string {
  return typeof value === 'string' && pattern.test(value);
}

export function isLocalBrowserOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && value === url.origin;
  } catch { return false; }
}

export function localPythonApiUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || Number(url.port) < 1
      || (value !== url.origin && value !== `${url.origin}/`)) throw new Error();
    return `${url.origin}/api`;
  } catch { throw new Error('invalid_local_python_endpoint'); }
}

function previewReport(value: unknown): PythonPreviewReport {
  const fields = ['report_version', 'engine_version', 'mode', 'bundle_digest', 'approval_valid_in_caller_trust',
    'gate', 'gate_reason', 'evaluation_time', 'row_count', 'rule_count', 'outcome_counts', 'results', 'limitations'];
  if (!exact(value, fields) || value.report_version !== '1.0' || value.mode !== 'preview' || value.gate !== 'non_gating'
    || value.approval_valid_in_caller_trust !== false || value.gate_reason !== 'checks_evaluated'
    || !code(value.engine_version, /^[0-9]+\.[0-9]+\.[0-9]+(?:[a-z][0-9]+)?$/)
    || !code(value.bundle_digest, /^[a-f0-9]{64}$/) || !integer(value.row_count, 100_000)
    || !integer(value.rule_count, 128) || value.rule_count === 0
    || !(value.evaluation_time === null || code(value.evaluation_time, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\+00:00$/))
    || !object(value.outcome_counts) || !Array.isArray(value.results) || value.results.length !== value.rule_count
    || !Array.isArray(value.limitations) || value.limitations.length > 16 || !value.limitations.every(item => code(item))) {
    throw new Error('invalid_python_preview_response');
  }
  const frequencies: Partial<Record<Outcome, number>> = {};
  for (const check of value.results) {
    if (!exact(check, ['id', 'operator', 'outcome', 'reason', 'severity', 'required', 'blocking', 'counts'])
      || !code(check.id, /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/) || !operators.includes(check.operator as string)
      || !outcomes.includes(check.outcome as Outcome) || !code(check.reason)
      || !['info', 'warning', 'critical'].includes(check.severity as string)
      || typeof check.required !== 'boolean' || typeof check.blocking !== 'boolean' || !object(check.counts)
      || Object.keys(check.counts).length > 16
      || !Object.entries(check.counts).every(([name, count]) => code(name) && integer(count, 200_000))) {
      throw new Error('invalid_python_preview_response');
    }
    const outcome = check.outcome as Outcome;
    frequencies[outcome] = (frequencies[outcome] ?? 0) + 1;
  }
  if (!Object.entries(value.outcome_counts).every(([name, count]) => outcomes.includes(name as Outcome)
    && integer(count, 128) && count === frequencies[name as Outcome])
    || Object.keys(value.outcome_counts).length !== Object.keys(frequencies).length) {
    throw new Error('invalid_python_preview_response');
  }
  // This validates only the transport schema; it does not reproduce any rule logic.
  return value as unknown as PythonPreviewReport;
}

export async function readLocalUtf8File(file: Pick<File, 'size' | 'arrayBuffer'>): Promise<string> {
  if (file.size > MAX_LOCAL_FILE_BYTES) throw new Error('local_file_limit');
  try {
    const content = await file.arrayBuffer();
    if (content.byteLength > MAX_LOCAL_FILE_BYTES) throw new Error();
    return new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch { throw new Error('invalid_utf8_local_file'); }
}

export async function requestPythonPreview(endpoint: string, input: PythonPreviewInput,
  options: { confirmed: boolean; signal?: AbortSignal }): Promise<PythonPreviewReport> {
  if (options?.confirmed !== true) throw new Error('local_transfer_confirmation_required');
  if (typeof location === 'undefined' || !isLocalBrowserOrigin(location.origin)) throw new Error('local_browser_origin_required');
  const url = localPythonApiUrl(endpoint);
  if (typeof input.csv !== 'string' || !input.csv || typeof input.rules !== 'string' || !input.rules
    || bytes(input.csv) > MAX_LOCAL_FILE_BYTES || bytes(input.rules) > MAX_LOCAL_FILE_BYTES
    || typeof input.evaluationTime !== 'string' || input.evaluationTime.length > 128) throw new Error('invalid_local_python_input');
  const references = input.references ?? {};
  if (!object(references) || Object.keys(references).length > 32 || !Object.entries(references).every(([name, csv]) =>
    name.length > 0 && name.length <= 128 && typeof csv === 'string' && bytes(csv) <= MAX_LOCAL_FILE_BYTES)) {
    throw new Error('invalid_local_python_input');
  }
  const body = JSON.stringify({ operation: 'preview', csv: input.csv, rules: input.rules,
    evaluation_time: input.evaluationTime, references, types: {} });
  if (bytes(body) > MAX_BODY_BYTES) throw new Error('local_python_request_limit');
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      mode: 'cors', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: options.signal });
  } catch { throw new Error('local_python_unavailable'); }
  if (!response.ok) throw new Error('local_python_rejected');
  if (!response.headers.get('Content-Type')?.startsWith('application/json')
    || Number(response.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) throw new Error('invalid_python_preview_response');
  let value: unknown;
  try {
    const text = await response.text();
    if (bytes(text) > MAX_BODY_BYTES) throw new Error();
    value = JSON.parse(text);
  } catch { throw new Error('invalid_python_preview_response'); }
  if (!exact(value, ['report'])) throw new Error('invalid_python_preview_response');
  return previewReport(value.report);
}
