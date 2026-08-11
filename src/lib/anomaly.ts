import type { CategoryContribution, DataRow, DimensionScore, ImpactDirection, InteractionSegment, InvestigationResult, MetricPolarity, Predicate } from '../types';

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

export function applyPredicates(rows: DataRow[], predicates: Predicate[]) {
  return rows.filter((row) => predicates.every((predicate) => categoryValue(row[predicate.dimension]) === predicate.value));
}

interface PreparedRow {
  row: DataRow;
  actual: number;
  expected: number;
  residual: number;
}

function prepareRows(rows: DataRow[], actualKey: string, expectedKey?: string) {
  const actualRows = rows
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
  };
}

function groupDimension(prepared: PreparedRow[], dimension: string, scale: number, metricPolarity: MetricPolarity): CategoryContribution[] {
  const multiplier = polarityMultiplier(metricPolarity);
  const groups = new Map<string, { count: number; actual: number; expected: number; residuals: number[] }>();
  for (const item of prepared) {
    const key = categoryValue(item.row[dimension]);
    const current = groups.get(key) ?? { count: 0, actual: 0, expected: 0, residuals: [] };
    current.count += 1;
    current.actual += item.actual;
    current.expected += item.expected;
    current.residuals.push(item.residual);
    groups.set(key, current);
  }

  const raw = [...groups.entries()].map(([value, group]) => {
    const variance = group.actual - group.expected;
    const businessImpact = variance * multiplier;
    const support = group.count / Math.max(prepared.length, 1);
    const standardizedResidual = Math.abs(mean(group.residuals)) / Math.max(scale, 1e-9);
    const supportWeight = Math.min(1, Math.sqrt(support / 0.05));
    return {
      dimension,
      value,
      count: group.count,
      support,
      actual: group.actual,
      expected: group.expected,
      variance,
      businessImpact,
      impactDirection: impactDirection(businessImpact),
      variancePerRow: variance / Math.max(group.count, 1),
      businessImpactPerRow: businessImpact / Math.max(group.count, 1),
      shareOfAbsVariance: 0,
      surprise: Math.min(1, standardizedResidual / 3) * supportWeight,
      standardizedResidual,
    } satisfies CategoryContribution;
  });

  const totalAbs = raw.reduce((sum, category) => sum + Math.abs(category.businessImpact), 0) || 1;
  return raw
    .map((category) => ({ ...category, shareOfAbsVariance: Math.abs(category.businessImpact) / totalAbs }))
    .sort((a, b) => Math.abs(b.businessImpact) - Math.abs(a.businessImpact));
}

function scoreDimension(prepared: PreparedRow[], dimension: string, scale: number, metricPolarity: MetricPolarity): DimensionScore {
  const categories = groupDimension(prepared, dimension, scale, metricPolarity);
  const rowGrossMovement = prepared.reduce((sum, item) => sum + Math.abs(item.residual), 0) || 1;
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
    .flatMap((score) => score.categories.filter((category) => category.support >= 0.015 && category.count >= 20).slice(0, 2).map((category) => ({ dimension: score.dimension, value: category.value })));
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

function findInteractions(prepared: PreparedRow[], scores: DimensionScore[], metricPolarity: MetricPolarity): InteractionSegment[] {
  const multiplier = polarityMultiplier(metricPolarity);
  const candidates = interactionCandidates(scores);
  const all = [...combinations(candidates, 2), ...combinations(candidates, 3)];
  const unique = new Map<string, InteractionSegment>();
  const globalMeanAbsResidual = mean(prepared.map((item) => Math.abs(item.residual))) || 1;
  const minimumSupport = Math.max(20, prepared.length * 0.015);

  for (const predicates of all) {
    if (new Set(predicates.map((predicate) => predicate.dimension)).size !== predicates.length) continue;
    const subset = prepared.filter((item) => predicates.every((predicate) => categoryValue(item.row[predicate.dimension]) === predicate.value));
    if (subset.length < minimumSupport) continue;
    const actual = subset.reduce((sum, item) => sum + item.actual, 0);
    const expected = subset.reduce((sum, item) => sum + item.expected, 0);
    const variance = actual - expected;
    const businessImpact = variance * multiplier;
    const variancePerRow = variance / subset.length;
    const businessImpactPerRow = businessImpact / subset.length;
    const lift = Math.abs(variancePerRow) / globalMeanAbsResidual;
    const support = subset.length / Math.max(prepared.length, 1);
    const score = Math.abs(businessImpact) * Math.sqrt(support) * Math.log1p(lift);
    const key = [...predicates]
      .sort((a, b) => a.dimension.localeCompare(b.dimension))
      .map((predicate) => `${predicate.dimension}=${predicate.value}`)
      .join('|');
    unique.set(key, { predicates, count: subset.length, support, actual, expected, variance, businessImpact, impactDirection: impactDirection(businessImpact), variancePerRow, businessImpactPerRow, lift, score });
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
): InvestigationResult {
  const filteredRows = applyPredicates(sourceRows, predicates);
  const { prepared, excludedMeasureRows } = prepareRows(filteredRows, actualKey, expectedKey);
  const residuals = prepared.map((item) => item.residual);
  const scale = robustScale(residuals);
  const actual = prepared.reduce((sum, item) => sum + item.actual, 0);
  const expected = prepared.reduce((sum, item) => sum + item.expected, 0);
  const variance = actual - expected;
  const businessImpact = variance * polarityMultiplier(metricPolarity);
  const warnings: string[] = [];

  if (!expectedKey) warnings.push('No target or expected measure is selected. The app is using a robust median baseline, which is exploratory and not a time-series forecast.');
  if (metricPolarity === 'lower_is_better') warnings.push('Metric direction is set to lower-is-better. Positive raw variance is treated as unfavorable business impact.');
  if (excludedMeasureRows > 0) warnings.push(`${excludedMeasureRows.toLocaleString()} rows were excluded because the selected measure${expectedKey ? ' or comparison' : ''} was missing or not numeric.`);
  if (!prepared.length) warnings.push('No valid measure rows remain in the current scope.');
  if (expected === 0 && prepared.length) warnings.push('The comparison total is zero, so percentage variance is not available.');

  const dimensionScores = prepared.length
    ? dimensions
      .filter((dimension) => !predicates.some((predicate) => predicate.dimension === dimension))
      .map((dimension) => scoreDimension(prepared, dimension, scale, metricPolarity))
      .filter((score) => score.distinctCount > 1)
      .sort((a, b) => b.score - a.score)
    : [];

  return {
    rowCount: filteredRows.length,
    validRowCount: prepared.length,
    excludedMeasureRows,
    actual,
    expected,
    variance,
    businessImpact,
    impactDirection: impactDirection(businessImpact),
    variancePct: expected === 0 ? null : variance / Math.abs(expected),
    anomalyScore: prepared.length ? Math.abs(mean(residuals)) / Math.max(scale, 1e-9) : 0,
    residualScale: scale,
    baselineMethod: expectedKey ? 'target' : 'robust-median',
    metricPolarity,
    dimensionsScanned: dimensionScores.length,
    dimensionScores,
    interactions: prepared.length ? findInteractions(prepared, dimensionScores, metricPolarity) : [],
    warnings,
  };
}
