export type LiveDemoScope = 'all' | '24m' | 'current_fy';

export interface LiveDemoFilter {
  field: string;
  value: string;
}

export interface LiveDimensionDefinition {
  field: string;
  label: string;
  description: string;
}

export interface LiveDimensionValue {
  value: string;
  amount: number;
  transactions: number;
  shareOfSpend: number;
  averageTransaction: number;
}

export interface LiveDimensionSummary extends LiveDimensionDefinition {
  values: LiveDimensionValue[];
  error?: string;
}

export interface LiveMonthlyPoint {
  key: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  actual: number;
  expected: number;
  variance: number;
  businessImpact: number;
  variancePct: number | null;
  transactions: number;
  anomalyScore: number;
  materialityThreshold: number;
  alertSeverity: 'critical' | 'watch' | 'favorable' | 'normal';
  partialPeriod: boolean;
}

export interface LiveSourceSummary {
  rowCount: number;
  totalAmount: number;
  minDate: string;
  maxDate: string;
  maxFiscalYear: string;
}

export interface LivePublicFinanceResult {
  source: {
    name: string;
    owner: string;
    datasetId: string;
    datasetUrl: string;
    apiDocsUrl: string;
    apiEndpoint: string;
    columnCount: number;
    updatedAt: string;
    license: string;
  };
  scope: LiveDemoScope;
  scopeLabel: string;
  filter: LiveDemoFilter | null;
  fullSource: LiveSourceSummary;
  scopedSource: LiveSourceSummary;
  monthly: LiveMonthlyPoint[];
  dimensions: LiveDimensionSummary[];
  benchmarkMethod: string;
  trailing12Amount: number;
  trailing12Impact: number;
  currentMonth: LiveMonthlyPoint | null;
  biggestUnfavorableMonth: LiveMonthlyPoint | null;
  trend: 'improving' | 'worsening' | 'stable' | 'insufficient';
  analysisHealth: number;
  queryDurationMs: number;
  requestCount: number;
  warnings: string[];
}

export interface LoadLivePublicFinanceOptions {
  scope?: LiveDemoScope;
  filter?: LiveDemoFilter | null;
  appToken?: string;
  signal?: AbortSignal;
  onProgress?: (message: string, completed: number, total: number) => void;
}

interface SodaQuery {
  select: string;
  where?: string;
  group?: string;
  order?: string;
  limit?: number;
}

interface RawMonthlyRow {
  fiscal_year?: string | number;
  fiscal_month_number?: string | number;
  period_start?: string;
  period_end?: string;
  amount?: string | number;
  transactions?: string | number;
}

interface RawSummaryRow {
  row_count?: string | number;
  total_amount?: string | number;
  min_date?: string;
  max_date?: string;
  max_fiscal_year?: string | number;
}

interface SodaMetadata {
  name?: unknown;
  attribution?: unknown;
  rowsUpdatedAt?: unknown;
  columns?: unknown[];
  license?: {
    name?: unknown;
  } | null;
}

const DATASET_ID = 'v5c4-aqci';
const API_ENDPOINT = `https://controllerdata.lacity.org/resource/${DATASET_ID}.json`;
const METADATA_ENDPOINT = `https://controllerdata.lacity.org/api/views/${DATASET_ID}`;
const DATASET_URL = `https://controllerdata.lacity.org/Purchasing/LA_PROCUREMENT/${DATASET_ID}`;
const API_DOCS_URL = `https://dev.socrata.com/foundry/controllerdata.lacity.org/${DATASET_ID}`;
const MATERIALITY_PERCENT = 0.03;

export const LIVE_PUBLIC_DIMENSIONS: readonly LiveDimensionDefinition[] = [
  { field: 'department_name', label: 'Department', description: 'City department, bureau, or office responsible for the payment.' },
  { field: 'vendor_name', label: 'Vendor', description: 'Payee or supplier receiving the procurement payment.' },
  { field: 'government_activity', label: 'Government Activity', description: 'Operational activity classification associated with the expenditure.' },
  { field: 'fund_group_name', label: 'Fund Group', description: 'High-level fund grouping used to finance the transaction.' },
  { field: 'fund_type', label: 'Fund Type', description: 'Financial classification of the underlying fund.' },
  { field: 'fund_name', label: 'Fund', description: 'Named fund from which the payment was made.' },
  { field: 'account_name', label: 'Account', description: 'General-ledger account or spending category.' },
  { field: 'expenditure_type', label: 'Expenditure Type', description: 'Procurement expenditure classification.' },
  { field: 'authority', label: 'Authority', description: 'Authority or purchasing mechanism associated with the transaction.' },
  { field: 'settlement_judgment', label: 'Settlement / Judgment', description: 'Whether the payment is associated with a settlement or judgment.' },
] as const;

const ALLOWED_FILTER_FIELDS = new Set(LIVE_PUBLIC_DIMENSIONS.map((dimension) => dimension.field));

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function robustScale(values: number[]) {
  if (values.length < 2) return 0;
  const center = median(values);
  const mad = median(values.map((value) => Math.abs(value - center)));
  if (mad) return mad * 1.4826;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function scopeLabel(scope: LiveDemoScope) {
  if (scope === '24m') return 'Latest 24 months';
  if (scope === 'current_fy') return 'Latest fiscal year';
  return 'All available records';
}

export function escapeSoqlLiteral(value: string) {
  return value.replace(/'/g, "''");
}

export function buildSodaUrl(query: SodaQuery) {
  const url = new URL(API_ENDPOINT);
  url.searchParams.set('$select', query.select);
  if (query.where) url.searchParams.set('$where', query.where);
  if (query.group) url.searchParams.set('$group', query.group);
  if (query.order) url.searchParams.set('$order', query.order);
  if (query.limit) url.searchParams.set('$limit', String(query.limit));
  return url.toString();
}

export function buildScopeWhere(
  scope: LiveDemoScope,
  source: Pick<LiveSourceSummary, 'maxDate' | 'maxFiscalYear'>,
  filter?: LiveDemoFilter | null,
) {
  const clauses = ['dollar_amount is not null'];
  if (scope === '24m' && source.maxDate) {
    const maximum = new Date(source.maxDate);
    if (Number.isFinite(maximum.getTime())) {
      const cutoff = new Date(Date.UTC(maximum.getUTCFullYear(), maximum.getUTCMonth() - 23, 1));
      clauses.push(`transaction_date >= '${dateOnly(cutoff)}T00:00:00.000'`);
    }
  }
  if (scope === 'current_fy' && source.maxFiscalYear) {
    clauses.push(`fiscal_year = '${escapeSoqlLiteral(source.maxFiscalYear)}'`);
  }
  if (filter && ALLOWED_FILTER_FIELDS.has(filter.field)) {
    clauses.push(`${filter.field} = '${escapeSoqlLiteral(filter.value)}'`);
  }
  return clauses.join(' AND ');
}

function delay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, milliseconds);
    if (signal) {
      signal.addEventListener('abort', () => {
        globalThis.clearTimeout(timer);
        reject(new Error('Live public-data request was cancelled.'));
      }, { once: true });
    }
  });
}

async function fetchJson<T>(url: string, appToken = '', signal?: AbortSignal): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 45_000);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          ...(appToken.trim() ? { 'X-App-Token': appToken.trim() } : {}),
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text();
        if ((response.status === 429 || response.status >= 500) && attempt === 0) {
          lastError = new Error(`Public API returned ${response.status}: ${text.slice(0, 180)}`);
          await delay(900, signal);
          continue;
        }
        throw new Error(`Public API returned ${response.status}: ${text.slice(0, 240)}`);
      }
      return await response.json() as T;
    } catch (error) {
      if (controller.signal.aborted && signal?.aborted) throw new Error('Live public-data request was cancelled.');
      if (controller.signal.aborted) lastError = new Error('The live public-data query timed out after 45 seconds.');
      else lastError = error;
      if (attempt === 0) await delay(600, signal);
    } finally {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function normalizeSummary(rows: RawSummaryRow[]): LiveSourceSummary {
  const row = rows[0] ?? {};
  return {
    rowCount: numberValue(row.row_count),
    totalAmount: numberValue(row.total_amount),
    minDate: String(row.min_date ?? ''),
    maxDate: String(row.max_date ?? ''),
    maxFiscalYear: String(row.max_fiscal_year ?? ''),
  };
}

function formatMonthLabel(periodStart: string, fiscalYear: number, fiscalMonth: number) {
  const parsed = new Date(periodStart);
  if (Number.isFinite(parsed.getTime())) {
    return parsed.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  return `FY${fiscalYear} M${fiscalMonth}`;
}

export function buildMonthlyBenchmark(rows: RawMonthlyRow[], maxDate: string): LiveMonthlyPoint[] {
  const normalized = rows.map((row) => {
    const fiscalYear = numberValue(row.fiscal_year);
    const fiscalMonth = numberValue(row.fiscal_month_number);
    const periodStart = String(row.period_start ?? '');
    const periodEnd = String(row.period_end ?? periodStart);
    return {
      fiscalYear,
      fiscalMonth,
      periodStart,
      periodEnd,
      amount: numberValue(row.amount),
      transactions: numberValue(row.transactions),
    };
  }).filter((row) => row.periodStart && row.amount !== 0)
    .sort((left, right) => left.periodStart.localeCompare(right.periodStart));

  const globalMedian = median(normalized.map((row) => row.amount));
  const latestSourceDate = new Date(maxDate);
  const rawPoints = normalized.map((row, index) => {
    const history = normalized.slice(Math.max(0, index - 6), index).map((item) => item.amount);
    let expected = history.length >= 3 ? median(history) : globalMedian;
    let partialPeriod = false;
    const periodDate = new Date(row.periodStart);
    if (Number.isFinite(latestSourceDate.getTime()) && Number.isFinite(periodDate.getTime())
      && latestSourceDate.getUTCFullYear() === periodDate.getUTCFullYear()
      && latestSourceDate.getUTCMonth() === periodDate.getUTCMonth()) {
      const totalDays = new Date(Date.UTC(periodDate.getUTCFullYear(), periodDate.getUTCMonth() + 1, 0)).getUTCDate();
      const elapsedDays = latestSourceDate.getUTCDate();
      if (elapsedDays < totalDays) {
        expected *= elapsedDays / totalDays;
        partialPeriod = true;
      }
    }
    const variance = row.amount - expected;
    const businessImpact = -variance;
    return {
      key: `${row.fiscalYear}-${String(row.fiscalMonth).padStart(2, '0')}`,
      label: formatMonthLabel(row.periodStart, row.fiscalYear, row.fiscalMonth),
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      actual: row.amount,
      expected,
      variance,
      businessImpact,
      variancePct: expected === 0 ? null : variance / Math.abs(expected),
      transactions: row.transactions,
      partialPeriod,
    };
  });

  return rawPoints.map((point, index) => {
    const prior = rawPoints.slice(Math.max(0, index - 12), index).map((item) => item.businessImpact);
    const center = median(prior);
    const scale = robustScale(prior);
    const anomalyScore = prior.length >= 4 && scale > 0 ? Math.abs(point.businessImpact - center) / scale : 0;
    const materialityThreshold = Math.abs(point.expected) * MATERIALITY_PERCENT;
    const material = Math.abs(point.businessImpact) >= materialityThreshold && materialityThreshold > 0;
    const alertSeverity: LiveMonthlyPoint['alertSeverity'] = point.businessImpact < 0 && (Math.abs(point.businessImpact) >= materialityThreshold * 2 || anomalyScore >= 3)
      ? 'critical'
      : point.businessImpact < 0 && (material || anomalyScore >= 2)
        ? 'watch'
        : point.businessImpact > 0 && material
          ? 'favorable'
          : 'normal';
    return { ...point, anomalyScore, materialityThreshold, alertSeverity };
  });
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
) {
  const output = new Array<R>(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return output;
}

function trendFrom(points: LiveMonthlyPoint[]) {
  if (points.length < 6) return 'insufficient' as const;
  const recent = mean(points.slice(-3).map((point) => point.businessImpact));
  const prior = mean(points.slice(-6, -3).map((point) => point.businessImpact));
  const difference = recent - prior;
  const reference = Math.max(1, mean(points.slice(-6).map((point) => Math.abs(point.expected))) * 0.01);
  if (Math.abs(difference) < reference) return 'stable' as const;
  return difference > 0 ? 'improving' as const : 'worsening' as const;
}

export async function loadLivePublicFinance(options: LoadLivePublicFinanceOptions = {}): Promise<LivePublicFinanceResult> {
  const started = performance.now();
  const scope = options.scope ?? 'all';
  const filter = options.filter ?? null;
  const appToken = options.appToken ?? '';
  let requestCount = 0;
  let completed = 0;
  const totalSteps = 4 + LIVE_PUBLIC_DIMENSIONS.length;
  const progress = (message: string) => options.onProgress?.(message, completed, totalSteps);

  const query = async <T,>(sodaQuery: SodaQuery) => {
    requestCount += 1;
    return fetchJson<T>(buildSodaUrl(sodaQuery), appToken, options.signal);
  };

  progress('Reading source metadata and full-dataset totals…');
  const [fullRows, metadata] = await Promise.all([
    query<RawSummaryRow[]>({
      select: 'count(*) as row_count, sum(dollar_amount) as total_amount, min(transaction_date) as min_date, max(transaction_date) as max_date, max(fiscal_year) as max_fiscal_year',
      where: 'dollar_amount is not null',
    }),
    (async () => {
      requestCount += 1;
      try {
        return await fetchJson<SodaMetadata>(METADATA_ENDPOINT, appToken, options.signal);
      } catch {
        return null;
      }
    })(),
  ]);
  completed += 2;
  const fullSource = normalizeSummary(fullRows);
  const where = buildScopeWhere(scope, fullSource, filter);

  progress('Calculating exact totals for the selected live scope…');
  const scopedSource = scope === 'all' && !filter
    ? fullSource
    : normalizeSummary(await query<RawSummaryRow[]>({
      select: 'count(*) as row_count, sum(dollar_amount) as total_amount, min(transaction_date) as min_date, max(transaction_date) as max_date, max(fiscal_year) as max_fiscal_year',
      where,
    }));
  completed += 1;

  progress('Building the monthly spend and anomaly pulse…');
  const monthlyRows = await query<RawMonthlyRow[]>({
    select: 'fiscal_year, fiscal_month_number, min(transaction_date) as period_start, max(transaction_date) as period_end, sum(dollar_amount) as amount, count(*) as transactions',
    where: `${where} AND fiscal_year is not null AND fiscal_month_number is not null AND transaction_date is not null`,
    group: 'fiscal_year, fiscal_month_number',
    limit: 500,
  });
  completed += 1;
  const monthly = buildMonthlyBenchmark(monthlyRows, scopedSource.maxDate || fullSource.maxDate);

  const dimensionWarnings: string[] = [];
  const dimensions = await mapWithConcurrency<LiveDimensionDefinition, LiveDimensionSummary>(
    LIVE_PUBLIC_DIMENSIONS,
    3,
    async (dimension) => {
      progress(`Scanning ${dimension.label} across the live source…`);
      try {
        const rows = await query<Array<{ value?: string; amount?: string | number; transactions?: string | number }>>({
          select: `${dimension.field} as value, sum(dollar_amount) as amount, count(*) as transactions`,
          where: `${where} AND ${dimension.field} is not null`,
          group: dimension.field,
          order: 'sum(dollar_amount) DESC',
          limit: 8,
        });
        const values: LiveDimensionValue[] = rows.map((row) => {
          const amount = numberValue(row.amount);
          const transactions = numberValue(row.transactions);
          return {
            value: String(row.value ?? '(missing)'),
            amount,
            transactions,
            shareOfSpend: scopedSource.totalAmount === 0 ? 0 : amount / scopedSource.totalAmount,
            averageTransaction: transactions === 0 ? 0 : amount / transactions,
          };
        });
        return { ...dimension, values };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        dimensionWarnings.push(`${dimension.label} query could not be completed: ${message}`);
        return { ...dimension, values: [], error: message };
      } finally {
        completed += 1;
      }
    },
  );

  const recent12 = monthly.slice(-12);
  const trailing12Amount = recent12.reduce((sum, point) => sum + point.actual, 0);
  const trailing12Impact = recent12.reduce((sum, point) => sum + point.businessImpact, 0);
  const currentMonth = monthly[monthly.length - 1] ?? null;
  const biggestUnfavorableMonth = [...monthly]
    .filter((point) => point.businessImpact < 0)
    .sort((left, right) => left.businessImpact - right.businessImpact)[0] ?? null;
  const successfulDimensions = dimensions.filter((dimension) => !dimension.error).length;
  const analysisHealth = Math.max(0, Math.min(100,
    45
    + Math.min(25, monthly.length)
    + successfulDimensions / LIVE_PUBLIC_DIMENSIONS.length * 20
    + (scopedSource.rowCount >= 1_000_000 ? 10 : 5),
  ));

  const metadataColumns = Array.isArray(metadata?.columns) ? metadata.columns.length : 61;
  const updatedEpoch = numberValue(metadata?.rowsUpdatedAt);
  const updatedAt = updatedEpoch ? new Date(updatedEpoch * 1000).toISOString() : '';
  const warnings = [
    'The City of Los Angeles source contains actual procurement payments but no approved budget or forecast field. The monthly comparison uses a six-period rolling median benchmark.',
    'The browser receives only exact server-side aggregates; the multi-million transaction table is not downloaded into browser memory.',
    'Dimension panels show the eight largest categories by total payment amount, not every category.',
    'The source documentation notes that older payment history may be summarized. Treat historical transaction counts accordingly.',
    ...dimensionWarnings,
  ];
  if (!appToken.trim()) warnings.push('The live demo is using the public unauthenticated Socrata API tier. An optional app token can improve rate-limit reliability.');

  return {
    source: {
      name: String(metadata?.name ?? 'LA_PROCUREMENT'),
      owner: String(metadata?.attribution ?? 'City of Los Angeles Controller'),
      datasetId: DATASET_ID,
      datasetUrl: DATASET_URL,
      apiDocsUrl: API_DOCS_URL,
      apiEndpoint: API_ENDPOINT,
      columnCount: metadataColumns,
      updatedAt,
      license: String(metadata?.license?.name ?? 'Creative Commons Attribution 4.0'),
    },
    scope,
    scopeLabel: scopeLabel(scope),
    filter,
    fullSource,
    scopedSource,
    monthly,
    dimensions,
    benchmarkMethod: 'Six-period rolling median; partial latest month prorated by calendar days',
    trailing12Amount,
    trailing12Impact,
    currentMonth,
    biggestUnfavorableMonth,
    trend: trendFrom(monthly),
    analysisHealth,
    queryDurationMs: performance.now() - started,
    requestCount,
    warnings,
  };
}
