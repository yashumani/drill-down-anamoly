import type { CategoryContribution, DataRow, DimensionScore, InteractionSegment, InvestigationResult, Predicate } from '../types';

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

function mean(values: number[]) {
  return values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
}

function std(values: number[]) {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2))) || 1;
}

export function applyPredicates(rows: DataRow[], predicates: Predicate[]) {
  return rows.filter((row) => predicates.every((p) => String(row[p.dimension]) === p.value));
}

function groupDimension(rows: DataRow[], dimension: string, actualKey: string, expectedKey?: string): CategoryContribution[] {
  const groups = new Map<string, { count: number; actual: number; expected: number; residuals: number[] }>();
  const globalActualMean = mean(rows.map((r) => num(r[actualKey])));
  for (const row of rows) {
    const key = String(row[dimension] ?? '(null)');
    const actual = num(row[actualKey]);
    const expected = expectedKey ? num(row[expectedKey]) : globalActualMean;
    const current = groups.get(key) ?? { count: 0, actual: 0, expected: 0, residuals: [] };
    current.count += 1;
    current.actual += actual;
    current.expected += expected;
    current.residuals.push(actual - expected);
    groups.set(key, current);
  }
  const totalAbs = Array.from(groups.values()).reduce((s, g) => s + Math.abs(g.actual - g.expected), 0) || 1;
  const residualStd = std(rows.map((r) => num(r[actualKey]) - (expectedKey ? num(r[expectedKey]) : globalActualMean)));
  return Array.from(groups.entries()).map(([value, g]) => {
    const variance = g.actual - g.expected;
    const surprise = Math.min(1, Math.abs(mean(g.residuals)) / residualStd / 3);
    return {
      dimension,
      value,
      count: g.count,
      actual: g.actual,
      expected: g.expected,
      variance,
      shareOfAbsVariance: Math.abs(variance) / totalAbs,
      surprise,
    };
  }).sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
}

function scoreDimension(rows: DataRow[], dimension: string, actualKey: string, expectedKey?: string): DimensionScore {
  const categories = groupDimension(rows, dimension, actualKey, expectedKey);
  const totalAbs = categories.reduce((s, c) => s + Math.abs(c.variance), 0);
  const totalExpected = Math.abs(categories.reduce((s, c) => s + c.expected, 0)) || 1;
  const impact = Math.min(1, totalAbs / totalExpected);
  const surprise = categories.reduce((s, c) => s + c.surprise * c.shareOfAbsVariance, 0);
  const concentration = categories.slice(0, 3).reduce((s, c) => s + c.shareOfAbsVariance, 0);
  const supportPenalty = Math.min(1, rows.length / 250);
  const score = 100 * (0.42 * sigmoid(impact * 8) + 0.28 * surprise + 0.2 * concentration + 0.1 * supportPenalty);
  return {
    dimension,
    score,
    impact,
    surprise,
    concentration,
    distinctCount: categories.length,
    topCategory: categories[0] ?? null,
    categories,
  };
}

function interactionCandidates(scores: DimensionScore[], limitDims = 7) {
  return scores.slice(0, limitDims).flatMap((s) => s.categories.slice(0, 2).map((c) => ({ dimension: s.dimension, value: c.value })));
}

function combinations<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  function walk(start: number, picked: T[]) {
    if (picked.length === size) { out.push([...picked]); return; }
    for (let i = start; i < arr.length; i += 1) walk(i + 1, [...picked, arr[i]]);
  }
  walk(0, []);
  return out;
}

function findInteractions(rows: DataRow[], scores: DimensionScore[], actualKey: string, expectedKey?: string): InteractionSegment[] {
  const candidates = interactionCandidates(scores);
  const all = [...combinations(candidates, 2), ...combinations(candidates, 3)];
  const unique = new Map<string, InteractionSegment>();
  const fallbackMean = mean(rows.map((x) => num(x[actualKey])));
  const globalMeanResidual = mean(rows.map((r) => num(r[actualKey]) - (expectedKey ? num(r[expectedKey]) : fallbackMean)));

  for (const predicates of all) {
    if (new Set(predicates.map((p) => p.dimension)).size !== predicates.length) continue;
    const subset = applyPredicates(rows, predicates);
    if (subset.length < Math.max(20, rows.length * 0.015)) continue;
    const actual = subset.reduce((s, r) => s + num(r[actualKey]), 0);
    const expected = expectedKey
      ? subset.reduce((s, r) => s + num(r[expectedKey]), 0)
      : fallbackMean * subset.length;
    const variance = actual - expected;
    const avgResidual = variance / subset.length;
    const lift = Math.abs(avgResidual) / Math.max(Math.abs(globalMeanResidual), 1);
    const support = subset.length / rows.length;
    const score = Math.abs(variance) * Math.sqrt(support) * Math.log1p(lift);
    const key = [...predicates].sort((a, b) => a.dimension.localeCompare(b.dimension)).map((p) => `${p.dimension}=${p.value}`).join('|');
    unique.set(key, { predicates, count: subset.length, actual, expected, variance, lift, score });
  }
  return Array.from(unique.values()).sort((a, b) => b.score - a.score).slice(0, 12);
}

export function investigate(
  sourceRows: DataRow[],
  dimensions: string[],
  actualKey: string,
  expectedKey: string | undefined,
  predicates: Predicate[] = [],
): InvestigationResult {
  const rows = applyPredicates(sourceRows, predicates);
  const actualValues = rows.map((r) => num(r[actualKey]));
  const fallbackMean = mean(actualValues);
  const residuals = rows.map((r) => num(r[actualKey]) - (expectedKey ? num(r[expectedKey]) : fallbackMean));
  const actual = actualValues.reduce((a, b) => a + b, 0);
  const expected = expectedKey ? rows.reduce((s, r) => s + num(r[expectedKey]), 0) : fallbackMean * rows.length;
  const variance = actual - expected;
  const dimensionScores = dimensions
    .filter((d) => !predicates.some((p) => p.dimension === d))
    .map((d) => scoreDimension(rows, d, actualKey, expectedKey))
    .sort((a, b) => b.score - a.score);
  return {
    rowCount: rows.length,
    actual,
    expected,
    variance,
    variancePct: expected === 0 ? null : variance / Math.abs(expected),
    anomalyScore: Math.abs(mean(residuals)) / std(residuals),
    dimensionsScanned: dimensionScores.length,
    dimensionScores,
    interactions: findInteractions(rows, dimensionScores, actualKey, expectedKey),
  };
}
