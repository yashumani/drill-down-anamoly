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
const OTHER_CATEGORY = 'Other categories';

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
  benchmarkDescription: string;
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

function cell({
  category,
  period,
  actual,
  expected,
  transactions,
}: {
  category: string;
  period: LiveMonthlyPoint;
  actual: number;
  expected: number;
  transactions: number;
}): LiveDimensionMatrixCell {
  const variance = actual - expected;
  return {
    category,
    periodKey: period.key,
    periodLabel: period.label,
    periodStart: period.periodStart,
    actual,
    expected,
    variance,
    businessImpact: -variance,
    variancePct: expected === 0 ? null : variance / Math.abs(expected),
    transactions,
    partialPeriod: period.partialPeriod,
  };
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

  const topCells: LiveDimensionMatrixCell[] = [];
  for (const category of categories) {
    const actuals = periods.map((period) => rowMap.get(`${category}\u0000${period.key}`)?.amount ?? 0);
    const totalCategoryActual = actuals.reduce((sum, value) => sum + value, 0);
    const totalScopeActual = periods.reduce((sum, period) => sum + period.actual, 0);
    const globalShare = totalScopeActual === 0 ? 0 : totalCategoryActual / totalScopeActual;

    periods.forEach((period, index) => {
      const historyShares = periods
        .slice(Math.max(0, index - 6), index)
        .map((historicalPeriod, historyIndex) => {
          const actualIndex = Math.max(0, index - 6) + historyIndex;
          return historicalPeriod.actual === 0 ? null : actuals[actualIndex] / historicalPeriod.actual;
        })
        .filter((value): value is number => value !== null && Number.isFinite(value));
      const expectedShare = historyShares.length >= 3 ? median(historyShares) : globalShare;
      const raw = rowMap.get(`${category}\u0000${period.key}`);
      topCells.push(cell({
        category,
        period,
        actual: actuals[index],
        expected: period.expected * expectedShare,
        transactions: raw?.transactions ?? 0,
      }));
    });
  }

  const cells = [...topCells];
  for (const period of periods) {
    const periodTopCells = topCells.filter((item) => item.periodKey === period.key);
    const topActual = periodTopCells.reduce((sum, item) => sum + item.actual, 0);
    const topExpected = periodTopCells.reduce((sum, item) => sum + item.expected, 0);
    const topTransactions = periodTopCells.reduce((sum, item) => sum + item.transactions, 0);
    cells.push(cell({
      category: OTHER_CATEGORY,
      period,
      actual: period.actual - topActual,
      expected: period.expected - topExpected,
      transactions: Math.max(0, period.transactions - topTransactions),
    }));
  }

  const matrixCategories = [...categories, OTHER_CATEGORY];
  const latestPeriod = periodMeta.at(-1)?.key ?? '';
  const latestCells = cells.filter((item) => item.periodKey === latestPeriod);
  const latestContributions: LiveDimensionLatestContribution[] = latestCells
    .map((item) => ({
      category: item.category,
      actual: item.actual,
      expected: item.expected,
      businessImpact: item.businessImpact,
      variancePct: item.variancePct,
      transactions: item.transactions,
      isOther: item.category === OTHER_CATEGORY,
    }))
    .sort((left, right) => Math.abs(right.businessImpact) - Math.abs(left.businessImpact));

  const reconciledImpact = latestContributions.reduce((sum, contribution) => sum + contribution.businessImpact, 0);
  const tolerance = Math.max(0.01, Math.abs(currentTotalImpact) * 1e-9);
  const warning = Math.abs(reconciledImpact - currentTotalImpact) > tolerance
    ? `The dimension waterfall differs from the selected-scope latest impact by ${Math.abs(reconciledImpact - currentTotalImpact).toFixed(2)} because the public monthly result and category matrix were returned from separate live queries.`
    : undefined;

  return {
    dimension,
    categories: matrixCategories,
    periods: periodMeta,
    cells,
    latestPeriod,
    latestContributions,
    maxAbsImpact: Math.max(1, ...cells.map((item) => Math.abs(item.businessImpact))),
    queryDurationMs: 0,
    requestCount: 1,
    benchmarkDescription: 'The total rolling benchmark is allocated to each category using its median share of selected-scope spend over the preceding six periods; Other categories is the exact residual.',
    warning,
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
    warning: matrix.warning ?? (rows.length ? undefined : 'The public source returned no monthly category rows for this dimension and scope.'),
  };
}
