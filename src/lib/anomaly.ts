import type {
  AttributionAggregation,
  AttributionBasis,
  CategoryContribution,
  DataRow,
  DimensionScore,
  ImpactDirection,
  InteractionSegment,
  InvestigationResult,
  MetricPolarity,
  Predicate,
} from '../types';

const CALCULATION_VERSION = 'fpa-driver-attribution-v2.0.0';

export interface InvestigationOptions {
  aggregationMethod?: AttributionAggregation;
  timeField?: string;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function isMissing(value: unknown) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function categoryValue(value: unknown) {
  return isMissing(value) ? '(missing)' : String(value).trim();
}

function polarityMultiplier(metricPolarity: MetricPolarity) {
  return metricPolarity === 'higher_is_better' ? 1 : -1;
}

function impactDirection(value: number): ImpactDirection {
  if (value > 0) return 'favorable';
  if (value < 0) return 'unfavorable';
  return 'neutral';
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

function robustScale(values: number[]) {
  if (!values.length) return 1;
  const center = median(values);
  const mad = median(values.map((value) => Math.abs(value - center)));
  return mad * 1.4826 || standardDeviation(values) || 1;
}

function parseTime(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value) && value > 10_000_000_000) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function applyPredicates(rows: DataRow[], predicates: Predicate[]) {
  return rows.filter((row) => predicates.every((predicate) => categoryValue(row[predicate.dimension]) === predicate.value));
}

interface PreparedRow {
  row: DataRow;
  actual: number;
  expected: number;
  residual: number;
}

interface PreparedPopulation {
  prepared: PreparedRow[];
  excludedMeasureRows: number;
  baseline: number;
  populationDate?: string;
  periodEndFallback: boolean;
}

function selectPeriodEndRows(rows: DataRow[], timeField?: string) {
  if (!timeField) return { rows, fallback: true as const, populationDate: undefined };
  const parsed = rows
    .map((row) => ({ row, timestamp: parseTime(row[timeField]) }))
    .filter((item): item is { row: DataRow; timestamp: number } => item.timestamp !== null);
  if (!parsed.length) return { rows, fallback: true as const, populationDate: undefined };
  const latest = Math.max(...parsed.map((item) => item.timestamp));
  const selected = parsed.filter((item) => item.timestamp === latest).map((item) => item.row);
  return {
    rows: selected,
    fallback: false as const,
    populationDate: new Date(latest).toISOString(),
  };
}

function prepareRows(
  rows: DataRow[],
  actualKey: string,
  expectedKey: string | undefined,
  aggregationMethod: AttributionAggregation,
  timeField?: string,
): PreparedPopulation {
  const selected = aggregationMethod === 'period_end' ? selectPeriodEndRows(rows, timeField) : { rows, fallback: false as const, populationDate: undefined };
  const actualRows = selected.rows
    .map((row) => ({ row, actual: finiteNumber(row[actualKey]) }))
    .filter((item): item is { row: DataRow; actual: number } => item.actual !== null);
  const baseline = expectedKey ? null : median(actualRows.map((item) => item.actual));
  const prepared: PreparedRow[] = [];

  for (const item of actualRows) {
    const expected = expectedKey ? finiteNumber(item.row[expectedKey]) : baseline;
    if (expected === null) continue;
    prepared.push({ row: item.row, actual: item.actual, expected, residual: item.actual - expected });
  }

  return {
    prepared,
    excludedMeasureRows: rows.length - prepared.length,
    baseline: baseline ?? 0,
    populationDate: selected.populationDate,
    periodEndFallback: selected.fallback,
  };
}

function attributionBasis(aggregationMethod: AttributionAggregation): AttributionBasis {
  if (aggregationMethod === 'average') return 'support_weighted_average';
  if (aggregationMethod === 'period_end') return 'latest_period_total';
  return 'total';
}

function aggregatePrepared(prepared: PreparedRow[], aggregationMethod: AttributionAggregation) {
  if (!prepared.length) return { actual: 0, expected: 0, variance: 0 };
  if (aggregationMethod === 'average') {
    const actual = mean(prepared.map((item) => item.actual));
    const expected = mean(prepared.map((item) => item.expected));
    return { actual, expected, variance: actual - expected };
  }
  const actual = prepared.reduce((sum, item) => sum + item.actual, 0);
  const expected = prepared.reduce((sum, item) => sum + item.expected, 0);
  return { actual, expected, variance: actual - expected };
}

function groupDimension(
  prepared: PreparedRow[],
  dimension: string,
  scale: number,
  metricPolarity: MetricPolarity,
  aggregationMethod: AttributionAggregation,
): CategoryContribution[] {
  const multiplier = polarityMultiplier(metricPolarity);
  const basis = attributionBasis(aggregationMethod);
  const groups = new Map<string, { count: number; actual: number[]; expected: number[]; residuals: number[] }>();
  for (const item of prepared) {
    const key = categoryValue(item.row[dimension]);
    const current = groups.get(key) ?? { count: 0, actual: [], expected: [], residuals: [] };
    current.count += 1;
    current.actual.push(item.actual);
    current.expected.push(item.expected);
    current.residuals.push(item.residual);
    groups.set(key, current);
  }

  const raw = [...groups.entries()].map(([value, group]) => {
    const support = group.count / Math.max(prepared.length, 1);
    const actual = aggregationMethod === 'average' ? mean(group.actual) : group.actual.reduce((sum, item) => sum + item, 0);
    const expected = aggregationMethod === 'average' ? mean(group.expected) : group.expected.reduce((sum, item) => sum + item, 0);
    const variance = actual - expected;
    const weightedVariance = aggregationMethod === 'average' ? variance * support : variance;
    const businessImpact = weightedVariance * multiplier;
    const standardizedResidual = Math.abs(mean(group.residuals)) / Math.max(scale, 1e-9);
    const supportWeight = Math.min(1, Math.sqrt(support / 0.05));
    return {
      dimension,
      value,
      count: group.count,
      support,
      actual,
      expected,
      variance,
      businessImpact,
      impactDirection: impactDirection(businessImpact),
      variancePerRow: mean(group.residuals),
      businessImpactPerRow: mean(group.residuals) * multiplier,
      shareOfAbsVariance: 0,
      surprise: Math.min(1, standardizedResidual / 3) * supportWeight,
      standardizedResidual,
      attributionBasis: basis,
    } satisfies CategoryContribution;
  });

  const totalAbs = raw.reduce((sum, category) => sum + Math.abs(category.businessImpact), 0) || 1;
  return raw
    .map((category) => ({ ...category, shareOfAbsVariance: Math.abs(category.businessImpact) / totalAbs }))
    .sort((a, b) => Math.abs(b.businessImpact) - Math.abs(a.businessImpact));
}

function scoreDimension(
  prepared: PreparedRow[],
  dimension: string,
  scale: number,
  metricPolarity: MetricPolarity,
  aggregationMethod: AttributionAggregation,
): DimensionScore {
  const categories = groupDimension(prepared, dimension, scale, metricPolarity, aggregationMethod);
  const rowGrossMovement = aggregationMethod === 'average'
    ? mean(prepared.map((item) => Math.abs(item.residual))) || 1
    : prepared.reduce((sum, item) => sum + Math.abs(item.residual), 0) || 1;
  const groupedGrossMovement = categories.reduce((sum, category) => sum + Math.abs(category.businessImpact), 0);
  const impact = Math.min(1, groupedGrossMovement / rowGrossMovement);
  const surprise = categories.reduce((sum, category) => sum + category.surprise * category.shareOfAbsVariance, 0);
  const concentration = categories.slice(0, 3).reduce((sum, category) => sum + category.shareOfAbsVariance, 0);
  const minimumSupport = Math.max(20, prepared.length * 0.015);
  const supportedGross = categories
    .filter((category) => category.count >= minimumSupport)
    .reduce((sum, category) => sum + Math.abs(category.businessImpact), 0);
  const supportQuality = groupedGrossMovement ? supportedGross / groupedGrossMovement : 0;
  const cardinalityPenalty = 1 / (1 + Math.max(0, categories.length - 12) / 35);
  const score = 100 * (
    0.5 * impact
    + 0.22 * surprise
    + 0.18 * concentration
    + 0.1 * supportQuality
  ) * cardinalityPenalty;
  const topCategory = categories.find((category) => category.count >= minimumSupport) ?? categories[0] ?? null;

  return {
    dimension,
    score: Math.max(0, Math.min(100, score)),
    impact,
    surprise,
    concentration,
    supportQuality,
    cardinalityPenalty,
    distinctCount: categories.length,
    topCategory,
    categories,
  };
}

function interactionCandidates(scores: DimensionScore[], limitDimensions = 8) {
  return scores
    .slice(0, limitDimensions)
    .flatMap((score) => score.categories
      .filter((category) => category.support >= 0.015 && category.count >= 20)
      .slice(0, 2)
      .map((category) => ({ dimension: score.dimension, value: category.value })));
}

function combinations<T>(values: T[], size: number): T[][] {
  const output: T[][] = [];
  function walk(start: number, selected: T[]) {
    if (selected.length === size) {
      output.push([...selected]);
      return;
    }
    for (let index = start; index < values.length; index += 1) walk(index + 1, [...selected, values[index]]);
  }
  walk(0, []);
  return output;
}

function findInteractions(
  prepared: PreparedRow[],
  scores: DimensionScore[],
  metricPolarity: MetricPolarity,
  aggregationMethod: AttributionAggregation,
): InteractionSegment[] {
  const multiplier = polarityMultiplier(metricPolarity);
  const basis = attributionBasis(aggregationMethod);
  const candidates = interactionCandidates(scores);
  const all = [...combinations(candidates, 2), ...combinations(candidates, 3)];
  const unique = new Map<string, InteractionSegment>();
  const globalMeanAbsResidual = mean(prepared.map((item) => Math.abs(item.residual))) || 1;
  const minimumSupport = Math.max(20, prepared.length * 0.015);

  for (const predicates of all) {
    if (new Set(predicates.map((predicate) => predicate.dimension)).size !== predicates.length) continue;
    const subset = prepared.filter((item) => predicates.every((predicate) => categoryValue(item.row[predicate.dimension]) === predicate.value));
    if (subset.length < minimumSupport) continue;
    const support = subset.length / Math.max(prepared.length, 1);
    const aggregate = aggregatePrepared(subset, aggregationMethod);
    const weightedVariance = aggregationMethod === 'average' ? aggregate.variance * support : aggregate.variance;
    const businessImpact = weightedVariance * multiplier;
    const variancePerRow = mean(subset.map((item) => item.residual));
    const businessImpactPerRow = variancePerRow * multiplier;
    const lift = Math.abs(variancePerRow) / globalMeanAbsResidual;
    const score = Math.abs(businessImpact) * Math.sqrt(support) * Math.log1p(lift);
    const key = [...predicates]
      .sort((a, b) => a.dimension.localeCompare(b.dimension))
      .map((predicate) => `${predicate.dimension}=${predicate.value}`)
      .join('|');
    unique.set(key, {
      predicates,
      count: subset.length,
      support,
      actual: aggregate.actual,
      expected: aggregate.expected,
      variance: aggregate.variance,
      businessImpact,
      impactDirection: impactDirection(businessImpact),
      variancePerRow,
      businessImpactPerRow,
      lift,
      score,
      attributionBasis: basis,
    });
  }

  return [...unique.values()].sort((a, b) => b.score - a.score).slice(0, 12);
}

export function investigate(
  sourceRows: DataRow[],
  dimensions: string[],
  actualKey: string,
  expectedKey: string | undefined,
  predicates: Predicate[] = [],
  metricPolarity: MetricPolarity = 'higher_is_better',
  options: InvestigationOptions = {},
): InvestigationResult {
  const aggregationMethod = options.aggregationMethod ?? 'sum';
  const filteredRows = applyPredicates(sourceRows, predicates);
  const population = prepareRows(filteredRows, actualKey, expectedKey, aggregationMethod, options.timeField);
  const { prepared, excludedMeasureRows } = population;
  const residuals = prepared.map((item) => item.residual);
  const scale = robustScale(residuals);
  const aggregate = aggregatePrepared(prepared, aggregationMethod);
  const businessImpact = aggregate.variance * polarityMultiplier(metricPolarity);
  const warnings: string[] = [];

  if (!expectedKey) warnings.push('No target or expected measure is selected. The app is using a robust median baseline, which is exploratory and not a time-series forecast.');
  if (metricPolarity === 'lower_is_better') warnings.push('Metric direction is set to lower-is-better. Positive raw variance is treated as unfavorable business impact.');
  if (aggregationMethod === 'average') warnings.push('Average-metric driver contributions are support-weighted so that category contributions reconcile to the selected-scope average variance.');
  if (aggregationMethod === 'period_end' && population.periodEndFallback) warnings.push('Period-end attribution could not identify a valid latest date. The selected rows were used as a fallback; confirm the time field before relying on the driver result.');
  if (aggregationMethod === 'period_end' && population.populationDate) warnings.push(`Period-end attribution uses records at ${population.populationDate.slice(0, 10)}.`);
  if (excludedMeasureRows > 0) warnings.push(`${excludedMeasureRows.toLocaleString()} rows were excluded because the selected measure${expectedKey ? ' or comparison' : ''} was missing or not numeric, or because they were outside the selected period-end population.`);
  if (!prepared.length) warnings.push('No valid measure rows remain in the current scope.');
  if (aggregate.expected === 0 && prepared.length) warnings.push('The comparison total is zero, so percentage variance is not available.');

  const dimensionScores = prepared.length
    ? dimensions
      .filter((dimension) => !predicates.some((predicate) => predicate.dimension === dimension))
      .map((dimension) => scoreDimension(prepared, dimension, scale, metricPolarity, aggregationMethod))
      .filter((score) => score.distinctCount > 1)
      .sort((a, b) => b.score - a.score)
    : [];

  const generatedAt = new Date().toISOString();
  const runId = `drv-${stableHash(JSON.stringify({
    calculationVersion: CALCULATION_VERSION,
    rows: filteredRows.length,
    valid: prepared.length,
    actualKey,
    expectedKey: expectedKey ?? '',
    predicates,
    metricPolarity,
    aggregationMethod,
    timeField: options.timeField ?? '',
    actual: aggregate.actual,
    expected: aggregate.expected,
  }))}`;

  return {
    calculationVersion: CALCULATION_VERSION,
    runId,
    generatedAt,
    rowCount: filteredRows.length,
    validRowCount: prepared.length,
    excludedMeasureRows,
    actual: aggregate.actual,
    expected: aggregate.expected,
    variance: aggregate.variance,
    businessImpact,
    impactDirection: impactDirection(businessImpact),
    variancePct: aggregate.expected === 0 ? null : aggregate.variance / Math.abs(aggregate.expected),
    anomalyScore: prepared.length ? Math.abs(mean(residuals)) / Math.max(scale, 1e-9) : 0,
    residualScale: scale,
    baselineMethod: expectedKey ? 'target' : 'robust-median',
    metricPolarity,
    aggregationMethod,
    attributionBasis: attributionBasis(aggregationMethod),
    attributionReconciles: aggregationMethod !== 'period_end' || !population.periodEndFallback,
    attributionPopulationDate: population.populationDate,
    dimensionsScanned: dimensionScores.length,
    dimensionScores,
    interactions: prepared.length ? findInteractions(prepared, dimensionScores, metricPolarity, aggregationMethod) : [],
    warnings,
  };
}
