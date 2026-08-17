import { parseTimeValue } from './timeIntelligence';
import type { DataRow, ImpactDirection, MetricPolarity, Predicate } from '../types';

export type ExternalEventStudyStatus = 'supported' | 'weak' | 'contradicted' | 'insufficient';
export type ExpectedBusinessDirection = 'favorable' | 'unfavorable' | 'unknown';

export interface ExternalEventStudyOptions {
  rows: DataRow[];
  eventId: string;
  eventTitle: string;
  eventDate: string;
  timeField: string;
  actualKey: string;
  expectedKey?: string;
  metricPolarity: MetricPolarity;
  affectedPredicates: Predicate[];
  controlPredicates?: Predicate[];
  preDays?: number;
  postDays?: number;
  expectedDirection?: ExpectedBusinessDirection;
}

export interface ExternalEventStudyGroupSummary {
  prePeriods: number;
  postPeriods: number;
  preActualAverage: number;
  postActualAverage: number;
  preExpectedAverage: number;
  postExpectedAverage: number;
  preResidualAverage: number;
  postResidualAverage: number;
  residualChange: number;
  preTrendSlope: number;
}

export interface ExternalEventStudyResult {
  calculationVersion: 'external-event-study-v1';
  eventId: string;
  eventTitle: string;
  eventDate: string;
  method: 'difference_in_differences' | 'pre_post';
  affected: ExternalEventStudyGroupSummary;
  control: ExternalEventStudyGroupSummary | null;
  rawEffect: number;
  businessImpactEffect: number;
  impactDirection: ImpactDirection;
  standardizedEffect: number;
  parallelTrendScore: number | null;
  status: ExternalEventStudyStatus;
  confidence: 'high' | 'medium' | 'low';
  diagnostics: string[];
  limitations: string[];
}

interface DailyObservation {
  key: string;
  date: Date;
  actual: number;
  expected: number;
  residual: number;
}

function finiteNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function normalizedDimensionValue(value: unknown) {
  return value === null || value === undefined || String(value).trim() === '' ? '(missing)' : String(value).trim();
}

function matches(row: DataRow, predicates: Predicate[]) {
  return predicates.every((predicate) => normalizedDimensionValue(row[predicate.dimension]) === predicate.value);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

function robustScale(values: number[]) {
  if (values.length < 2) return 0;
  const center = median(values);
  const mad = median(values.map((value) => Math.abs(value - center)));
  return mad * 1.4826 || standardDeviation(values);
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function slope(values: number[]) {
  if (values.length < 2) return 0;
  const xMean = (values.length - 1) / 2;
  const yMean = mean(values);
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - xMean) * (value - yMean);
    denominator += (index - xMean) ** 2;
  });
  return denominator ? numerator / denominator : 0;
}

function direction(value: number): ImpactDirection {
  if (value > 0) return 'favorable';
  if (value < 0) return 'unfavorable';
  return 'neutral';
}

function aggregateDaily(
  rows: DataRow[],
  predicates: Predicate[],
  timeField: string,
  actualKey: string,
  expectedKey: string | undefined,
  fallbackExpected: number,
) {
  const groups = new Map<string, { date: Date; actual: number; expected: number }>();
  for (const row of rows) {
    if (!matches(row, predicates)) continue;
    const parsed = parseTimeValue(row[timeField]);
    const actual = finiteNumber(row[actualKey]);
    const explicitExpected = expectedKey ? finiteNumber(row[expectedKey]) : fallbackExpected;
    if (!parsed || actual === null || explicitExpected === null) continue;
    const key = parsed.date.toISOString().slice(0, 10);
    const current = groups.get(key) ?? { date: parsed.date, actual: 0, expected: 0 };
    current.actual += actual;
    current.expected += explicitExpected;
    groups.set(key, current);
  }
  return [...groups.entries()]
    .map(([key, value]) => ({
      key,
      date: value.date,
      actual: value.actual,
      expected: value.expected,
      residual: value.actual - value.expected,
    } satisfies DailyObservation))
    .sort((left, right) => left.date.getTime() - right.date.getTime());
}

function summarize(pre: DailyObservation[], post: DailyObservation[]): ExternalEventStudyGroupSummary {
  const preResiduals = pre.map((item) => item.residual);
  const postResiduals = post.map((item) => item.residual);
  const preResidualAverage = mean(preResiduals);
  const postResidualAverage = mean(postResiduals);
  return {
    prePeriods: pre.length,
    postPeriods: post.length,
    preActualAverage: mean(pre.map((item) => item.actual)),
    postActualAverage: mean(post.map((item) => item.actual)),
    preExpectedAverage: mean(pre.map((item) => item.expected)),
    postExpectedAverage: mean(post.map((item) => item.expected)),
    preResidualAverage,
    postResidualAverage,
    residualChange: postResidualAverage - preResidualAverage,
    preTrendSlope: slope(preResiduals),
  };
}

export function runExternalEventStudy(options: ExternalEventStudyOptions): ExternalEventStudyResult {
  const event = new Date(options.eventDate);
  if (!Number.isFinite(event.getTime())) throw new Error('External event date must be a valid ISO date.');
  const preDays = Math.max(7, options.preDays ?? 30);
  const postDays = Math.max(7, options.postDays ?? 30);
  const dayMs = 86_400_000;
  const preStart = event.getTime() - preDays * dayMs;
  const postEnd = event.getTime() + postDays * dayMs;
  const allActuals = options.rows.map((row) => finiteNumber(row[options.actualKey])).filter((value): value is number => value !== null);
  const fallbackExpected = median(allActuals);

  const affectedObservations = aggregateDaily(
    options.rows,
    options.affectedPredicates,
    options.timeField,
    options.actualKey,
    options.expectedKey,
    fallbackExpected,
  );
  const controlObservations = options.controlPredicates
    ? aggregateDaily(options.rows, options.controlPredicates, options.timeField, options.actualKey, options.expectedKey, fallbackExpected)
    : [];

  const split = (observations: DailyObservation[]) => ({
    pre: observations.filter((item) => item.date.getTime() >= preStart && item.date.getTime() < event.getTime()),
    post: observations.filter((item) => item.date.getTime() >= event.getTime() && item.date.getTime() <= postEnd),
  });
  const affectedSplit = split(affectedObservations);
  const controlSplit = split(controlObservations);
  const affected = summarize(affectedSplit.pre, affectedSplit.post);
  const control = options.controlPredicates ? summarize(controlSplit.pre, controlSplit.post) : null;
  const method = control ? 'difference_in_differences' : 'pre_post';
  const rawEffect = affected.residualChange - (control?.residualChange ?? 0);
  const businessImpactEffect = rawEffect * (options.metricPolarity === 'higher_is_better' ? 1 : -1);
  const scalePopulation = [
    ...affectedSplit.pre.map((item) => item.residual),
    ...controlSplit.pre.map((item) => item.residual),
  ];
  const scale = robustScale(scalePopulation);
  const standardizedEffect = scale > 0 ? Math.abs(rawEffect) / scale : 0;
  const parallelTrendScore = control
    ? Math.max(0, 1 - Math.abs(affected.preTrendSlope - control.preTrendSlope) / Math.max(scale, 1))
    : null;
  const minimumPeriods = 5;
  const enoughAffected = affected.prePeriods >= minimumPeriods && affected.postPeriods >= minimumPeriods;
  const enoughControl = !control || (control.prePeriods >= minimumPeriods && control.postPeriods >= minimumPeriods);
  const diagnostics: string[] = [];
  const limitations = [
    'This is a descriptive event study, not proof of causality.',
    'Concurrent events, selection effects, anticipation, seasonality, and changes in population can bias the estimate.',
  ];

  if (!options.expectedKey) diagnostics.push('No approved comparison measure was supplied; the study uses a dataset-wide median row baseline.');
  if (!control) diagnostics.push('No control cohort was supplied, so the result is a pre/post comparison rather than difference-in-differences.');
  if (control && parallelTrendScore !== null && parallelTrendScore < 0.5) diagnostics.push('Affected and control cohorts do not show sufficiently similar pre-event trends.');
  if (!enoughAffected || !enoughControl) diagnostics.push('At least five pre-event and five post-event daily observations are required per cohort.');

  let status: ExternalEventStudyStatus = 'weak';
  if (!enoughAffected || !enoughControl) status = 'insufficient';
  else if (options.expectedDirection !== 'unknown' && options.expectedDirection && direction(businessImpactEffect) !== options.expectedDirection && standardizedEffect >= 0.75) status = 'contradicted';
  else if (standardizedEffect >= 1 && (!control || (parallelTrendScore ?? 0) >= 0.5)) status = 'supported';

  const confidence: ExternalEventStudyResult['confidence'] = status === 'supported' && control && (parallelTrendScore ?? 0) >= 0.75 && standardizedEffect >= 1.5
    ? 'high'
    : status === 'insufficient' || (parallelTrendScore !== null && parallelTrendScore < 0.5)
      ? 'low'
      : 'medium';

  return {
    calculationVersion: 'external-event-study-v1',
    eventId: options.eventId,
    eventTitle: options.eventTitle,
    eventDate: event.toISOString(),
    method,
    affected,
    control,
    rawEffect,
    businessImpactEffect,
    impactDirection: direction(businessImpactEffect),
    standardizedEffect,
    parallelTrendScore,
    status,
    confidence,
    diagnostics,
    limitations,
  };
}
