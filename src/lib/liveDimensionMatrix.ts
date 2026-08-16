import {
  buildScopeWhere,
  escapeSoqlLiteral,
} from './livePublicFinance';
import type {
  LiveDemoFilter,
  LiveDemoScope,
  LiveDimensionDefinition,
  LiveMonthlyPoint,
  LiveSourceSummary,
} from './livePublicFinance';

const DATASET_ID = 'v5c4-aqci';
const API_ENDPOINT = `https://controllerdata.lacity.org/resource/${DATASET_ID}.json`;

interface RawDimensionMonthRow {
  value?: string;
  fiscal_year?: string | number;
  fiscal_month_number?: string | number;
  period_start?: string;
  period_end?: string;
  amount?: string | number;
  transactions?: string | number;
}

export interface LiveDimensionMatrixCell {
  category: string;
  periodKey: string;
  periodLabel: string;
  periodStart: string;
  actual: number;
  expected: number;
  variance: number;
  businessImpact: number;
  variancePct: number | null;
  transactions: number;
  partialPeriod: boolean;
}

export interface LiveDimensionLatestContribution {
  category: string;
  actual: number;
  expected: number;
  businessImpact: number;
  variancePct: number | null;
  transactions: number;
  isOther?: boolean;
}

export interface LiveDimensionMatrixResult {
  dimension: LiveDimensionDefinition;
  categories: string[];
  periods: Array<Pick<LiveMonthlyPoint, 'key' | 'label' | 'periodStart' | 'periodEnd' | 'partialPeriod'>>;
  cells: LiveDimensionMatrixCell[];
  latestPeriod: string;
  latestContributions: LiveDimensionLatestContribution[];
  maxAbsImpact: number;
  queryDurationMs: number;
  requestCount: number;
  warning?: string;
}

export interface LoadLiveDimensionMatrixOptions {
  scope: LiveDemoScope;
  source: Pick<LiveSourceSummary, 'maxDate' | 'maxFiscalYear'>;
  filter?: LiveDemoFilter | null;
  dimension: LiveDimensionDefinition;
  categories: string[];
  periods: LiveMonthlyPoint[];
  currentTotalImpact: number;
  appToken?: string;
  signal?: AbortSignal;
}

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

function buildUrl(select: string, where: string, group: string, limit = 5000) {
  const url = new URL(API_ENDPOINT);
  url.searchParams.set('$select', select);
  url.searchParams.set('$where', where);
  url.searchParams.set('$group', group);
  url.searchParams.set('$limit', String(limit));
  return url.toString();
}

async function fetchJson<T>(url: string, appToken = '', signal?: AbortSignal): Promise<T> {
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
    if (!response.ok) throw new Error(`Public API returned ${response.status}: ${(await response.text()).slice(0, 220)}`);
    return await response.json() as T;
  } catch (error) {
    if (controller.signal.aborted && signal?.aborted) throw new Error('Live dimension query was cancelled.');
    if (controller.signal.aborted) throw new Error('The live dimension heatmap query timed out after 45 seconds.');
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export function buildLiveDimensionMatrix({
  dimension,
  categories,
  periods,
  currentTotalImpact,
  rows,
}: {
  dimension: LiveDimensionDefinition;
  categories: string[];
  periods: LiveMonthlyPoint[];
  currentTotalImpact: number;
  rows: RawDimensionMonthRow[];
}): LiveDimensionMatrixResult {
  const periodMeta = periods.map((point) => ({
    key: point.key,
    label: point.label,
    periodStart: point.periodStart,
    periodEnd: point.periodEnd,
    partialPeriod: point.partialPeriod,
  }));
  const rowMap = new Map<string, { amount: number; transactions: number }>();
  for (const row of rows) {
    const category = String(row.value ?? '(missing)');
    const key = `${numberValue(row.fiscal_year)}-${String(numberValue(row.fiscal_month_number)).padStart(2, '0')}`;
    rowMap.set(`${category}\u0000${key}`, {
      amount: numberValue(row.amount),
      transactions: numberValue(row.transactions),
    });
  }

  const cells: LiveDimensionMatrixCell[] = [];
  for (const category of categories) {
    const actuals = periodMeta.map((period) => rowMap.get(`${category}\u0000${period.key}`)?.amount ?? 0);
    const globalMedian = median(actuals);
    periodMeta.forEach((period, index) => {
      const raw = rowMap.get(`${category}\u0000${period.key}`);
      const history = actuals.slice(Math.max(0, index - 6), index);
      let expected = history.length >= 3 ? median(history) : globalMedian;
      if (period.partialPeriod) {
        const end = new Date(period.periodEnd || period.periodStart);
        const start = new Date(period.periodStart);
        if (Number.isFinite(end.getTime()) && Number.isFinite(start.getTime())) {
          const daysInMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
          expected *= Math.min(1, Math.max(1, end.getUTCDate()) / daysInMonth);
        }
      }
      const actual = actuals[index];
      const variance = actual - expected;
      cells.push({
        category,
        periodKey: period.key,
        periodLabel: period.label,
        periodStart: period.periodStart,
        actual,
        expected,
        variance,
        businessImpact: -variance,
        variancePct: expected === 0 ? null : variance / Math.abs(expected),
        transactions: raw?.transactions ?? 0,
        partialPeriod: period.partialPeriod,
      });
    });
  }

  const latestPeriod = periodMeta.at(-1)?.key ?? '';
  const latestCells = cells.filter((cell) => cell.periodKey === latestPeriod);
  const latestContributions: LiveDimensionLatestContribution[] = latestCells
    .map((cell) => ({
      category: cell.category,
      actual: cell.actual,
      expected: cell.expected,
      businessImpact: cell.businessImpact,
      variancePct: cell.variancePct,
      transactions: cell.transactions,
    }))
    .sort((left, right) => Math.abs(right.businessImpact) - Math.abs(left.businessImpact));

  const topImpact = latestContributions.reduce((sum, contribution) => sum + contribution.businessImpact, 0);
  const otherImpact = currentTotalImpact - topImpact;
  if (Math.abs(otherImpact) > 0.005) {
    latestContributions.push({
      category: 'Other categories',
      actual: 0,
      expected: 0,
      businessImpact: otherImpact,
      variancePct: null,
      transactions: 0,
      isOther: true,
    });
  }

  return {
    dimension,
    categories,
    periods: periodMeta,
    cells,
    latestPeriod,
    latestContributions,
    maxAbsImpact: Math.max(1, ...cells.map((cell) => Math.abs(cell.businessImpact))),
    queryDurationMs: 0,
    requestCount: 1,
  };
}

export async function loadLiveDimensionMatrix(options: LoadLiveDimensionMatrixOptions): Promise<LiveDimensionMatrixResult> {
  const started = performance.now();
  const categories = options.categories.filter(Boolean).slice(0, 8);
  if (!categories.length) throw new Error('No top categories are available for the selected dimension.');

  const inClause = categories.map((category) => `'${escapeSoqlLiteral(category)}'`).join(',');
  const scopeWhere = buildScopeWhere(options.scope, options.source, options.filter);
  const where = [
    scopeWhere,
    `${options.dimension.field} is not null`,
    `${options.dimension.field} in (${inClause})`,
    'fiscal_year is not null',
    'fiscal_month_number is not null',
    'transaction_date is not null',
  ].join(' AND ');
  const select = `${options.dimension.field} as value, fiscal_year, fiscal_month_number, min(transaction_date) as period_start, max(transaction_date) as period_end, sum(dollar_amount) as amount, count(*) as transactions`;
  const group = `${options.dimension.field}, fiscal_year, fiscal_month_number`;
  const rows = await fetchJson<RawDimensionMonthRow[]>(buildUrl(select, where, group), options.appToken, options.signal);
  const matrix = buildLiveDimensionMatrix({
    dimension: options.dimension,
    categories,
    periods: options.periods,
    currentTotalImpact: options.currentTotalImpact,
    rows,
  });
  return {
    ...matrix,
    queryDurationMs: performance.now() - started,
    warning: rows.length ? undefined : 'The public source returned no monthly category rows for this dimension and scope.',
  };
}
