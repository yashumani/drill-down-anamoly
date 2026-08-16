import { applyPredicates } from './anomaly';
import type { DataRow, ImpactDirection, MetricPolarity, Predicate } from '../types';

export type TimeGrain = 'day' | 'week' | 'month' | 'quarter';
export type TimeWindow = '90d' | '8w' | '13w' | '15m' | '24m' | 'mtd' | 'qtd' | 'ytd' | 'all';
export type AggregationMethod = 'sum' | 'average' | 'period_end';
export type AlertSeverity = 'critical' | 'watch' | 'favorable' | 'normal';
export type ModelHealthStatus = 'healthy' | 'watch' | 'insufficient';

export interface TimeFieldCandidate {
  field: string;
  parseRate: number;
  distinctPeriods: number;
  minDate: string;
  maxDate: string;
  suggestedGrain: TimeGrain;
  confidence: number;
}

export interface FinanceTimePoint {
  key: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  actual: number;
  expected: number;
  variance: number;
  businessImpact: number;
  impactDirection: ImpactDirection;
  variancePct: number | null;
  rowCount: number;
  validRowCount: number;
  anomalyScore: number;
  materialityThreshold: number;
  material: boolean;
  alertSeverity: AlertSeverity;
  priorPeriodImpactChange: number | null;
  priorYearImpactChange: number | null;
}

export interface FinancePeriodSummary {
  label: string;
  start: string;
  end: string;
  actual: number;
  expected: number;
  variance: number;
  businessImpact: number;
  impactDirection: ImpactDirection;
  variancePct: number | null;
  pace: number | null;
  periodCount: number;
}

export interface RunRateProjection {
  asOf: string;
  elapsedDays: number;
  totalDays: number;
  projectedActual: number;
  projectedExpected: number;
  projectedBusinessImpact: number;
  impactDirection: ImpactDirection;
  confidence: 'medium' | 'low';
}

export interface TrendSummary {
  direction: 'improving' | 'worsening' | 'stable' | 'insufficient';
  recentAverageImpact: number;
  priorAverageImpact: number;
  change: number;
  description: string;
}

export interface ModelHealth {
  status: ModelHealthStatus;
  score: number;
  reasons: string[];
  periodCount: number;
  parseRate: number;
  validMeasureRate: number;
  expectedCoverage: number;
  seasonalityReady: boolean;
  driftScore: number;
}

export interface FinanceTimeSeriesResult {
  calculationVersion: string;
  runId: string;
  generatedAt: string;
  timeField: string;
  grain: TimeGrain;
  window: TimeWindow;
  aggregation: AggregationMethod;
  baselineMethod: 'plan' | 'rolling_median';
  fiscalYearStartMonth: number;
  materialityPercent: number;
  absoluteMateriality: number;
  points: FinanceTimePoint[];
  allPoints: FinanceTimePoint[];
  currentPeriod: FinanceTimePoint | null;
  priorPeriod: FinanceTimePoint | null;
  priorYearPeriod: FinanceTimePoint | null;
  mtd: FinancePeriodSummary | null;
  qtd: FinancePeriodSummary | null;
  ytd: FinancePeriodSummary | null;
  trailing: FinancePeriodSummary | null;
  runRate: RunRateProjection | null;
  trend: TrendSummary;
  forecastBias: number | null;
  volatility: number | null;
  modelHealth: ModelHealth;
  coverage: {
    scopedRows: number;
    parsedRows: number;
    unparsedRows: number;
    validMeasureRows: number;
    excludedMeasureRows: number;
    minDate: string;
    maxDate: string;
  };
  warnings: string[];
}

export interface BuildFinanceTimeSeriesOptions {
  rows: DataRow[];
  predicates?: Predicate[];
  actualKey: string;
  expectedKey?: string;
  timeField: string;
  grain: TimeGrain;
  window: TimeWindow;
  aggregation: AggregationMethod;
  metricPolarity: MetricPolarity;
  fiscalYearStartMonth?: number;
  materialityPercent?: number;
  absoluteMateriality?: number;
}

interface ParsedTime {
  date: Date;
  precision: TimeGrain;
}

interface PreparedEntry {
  row: DataRow;
  date: Date;
  actual: number;
  expected: number | null;
}

interface PeriodGroup {
  key: string;
  label: string;
  start: Date;
  end: Date;
  entries: PreparedEntry[];
}

const DAY_MS = 86_400_000;
const CALCULATION_VERSION = 'fpa-time-intelligence-v1.0.0';

function isMissing(value: unknown) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function robustScale(values: number[]) {
  if (values.length < 2) return 0;
  const center = median(values);
  const mad = median(values.map((value) => Math.abs(value - center)));
  return mad * 1.4826 || standardDeviation(values);
}

function parseIsoWeek(year: number, week: number) {
  if (week < 1 || week > 53) return null;
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const day = januaryFourth.getUTCDay() || 7;
  const monday = new Date(januaryFourth);
  monday.setUTCDate(januaryFourth.getUTCDate() - day + 1 + (week - 1) * 7);
  return monday;
}

export function parseTimeValue(value: unknown): ParsedTime | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return { date: new Date(value.getTime()), precision: 'day' };
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 1900 && value <= 2200) return { date: new Date(Date.UTC(value, 0, 1)), precision: 'quarter' };
    if (value > 10_000_000_000 && Number.isFinite(value)) return { date: new Date(value), precision: 'day' };
    return null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;

  let match = text.match(/^(19\d{2}|20\d{2}|21\d{2})[-/](0?[1-9]|1[0-2])$/);
  if (match) return { date: new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)), precision: 'month' };

  match = text.match(/^(19\d{2}|20\d{2}|21\d{2})[- ]?Q([1-4])$/i);
  if (match) return { date: new Date(Date.UTC(Number(match[1]), (Number(match[2]) - 1) * 3, 1)), precision: 'quarter' };

  match = text.match(/^(19\d{2}|20\d{2}|21\d{2})[- ]?W(\d{1,2})$/i);
  if (match) {
    const date = parseIsoWeek(Number(match[1]), Number(match[2]));
    return date ? { date, precision: 'week' } : null;
  }

  match = text.match(/^(19\d{2}|20\d{2}|21\d{2})$/);
  if (match) return { date: new Date(Date.UTC(Number(match[1]), 0, 1)), precision: 'quarter' };

  match = text.match(/^(19\d{2}|20\d{2}|21\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])/);
  if (match) {
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Number.isFinite(date.getTime()) ? { date, precision: 'day' } : null;
  }

  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  if (year < 1900 || year > 2200) return null;
  return { date, precision: 'day' };
}

function suggestedGrain(field: string, parsed: ParsedTime[]) {
  if (/quarter|fiscal.?q|(^|_)qtr/i.test(field)) return 'quarter' as const;
  if (/week|(^|_)wk/i.test(field)) return 'week' as const;
  if (/month|period|fiscal.?m/i.test(field)) return 'month' as const;
  if (/date|day|timestamp/i.test(field)) return 'day' as const;
  const precisions = parsed.reduce<Record<TimeGrain, number>>((output, item) => {
    output[item.precision] += 1;
    return output;
  }, { day: 0, week: 0, month: 0, quarter: 0 });
  return (Object.entries(precisions).sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'month') as TimeGrain;
}

export function detectTimeFields(rows: DataRow[]): TimeFieldCandidate[] {
  if (!rows.length) return [];
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const sample = rows.slice(0, 5000);
  return fields.flatMap((field) => {
    const present = sample.map((row) => row[field]).filter((value) => !isMissing(value));
    if (!present.length) return [];
    const parsed = present.map(parseTimeValue).filter((value): value is ParsedTime => value !== null);
    const parseRate = parsed.length / present.length;
    const distinct = new Set(parsed.map((item) => item.date.toISOString().slice(0, 10))).size;
    if (parseRate < 0.65 || distinct < 2) return [];
    const dates = parsed.map((item) => item.date.getTime()).sort((left, right) => left - right);
    const nameBoost = /date|day|week|month|quarter|period|fiscal|year/i.test(field) ? 0.12 : 0;
    const confidence = Math.min(1, parseRate * 0.82 + Math.min(0.12, distinct / 100) + nameBoost);
    return [{
      field,
      parseRate,
      distinctPeriods: distinct,
      minDate: new Date(dates[0]).toISOString(),
      maxDate: new Date(dates[dates.length - 1]).toISOString(),
      suggestedGrain: suggestedGrain(field, parsed),
      confidence,
    } satisfies TimeFieldCandidate];
  }).sort((left, right) => right.confidence - left.confidence || right.distinctPeriods - left.distinctPeriods);
}

function multiplier(polarity: MetricPolarity) {
  return polarity === 'higher_is_better' ? 1 : -1;
}

function direction(value: number): ImpactDirection {
  if (value > 0) return 'favorable';
  if (value < 0) return 'unfavorable';
  return 'neutral';
}

function startOfWeek(date: Date) {
  const output = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = output.getUTCDay() || 7;
  output.setUTCDate(output.getUTCDate() - day + 1);
  return output;
}

function fiscalYearStart(date: Date, fiscalYearStartMonth: number) {
  const month = Math.max(1, Math.min(12, fiscalYearStartMonth)) - 1;
  const year = date.getUTCMonth() >= month ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return new Date(Date.UTC(year, month, 1));
}

function fiscalQuarterStart(date: Date, fiscalYearStartMonth: number) {
  const yearStart = fiscalYearStart(date, fiscalYearStartMonth);
  const monthsSinceStart = (date.getUTCFullYear() - yearStart.getUTCFullYear()) * 12 + date.getUTCMonth() - yearStart.getUTCMonth();
  const output = new Date(yearStart);
  output.setUTCMonth(yearStart.getUTCMonth() + Math.floor(monthsSinceStart / 3) * 3);
  return output;
}

function periodBounds(date: Date, grain: TimeGrain, fiscalYearStartMonth: number) {
  if (grain === 'day') {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    return { start, end: new Date(start.getTime() + DAY_MS - 1), label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) };
  }
  if (grain === 'week') {
    const start = startOfWeek(date);
    return { start, end: new Date(start.getTime() + 7 * DAY_MS - 1), label: `Week of ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}` };
  }
  if (grain === 'month') {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - 1);
    return { start, end, label: start.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) };
  }
  const start = fiscalQuarterStart(date, fiscalYearStartMonth);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 1) - 1);
  const fiscalStart = fiscalYearStart(date, fiscalYearStartMonth);
  const quarter = Math.floor(((start.getUTCFullYear() - fiscalStart.getUTCFullYear()) * 12 + start.getUTCMonth() - fiscalStart.getUTCMonth()) / 3) + 1;
  const fiscalYear = fiscalYearStartMonth === 1 ? fiscalStart.getUTCFullYear() : fiscalStart.getUTCFullYear() + 1;
  return { start, end, label: `FY${fiscalYear} Q${quarter}` };
}

function aggregateEntries(entries: PreparedEntry[], method: AggregationMethod, useExpected: boolean) {
  if (!entries.length) return { actual: 0, expected: 0, validRowCount: 0 };
  let selected = entries;
  if (method === 'period_end') {
    const latest = Math.max(...entries.map((entry) => entry.date.getTime()));
    selected = entries.filter((entry) => entry.date.getTime() === latest);
  }
  const actualValues = selected.map((entry) => entry.actual);
  const expectedValues = selected.map((entry) => entry.expected).filter((value): value is number => value !== null);
  if (method === 'average') {
    return {
      actual: mean(actualValues),
      expected: useExpected ? mean(expectedValues) : 0,
      validRowCount: selected.length,
    };
  }
  return {
    actual: actualValues.reduce((sum, value) => sum + value, 0),
    expected: useExpected ? expectedValues.reduce((sum, value) => sum + value, 0) : 0,
    validRowCount: selected.length,
  };
}

function windowCutoff(latest: Date, window: TimeWindow, fiscalYearStartMonth: number) {
  if (window === 'all') return new Date(-8_640_000_000_000_000);
  if (window === 'mtd') return new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth(), 1));
  if (window === 'qtd') return fiscalQuarterStart(latest, fiscalYearStartMonth);
  if (window === 'ytd') return fiscalYearStart(latest, fiscalYearStartMonth);
  const cutoff = new Date(latest);
  if (window === '90d') cutoff.setUTCDate(cutoff.getUTCDate() - 89);
  if (window === '8w') cutoff.setUTCDate(cutoff.getUTCDate() - 7 * 7);
  if (window === '13w') cutoff.setUTCDate(cutoff.getUTCDate() - 12 * 7);
  if (window === '15m') cutoff.setUTCMonth(cutoff.getUTCMonth() - 14, 1);
  if (window === '24m') cutoff.setUTCMonth(cutoff.getUTCMonth() - 23, 1);
  return cutoff;
}

function summarize(points: FinanceTimePoint[], label: string, aggregation: AggregationMethod, metricPolarity: MetricPolarity): FinancePeriodSummary | null {
  if (!points.length) return null;
  let actual = 0;
  let expected = 0;
  if (aggregation === 'sum') {
    actual = points.reduce((sum, point) => sum + point.actual, 0);
    expected = points.reduce((sum, point) => sum + point.expected, 0);
  } else if (aggregation === 'average') {
    const totalRows = points.reduce((sum, point) => sum + point.validRowCount, 0) || 1;
    actual = points.reduce((sum, point) => sum + point.actual * point.validRowCount, 0) / totalRows;
    expected = points.reduce((sum, point) => sum + point.expected * point.validRowCount, 0) / totalRows;
  } else {
    const latest = points[points.length - 1];
    actual = latest.actual;
    expected = latest.expected;
  }
  const variance = actual - expected;
  const businessImpact = variance * multiplier(metricPolarity);
  return {
    label,
    start: points[0].periodStart,
    end: points[points.length - 1].periodEnd,
    actual,
    expected,
    variance,
    businessImpact,
    impactDirection: direction(businessImpact),
    variancePct: expected === 0 ? null : variance / Math.abs(expected),
    pace: expected === 0 ? null : actual / expected,
    periodCount: points.length,
  };
}

function trailingPeriodCount(grain: TimeGrain) {
  if (grain === 'day') return 365;
  if (grain === 'week') return 52;
  if (grain === 'quarter') return 4;
  return 12;
}

function trendSummary(points: FinanceTimePoint[]) : TrendSummary {
  if (points.length < 6) return { direction: 'insufficient', recentAverageImpact: 0, priorAverageImpact: 0, change: 0, description: 'At least six periods are needed to compare recent and prior momentum.' };
  const recent = points.slice(-3);
  const prior = points.slice(-6, -3);
  const recentAverageImpact = mean(recent.map((point) => point.businessImpact));
  const priorAverageImpact = mean(prior.map((point) => point.businessImpact));
  const change = recentAverageImpact - priorAverageImpact;
  const reference = Math.max(1, mean(points.slice(-6).map((point) => Math.abs(point.expected))) * 0.01);
  const directionValue = Math.abs(change) < reference ? 'stable' : change > 0 ? 'improving' : 'worsening';
  const description = directionValue === 'stable'
    ? 'Recent three-period business impact is broadly stable versus the prior three periods.'
    : `Recent three-period business impact is ${directionValue} versus the prior three periods.`;
  return { direction: directionValue, recentAverageImpact, priorAverageImpact, change, description };
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36).padStart(7, '0');
}

function modelHealth({
  periodCount,
  parseRate,
  validMeasureRate,
  expectedCoverage,
  grain,
  driftScore,
  hasExpected,
}: {
  periodCount: number;
  parseRate: number;
  validMeasureRate: number;
  expectedCoverage: number;
  grain: TimeGrain;
  driftScore: number;
  hasExpected: boolean;
}): ModelHealth {
  let score = 100;
  const reasons: string[] = [];
  if (periodCount < 4) {
    score -= 55;
    reasons.push('Fewer than four time periods are available; trend and anomaly signals are not stable.');
  } else if (periodCount < 8) {
    score -= 25;
    reasons.push('Fewer than eight periods are available; use trend and anomaly scores cautiously.');
  }
  if (parseRate < 0.9) {
    score -= 20;
    reasons.push(`${((1 - parseRate) * 100).toFixed(1)}% of scoped rows could not be assigned to a time period.`);
  }
  if (validMeasureRate < 0.95) {
    score -= 18;
    reasons.push(`${((1 - validMeasureRate) * 100).toFixed(1)}% of time-parsed rows were excluded because the measure was invalid.`);
  }
  if (hasExpected && expectedCoverage < 0.95) {
    score -= 18;
    reasons.push(`${((1 - expectedCoverage) * 100).toFixed(1)}% of otherwise usable rows were missing a valid plan/expected value.`);
  }
  if (driftScore >= 3) {
    score -= 10;
    reasons.push('Recent business-impact distribution differs materially from the prior period distribution.');
  }
  const seasonalityMinimum = grain === 'day' ? 180 : grain === 'week' ? 52 : grain === 'month' ? 18 : 8;
  const seasonalityReady = periodCount >= seasonalityMinimum;
  if (!seasonalityReady) reasons.push(`Seasonality modeling would need at least ${seasonalityMinimum} ${grain} periods; the current signal is descriptive rather than seasonal forecasting.`);
  const boundedScore = Math.max(0, Math.min(100, score));
  const status: ModelHealthStatus = periodCount < 4 ? 'insufficient' : boundedScore >= 80 ? 'healthy' : 'watch';
  if (!reasons.length) reasons.push('Time parsing, measure coverage, plan coverage, and period depth are within the automatic thresholds.');
  return { status, score: boundedScore, reasons, periodCount, parseRate, validMeasureRate, expectedCoverage, seasonalityReady, driftScore };
}

export function buildFinanceTimeSeries(options: BuildFinanceTimeSeriesOptions): FinanceTimeSeriesResult {
  const fiscalYearStartMonth = Math.max(1, Math.min(12, options.fiscalYearStartMonth ?? 1));
  const materialityPercent = Math.max(0, options.materialityPercent ?? 0.03);
  const absoluteMateriality = Math.max(0, options.absoluteMateriality ?? 0);
  const scopedRows = applyPredicates(options.rows, options.predicates ?? []);
  const prepared: PreparedEntry[] = [];
  let parsedRows = 0;
  let validActualRows = 0;
  let validExpectedRows = 0;
  const parsedDates: Date[] = [];

  for (const row of scopedRows) {
    const parsedTime = parseTimeValue(row[options.timeField]);
    if (!parsedTime) continue;
    parsedRows += 1;
    parsedDates.push(parsedTime.date);
    const actual = finiteNumber(row[options.actualKey]);
    if (actual === null) continue;
    validActualRows += 1;
    const expected = options.expectedKey ? finiteNumber(row[options.expectedKey]) : null;
    if (options.expectedKey && expected === null) continue;
    if (options.expectedKey) validExpectedRows += 1;
    prepared.push({ row, date: parsedTime.date, actual, expected });
  }

  const groups = new Map<string, PeriodGroup>();
  for (const entry of prepared) {
    const bounds = periodBounds(entry.date, options.grain, fiscalYearStartMonth);
    const key = bounds.start.toISOString();
    const group = groups.get(key) ?? { key, label: bounds.label, start: bounds.start, end: bounds.end, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }

  const orderedGroups = [...groups.values()].sort((left, right) => left.start.getTime() - right.start.getTime());
  const aggregates = orderedGroups.map((group) => ({
    group,
    ...aggregateEntries(group.entries, options.aggregation, Boolean(options.expectedKey)),
  }));
  const globalMedian = median(aggregates.map((item) => item.actual));
  const polarityMultiplier = multiplier(options.metricPolarity);

  const rawPoints = aggregates.map((item, index) => {
    const history = aggregates.slice(Math.max(0, index - 6), index).map((previous) => previous.actual);
    const expected = options.expectedKey ? item.expected : history.length >= 3 ? median(history) : globalMedian;
    const variance = item.actual - expected;
    const businessImpact = variance * polarityMultiplier;
    return {
      key: item.group.key,
      label: item.group.label,
      periodStart: item.group.start.toISOString(),
      periodEnd: item.group.end.toISOString(),
      actual: item.actual,
      expected,
      variance,
      businessImpact,
      impactDirection: direction(businessImpact),
      variancePct: expected === 0 ? null : variance / Math.abs(expected),
      rowCount: item.group.entries.length,
      validRowCount: item.validRowCount,
    };
  });

  const allPoints: FinanceTimePoint[] = rawPoints.map((point, index) => {
    const history = rawPoints.slice(Math.max(0, index - 12), index).map((previous) => previous.businessImpact);
    const scale = robustScale(history);
    const center = median(history);
    const anomalyScore = history.length >= 4 && scale > 0 ? Math.abs(point.businessImpact - center) / scale : 0;
    const materialityThreshold = Math.max(absoluteMateriality, Math.abs(point.expected) * materialityPercent);
    const material = Math.abs(point.businessImpact) >= materialityThreshold && materialityThreshold > 0;
    const alertSeverity: AlertSeverity = point.businessImpact < 0 && (Math.abs(point.businessImpact) >= materialityThreshold * 2 || anomalyScore >= 3)
      ? 'critical'
      : point.businessImpact < 0 && (material || anomalyScore >= 2)
        ? 'watch'
        : point.businessImpact > 0 && material
          ? 'favorable'
          : 'normal';
    const priorPeriod = rawPoints[index - 1];
    const priorYearDate = new Date(point.periodStart);
    priorYearDate.setUTCFullYear(priorYearDate.getUTCFullYear() - 1);
    const priorYearKey = periodBounds(priorYearDate, options.grain, fiscalYearStartMonth).start.toISOString();
    const priorYear = rawPoints.find((candidate) => candidate.key === priorYearKey);
    return {
      ...point,
      anomalyScore,
      materialityThreshold,
      material,
      alertSeverity,
      priorPeriodImpactChange: priorPeriod ? point.businessImpact - priorPeriod.businessImpact : null,
      priorYearImpactChange: priorYear ? point.businessImpact - priorYear.businessImpact : null,
    };
  });

  const latestDate = parsedDates.length ? new Date(Math.max(...parsedDates.map((date) => date.getTime()))) : new Date(0);
  const cutoff = windowCutoff(latestDate, options.window, fiscalYearStartMonth);
  const points = allPoints.filter((point) => new Date(point.periodStart).getTime() >= cutoff.getTime());
  const currentPeriod = allPoints[allPoints.length - 1] ?? null;
  const priorPeriod = allPoints[allPoints.length - 2] ?? null;
  let priorYearPeriod: FinanceTimePoint | null = null;
  if (currentPeriod) {
    const date = new Date(currentPeriod.periodStart);
    date.setUTCFullYear(date.getUTCFullYear() - 1);
    const priorYearKey = periodBounds(date, options.grain, fiscalYearStartMonth).start.toISOString();
    priorYearPeriod = allPoints.find((point) => point.key === priorYearKey) ?? null;
  }

  const monthStart = new Date(Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth(), 1));
  const quarterStart = fiscalQuarterStart(latestDate, fiscalYearStartMonth);
  const yearStart = fiscalYearStart(latestDate, fiscalYearStartMonth);
  const mtdPoints = allPoints.filter((point) => new Date(point.periodStart).getTime() >= monthStart.getTime());
  const qtdPoints = allPoints.filter((point) => new Date(point.periodStart).getTime() >= quarterStart.getTime());
  const ytdPoints = allPoints.filter((point) => new Date(point.periodStart).getTime() >= yearStart.getTime());
  const trailingCount = trailingPeriodCount(options.grain);
  const trailingPoints = allPoints.slice(-trailingCount);

  let runRate: RunRateProjection | null = null;
  if (options.aggregation === 'sum' && options.grain === 'day' && mtdPoints.length && latestDate.getUTCDate() < new Date(Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth() + 1, 0)).getUTCDate()) {
    const mtdSummary = summarize(mtdPoints, 'MTD', options.aggregation, options.metricPolarity);
    if (mtdSummary) {
      const elapsedDays = latestDate.getUTCDate();
      const totalDays = new Date(Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth() + 1, 0)).getUTCDate();
      const projectedActual = mtdSummary.actual / Math.max(elapsedDays, 1) * totalDays;
      const projectedExpected = mtdSummary.expected / Math.max(elapsedDays, 1) * totalDays;
      const projectedBusinessImpact = (projectedActual - projectedExpected) * polarityMultiplier;
      runRate = {
        asOf: latestDate.toISOString(),
        elapsedDays,
        totalDays,
        projectedActual,
        projectedExpected,
        projectedBusinessImpact,
        impactDirection: direction(projectedBusinessImpact),
        confidence: elapsedDays >= 10 ? 'medium' : 'low',
      };
    }
  }

  const recentForBias = allPoints.slice(-Math.min(12, allPoints.length));
  const expectedTotal = recentForBias.reduce((sum, point) => sum + Math.abs(point.expected), 0);
  const forecastBias = expectedTotal ? recentForBias.reduce((sum, point) => sum + point.variance, 0) / expectedTotal : null;
  const normalizedImpacts = recentForBias.map((point) => point.expected === 0 ? 0 : point.businessImpact / Math.abs(point.expected));
  const volatility = normalizedImpacts.length >= 2 ? standardDeviation(normalizedImpacts) : null;
  const half = Math.floor(recentForBias.length / 2);
  const priorRates = recentForBias.slice(0, half).map((point) => point.expected === 0 ? 0 : point.businessImpact / Math.abs(point.expected));
  const currentRates = recentForBias.slice(half).map((point) => point.expected === 0 ? 0 : point.businessImpact / Math.abs(point.expected));
  const driftScale = robustScale([...priorRates, ...currentRates]);
  const driftScore = priorRates.length && currentRates.length && driftScale > 0 ? Math.abs(mean(currentRates) - mean(priorRates)) / driftScale : 0;

  const parseRate = parsedRows / Math.max(scopedRows.length, 1);
  const validMeasureRate = prepared.length / Math.max(parsedRows, 1);
  const expectedCoverage = options.expectedKey ? validExpectedRows / Math.max(validActualRows, 1) : 1;
  const health = modelHealth({ periodCount: allPoints.length, parseRate, validMeasureRate, expectedCoverage, grain: options.grain, driftScore, hasExpected: Boolean(options.expectedKey) });
  const warnings: string[] = [];
  if (!options.expectedKey) warnings.push('No plan/expected measure is selected. Period expectations use a six-period rolling median with a global-median fallback.');
  if (options.aggregation === 'average') warnings.push('Average aggregation is unweighted. Finance ratios should use governed numerator/denominator definitions before production use.');
  if (options.aggregation === 'period_end') warnings.push('Period-end aggregation sums records on the latest available date in each period. Confirm that this matches the intended balance or headcount grain.');
  if (parseRate < 1) warnings.push(`${(100 - parseRate * 100).toFixed(1)}% of scoped rows could not be parsed using ${options.timeField}.`);
  if (allPoints.length < 12) warnings.push('Fewer than 12 periods are available, so long-term seasonality and rolling comparisons are limited.');
  if (!health.seasonalityReady) warnings.push('The current time depth is insufficient for reliable seasonal forecasting; anomaly scores use a robust rolling historical comparison instead.');

  const runPayload = JSON.stringify({
    calculationVersion: CALCULATION_VERSION,
    timeField: options.timeField,
    grain: options.grain,
    window: options.window,
    aggregation: options.aggregation,
    actualKey: options.actualKey,
    expectedKey: options.expectedKey ?? '',
    metricPolarity: options.metricPolarity,
    predicates: options.predicates ?? [],
    rowCount: scopedRows.length,
    periodCount: allPoints.length,
    lastPoint: currentPeriod ? [currentPeriod.key, currentPeriod.actual, currentPeriod.expected] : null,
  });

  return {
    calculationVersion: CALCULATION_VERSION,
    runId: `fin-${hashString(runPayload)}`,
    generatedAt: new Date().toISOString(),
    timeField: options.timeField,
    grain: options.grain,
    window: options.window,
    aggregation: options.aggregation,
    baselineMethod: options.expectedKey ? 'plan' : 'rolling_median',
    fiscalYearStartMonth,
    materialityPercent,
    absoluteMateriality,
    points,
    allPoints,
    currentPeriod,
    priorPeriod,
    priorYearPeriod,
    mtd: summarize(mtdPoints, 'MTD', options.aggregation, options.metricPolarity),
    qtd: summarize(qtdPoints, 'QTD', options.aggregation, options.metricPolarity),
    ytd: summarize(ytdPoints, 'YTD', options.aggregation, options.metricPolarity),
    trailing: summarize(trailingPoints, options.grain === 'month' ? 'Trailing 12 months' : `Trailing ${trailingCount} periods`, options.aggregation, options.metricPolarity),
    runRate,
    trend: trendSummary(allPoints),
    forecastBias,
    volatility,
    modelHealth: health,
    coverage: {
      scopedRows: scopedRows.length,
      parsedRows,
      unparsedRows: Math.max(0, scopedRows.length - parsedRows),
      validMeasureRows: prepared.length,
      excludedMeasureRows: Math.max(0, parsedRows - prepared.length),
      minDate: parsedDates.length ? new Date(Math.min(...parsedDates.map((date) => date.getTime()))).toISOString() : '',
      maxDate: parsedDates.length ? latestDate.toISOString() : '',
    },
    warnings,
  };
}
