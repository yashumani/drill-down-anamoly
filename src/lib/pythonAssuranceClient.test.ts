/** Mock fetch tests of transport/precision/privacy; not browser verification. */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isLocalBrowserOrigin, localPythonApiUrl, requestPythonPreview, readLocalUtf8File } from './pythonAssuranceClient';

const input = { csv: 'id,amount\n001,12345678901234567890.00100\n002,\\N\n', rules: '{"schema_version":"1.0"}', evaluationTime: '' };
const report = { report_version: '1.0', engine_version: '0.1.0a1', mode: 'preview', gate: 'non_gating',
  bundle_digest: 'a'.repeat(64), approval_valid_in_caller_trust: false, gate_reason: 'checks_evaluated',
  evaluation_time: null, row_count: 2, rule_count: 1, outcome_counts: { pass: 1 },
  results: [{ id: 'structure', operator: 'required_fields', outcome: 'pass', reason: 'fields_present',
    severity: 'critical', required: true, blocking: true, counts: { affected_rows: 0 } }],
  limitations: ['internal_consistency_is_not_source_completeness', 'aggregates_do_not_prove_transaction_accuracy'] };
const response = (value: unknown = { report }, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => vi.stubGlobal('location', { origin: 'http://localhost:5173' }));
afterEach(() => vi.unstubAllGlobals());

describe('explicit local Python preview transport', () => {
  it('keeps CSP aligned with only the fixed Python API path and preserves existing sources', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
    const connect = policy?.split(';').map(item => item.trim()).find(item => item.startsWith('connect-src '));
    expect(connect?.split(/\s+/).slice(1)).toEqual(["'self'", 'https:',
      'http://127.0.0.1:11434', 'http://localhost:11434', 'http://127.0.0.1:8765/api']);
    expect(localPythonApiUrl('http://127.0.0.1:8765')).toBe('http://127.0.0.1:8765/api');
  });

  it('decodes original UTF-8 strictly without changing identifiers, precision or line endings', async () => {
    const text = 'id,amount\r\n001,9007199254740993.00010\r\n';
    const content = new TextEncoder().encode(text);
    expect(await readLocalUtf8File({ size: content.byteLength, arrayBuffer: async () => content.buffer })).toBe(text);
    await expect(readLocalUtf8File({ size: 2, arrayBuffer: async () => new Uint8Array([0xc3, 0x28]).buffer })).rejects.toThrow('invalid_utf8_local_file');
  });

  it('preserves exact original CSV/rule text and sends no credentials or redirects', async () => {
    const fetcher = vi.fn().mockResolvedValue(response()); vi.stubGlobal('fetch', fetcher);
    expect(await requestPythonPreview('http://127.0.0.1:8765', input, { confirmed: true })).toEqual(report);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8765/api');
    expect(JSON.parse(options.body)).toEqual({ operation: 'preview', csv: input.csv, rules: input.rules,
      evaluation_time: '', references: {}, types: {} });
    expect(options).toMatchObject({ credentials: 'omit', redirect: 'error', mode: 'cors', cache: 'no-store' });
    expect(options.headers).not.toHaveProperty('Authorization');
  });

  it('does not fetch without explicit confirmation or from a remote app origin', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(requestPythonPreview('http://127.0.0.1:8765', input, { confirmed: false })).rejects.toThrow('confirmation_required');
    vi.stubGlobal('location', { origin: 'https://yashumani.github.io' });
    await expect(requestPythonPreview('http://127.0.0.1:8765', input, { confirmed: true })).rejects.toThrow('local_browser_origin_required');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['https://remote.invalid', 'http://localhost:8765', 'http://127.0.0.1:8765/other',
    'http://user@127.0.0.1:8765', 'http://127.0.0.1:8765?data=1', 'http://127.0.0.1:8765#part',
    'http://127.0.0.1.evil:8765', 'http://2130706433:8765', 'http://127.0.0.1:0',
    'http://127.0.0.1:8766', 'http://127.0.0.1:11434'])('rejects an unsafe endpoint %s', endpoint => {
    expect(() => localPythonApiUrl(endpoint)).toThrow('invalid_local_python_endpoint');
  });

  it('accepts only exact local HTTP browser origins', () => {
    expect(isLocalBrowserOrigin('http://localhost:5173')).toBe(true);
    expect(isLocalBrowserOrigin('http://127.0.0.1:5173')).toBe(true);
    for (const origin of ['null', '*', 'https://localhost:5173', 'http://localhost:5173/path', 'http://user@localhost:5173', 'http://localhost.evil:5173']) {
      expect(isLocalBrowserOrigin(origin)).toBe(false);
    }
  });

  it('rejects oversized input before any transfer', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(requestPythonPreview('http://127.0.0.1:8765', { ...input, csv: 'x'.repeat(1_048_577) }, { confirmed: true })).rejects.toThrow('invalid_local_python_input');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([{ ...report, gate: 'pass', mode: 'production' }, { ...report, raw_rows: [{ amount: 'PRIVATE' }] },
    { ...report, outcome_counts: { pass: 99 } }, { ...report, approval_valid_in_caller_trust: true }])('rejects unsafe or inconsistent response metadata', async value => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ report: value })));
    await expect(requestPythonPreview('http://127.0.0.1:8765', input, { confirmed: true })).rejects.toThrow('invalid_python_preview_response');
  });

  it('accepts a valid failing reconciliation with disjoint primary/control group counts', async () => {
    const mismatch = { ...report, outcome_counts: { fail: 1 }, results: [{ ...report.results[0],
      operator: 'reconcile', outcome: 'fail', reason: 'control_mismatch', counts: { unmatched_groups: 200_000 } }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ report: mismatch })));
    expect((await requestPythonPreview('http://127.0.0.1:8765', input, { confirmed: true })).outcome_counts).toEqual({ fail: 1 });
  });

  it('redacts server errors instead of exposing response text or source data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ error: 'PRIVATE_ROWS_AND_TOKEN' }, 400)));
    await expect(requestPythonPreview('http://127.0.0.1:8765', input, { confirmed: true })).rejects.toThrow('local_python_rejected');
  });
});
