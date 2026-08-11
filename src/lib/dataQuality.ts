import type { DataRow, FieldProfile } from '../types';

export type QualitySeverity = 'critical' | 'warning' | 'info';
export type QualityStatus = 'excellent' | 'good' | 'watch' | 'poor';
export type AnalysisRole = 'measure' | 'dimension' | 'identifier' | 'excluded';

export interface DataQualityOptions {
  missingWarningRate?: number;
  missingCriticalRate?: number;
  duplicateWarningRate?: number;
  outlierWarningRate?: number;
  freshnessSlaDays?: number;
  requiredColumns?: string[];
  keyColumns?: string[];
}

export interface QualityIssue {
  id: string;
  dimension: string;
  severity: QualitySeverity;
  title: string;
  description: string;
  recommendation: string;
  column?: string;
  affectedRows?: number;
  affectedRate?: number;
}

export interface QualityDimensionResult {
  id: string;
  label: string;
  score: number | null;
  status: 'pass' | 'warning' | 'critical' | 'not-configured';
  summary: string;
  measured: boolean;
}

export interface TopValue { value: string; count: number; share: number; }
export interface NumericQualityStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  standardDeviation: number;
  q1: number;
  median: number;
  q3: number;
  zeros: number;
  negatives: number;
  outlierCount: number;
  outlierRate: number;
  extremeOutlierCount: number;
  skewIndicator: number;
}
export interface DateQualityStats {
  validCount: number;
  invalidCount: number;
  min: string;
  max: string;
  futureCount: number;
  daysSinceLatest: number | null;
}
export interface StringQualityStats {
  minLength: number;
  maxLength: number;
  averageLength: number;
  leadingTrailingWhitespaceCount: number;
  normalizedCollisionRows: number;
}
export interface ColumnQualityProfile {
  name: string;
  inferredKind: FieldProfile['kind'];
  runtimeTypes: Record<string, number>;
  dominantType: string;
  typeConsistency: number;
  rowCount: number;
  nonNullCount: number;
  nullCount: number;
  nullRate: number;
  distinctCount: number;
  uniquenessRate: number;
  duplicateValueRows: number;
  topValues: TopValue[];
  constant: boolean;
  nearConstant: boolean;
  highCardinality: boolean;
  identifierCandidate: boolean;
  potentialSensitive: boolean;
  sensitiveReasons: string[];
  analysisRole: AnalysisRole;
  excludedFromAnalysis: boolean;
  qualityScore: number;
  issues: QualityIssue[];
  numeric?: NumericQualityStats;
  date?: DateQualityStats;
  string?: StringQualityStats;
}
export interface CorrelationFinding { left: string; right: string; correlation: number; sampleSize: number; }
export interface DependencyFinding { determinant: string; dependent: string; confidence: number; rows: number; }
export interface MissingPattern { columns: string[]; count: number; share: number; }
export interface DataQualityReport {
  generatedAt: string;
  rowCount: number;
  columnCount: number;
  cellCount: number;
  missingCells: number;
  missingRate: number;
  duplicateRows: number;
  duplicateRate: number;
  raggedRows: number;
  emptyRows: number;
  overallScore: number;
  status: QualityStatus;
  analysisReady: boolean;
  blockers: number;
  warnings: number;
  dimensions: QualityDimensionResult[];
  issues: QualityIssue[];
  columns: ColumnQualityProfile[];
  correlations: CorrelationFinding[];
  functionalDependencies: DependencyFinding[];
  missingPatterns: MissingPattern[];
  measureCandidates: string[];
  dimensionCandidates: string[];
  identifierCandidates: string[];
  sensitiveColumns: string[];
  concepts: Array<{ name: string; description: string; coverage: 'measured' | 'requires-rule' | 'requires-baseline' | 'requires-reference' }>;
}

const DAY_MS = 86_400_000;
const defaults = { missingWarningRate: 0.05, missingCriticalRate: 0.4, duplicateWarningRate: 0.005, outlierWarningRate: 0.02 };
const severityRank: Record<QualitySeverity, number> = { critical: 0, warning: 1, info: 2 };

function isMissing(value: unknown) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}
function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}
function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || !/[T/\-:]/.test(text)) return null;
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  return year >= 1900 && year <= 2200 ? date : null;
}
function mean(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function std(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}
function quantile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
function clamp(value: number) { return Math.max(0, Math.min(100, value)); }
function status(score: number): QualityStatus { return score >= 95 ? 'excellent' : score >= 85 ? 'good' : score >= 70 ? 'watch' : 'poor'; }
function dimensionStatus(score: number | null): QualityDimensionResult['status'] { return score === null ? 'not-configured' : score >= 90 ? 'pass' : score >= 70 ? 'warning' : 'critical'; }
function normalized(value: string) { return value.trim().replace(/\s+/g, ' ').toLowerCase(); }
function identifierName(name: string) { return /(^id$|(^|_)(id|identifier|record.?id|transaction.?id|customer.?id|account.?id)($|_)|Id$)/i.test(name); }
function issue(input: Omit<QualityIssue, 'id'>): QualityIssue { return { ...input, id: `${input.dimension}:${input.column ?? 'dataset'}:${input.title}` }; }
function canonicalRow(row: DataRow, columns: string[]) { return columns.map((column) => `${column}=${isMissing(row[column]) ? '∅' : `${typeof row[column]}:${String(row[column])}`}`).join('|'); }

function inferKind(values: unknown[], distinctCount: number, rowCount: number): FieldProfile['kind'] {
  const present = values.filter((value) => !isMissing(value));
  if (!present.length) return 'categorical';
  const numericRate = present.filter((value) => finiteNumber(value) !== null).length / present.length;
  const booleanRate = present.filter((value) => typeof value === 'boolean' || /^(true|false)$/i.test(String(value))).length / present.length;
  const dateRate = present.filter((value) => parseDate(value) !== null).length / present.length;
  if (numericRate >= 0.95) return 'numeric';
  if (booleanRate >= 0.95) return 'boolean';
  if (dateRate >= 0.9) return 'date';
  if (distinctCount / Math.max(rowCount, 1) >= 0.92) return 'identifier';
  return 'categorical';
}

function sensitiveReasons(name: string, values: unknown[]) {
  const reasons: string[] = [];
  if (/(email|e-mail|phone|mobile|ssn|social.?security|address|postal|zip|dob|birth|first.?name|last.?name|full.?name|card|account.?number|ip.?address)/i.test(name)) reasons.push('the column name suggests personal or sensitive data');
  const sample = values.filter((value) => !isMissing(value)).slice(0, 250).map(String);
  if (sample.some((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) reasons.push('values resemble email addresses');
  if (sample.some((value) => /(?:\+?\d[\s().-]*){9,}/.test(value))) reasons.push('values resemble phone or account numbers');
  if (sample.some((value) => /^\d{3}-\d{2}-\d{4}$/.test(value))) reasons.push('values resemble a US Social Security number');
  return reasons;
}

function buildTopValues(values: unknown[], rowCount: number): TopValue[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (isMissing(value)) continue;
    const key = String(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([value, count]) => ({ value, count, share: count / Math.max(rowCount, 1) }));
}

function profileColumn(rows: DataRow[], name: string, options: DataQualityOptions): ColumnQualityProfile {
  const thresholds = { ...defaults, ...options };
  const values = rows.map((row) => row[name]);
  const present = values.filter((value) => !isMissing(value));
  const rowCount = rows.length;
  const nonNullCount = present.length;
  const nullCount = rowCount - nonNullCount;
  const nullRate = nullCount / Math.max(rowCount, 1);
  const distinctCount = new Set(present.map((value) => `${typeof value}:${String(value)}`)).size;
  const uniquenessRate = distinctCount / Math.max(nonNullCount, 1);
  const runtimeTypes: Record<string, number> = {};
  for (const value of present) runtimeTypes[typeof value] = (runtimeTypes[typeof value] ?? 0) + 1;
  const orderedTypes = Object.entries(runtimeTypes).sort((a, b) => b[1] - a[1]);
  const dominantType = orderedTypes[0]?.[0] ?? 'missing';
  const typeConsistency = (orderedTypes[0]?.[1] ?? 0) / Math.max(nonNullCount, 1);
  const inferredKind = inferKind(values, distinctCount, rowCount);
  const columnIssues: QualityIssue[] = [];

  if (nullRate >= thresholds.missingCriticalRate) columnIssues.push(issue({ dimension: 'completeness', severity: 'critical', title: 'High missingness', description: `${(nullRate * 100).toFixed(1)}% of ${name} is missing.`, recommendation: 'Repair the source, make the field optional explicitly, or exclude it from decisions.', column: name, affectedRows: nullCount, affectedRate: nullRate }));
  else if (nullRate >= thresholds.missingWarningRate) columnIssues.push(issue({ dimension: 'completeness', severity: 'warning', title: 'Missing values', description: `${(nullRate * 100).toFixed(1)}% of ${name} is missing.`, recommendation: 'Review the missingness pattern before grouping, filtering, or calculating.', column: name, affectedRows: nullCount, affectedRate: nullRate }));
  if (typeConsistency < 0.95 && nonNullCount) columnIssues.push(issue({ dimension: 'validity', severity: typeConsistency < 0.8 ? 'critical' : 'warning', title: 'Mixed runtime types', description: `The dominant type covers ${(typeConsistency * 100).toFixed(1)}% of non-missing values.`, recommendation: 'Standardize the type before using this field as a measure, key, or hierarchy level.', column: name, affectedRows: Math.round(nonNullCount * (1 - typeConsistency)), affectedRate: 1 - typeConsistency }));

  const stringValues = present.filter((value): value is string => typeof value === 'string');
  let stringStats: StringQualityStats | undefined;
  if (stringValues.length) {
    const lengths = stringValues.map((value) => value.length);
    const whitespaceCount = stringValues.filter((value) => value !== value.trim()).length;
    const variants = new Map<string, Set<string>>();
    const normalizedCounts = new Map<string, number>();
    for (const value of stringValues) {
      const key = normalized(value);
      const set = variants.get(key) ?? new Set<string>();
      set.add(value);
      variants.set(key, set);
      normalizedCounts.set(key, (normalizedCounts.get(key) ?? 0) + 1);
    }
    const collisionRows = [...variants.entries()].filter(([, set]) => set.size > 1).reduce((sum, [key]) => sum + (normalizedCounts.get(key) ?? 0), 0);
    stringStats = { minLength: Math.min(...lengths), maxLength: Math.max(...lengths), averageLength: mean(lengths), leadingTrailingWhitespaceCount: whitespaceCount, normalizedCollisionRows: collisionRows };
    if (whitespaceCount) columnIssues.push(issue({ dimension: 'conformity', severity: 'warning', title: 'Whitespace inconsistencies', description: `${whitespaceCount.toLocaleString()} values contain leading or trailing whitespace.`, recommendation: 'Trim values before joins and category grouping.', column: name, affectedRows: whitespaceCount, affectedRate: whitespaceCount / Math.max(nonNullCount, 1) }));
    if (collisionRows) columnIssues.push(issue({ dimension: 'consistency', severity: 'warning', title: 'Category variants', description: 'Some values differ only by case or spacing.', recommendation: 'Create a canonical category mapping before anomaly attribution.', column: name, affectedRows: collisionRows, affectedRate: collisionRows / Math.max(nonNullCount, 1) }));
  }

  const numericValues = present.map(finiteNumber).filter((value): value is number => value !== null);
  let numericStats: NumericQualityStats | undefined;
  if (numericValues.length / Math.max(nonNullCount, 1) >= 0.8 && numericValues.length) {
    const sorted = [...numericValues].sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const med = quantile(sorted, 0.5);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const low = q1 - 1.5 * iqr;
    const high = q3 + 1.5 * iqr;
    const extremeLow = q1 - 3 * iqr;
    const extremeHigh = q3 + 3 * iqr;
    const outlierCount = iqr > 0 ? numericValues.filter((value) => value < low || value > high).length : 0;
    const extremeOutlierCount = iqr > 0 ? numericValues.filter((value) => value < extremeLow || value > extremeHigh).length : 0;
    const deviation = std(numericValues);
    numericStats = { count: numericValues.length, min: sorted[0], max: sorted[sorted.length - 1], mean: mean(numericValues), standardDeviation: deviation, q1, median: med, q3, zeros: numericValues.filter((value) => value === 0).length, negatives: numericValues.filter((value) => value < 0).length, outlierCount, outlierRate: outlierCount / numericValues.length, extremeOutlierCount, skewIndicator: deviation ? (mean(numericValues) - med) / deviation : 0 };
    if (numericStats.outlierRate >= thresholds.outlierWarningRate) columnIssues.push(issue({ dimension: 'distribution', severity: extremeOutlierCount ? 'warning' : 'info', title: 'Potential numeric outliers', description: `${outlierCount.toLocaleString()} values fall outside the 1.5×IQR range.`, recommendation: 'Validate genuine extremes, unit errors, and data-entry problems before modeling.', column: name, affectedRows: outlierCount, affectedRate: numericStats.outlierRate }));
  }

  const parsedDates = present.map(parseDate);
  const validDates = parsedDates.filter((value): value is Date => value !== null);
  let dateStats: DateQualityStats | undefined;
  if (validDates.length / Math.max(nonNullCount, 1) >= 0.5 && validDates.length) {
    const timestamps = validDates.map((value) => value.getTime()).sort((a, b) => a - b);
    const latest = timestamps[timestamps.length - 1];
    dateStats = { validCount: validDates.length, invalidCount: nonNullCount - validDates.length, min: new Date(timestamps[0]).toISOString(), max: new Date(latest).toISOString(), futureCount: timestamps.filter((timestamp) => timestamp > Date.now() + DAY_MS).length, daysSinceLatest: Math.floor((Date.now() - latest) / DAY_MS) };
    if (dateStats.invalidCount) columnIssues.push(issue({ dimension: 'validity', severity: dateStats.invalidCount / Math.max(nonNullCount, 1) > 0.1 ? 'critical' : 'warning', title: 'Invalid date values', description: `${dateStats.invalidCount.toLocaleString()} values cannot be parsed as dates.`, recommendation: 'Standardize the date format and quarantine invalid values.', column: name, affectedRows: dateStats.invalidCount, affectedRate: dateStats.invalidCount / Math.max(nonNullCount, 1) }));
    if (dateStats.futureCount) columnIssues.push(issue({ dimension: 'validity', severity: 'warning', title: 'Future-dated records', description: `${dateStats.futureCount.toLocaleString()} dates are later than today.`, recommendation: 'Confirm whether they are forecasts or invalid transaction dates.', column: name, affectedRows: dateStats.futureCount, affectedRate: dateStats.futureCount / Math.max(nonNullCount, 1) }));
  }

  const topValues = buildTopValues(values, rowCount);
  const constant = distinctCount <= 1 && nonNullCount > 0;
  const nearConstant = !constant && (topValues[0]?.share ?? 0) >= 0.98;
  const highCardinality = distinctCount > Math.max(80, rowCount * 0.2);
  const identifierCandidate = identifierName(name) || (uniquenessRate >= 0.98 && highCardinality);
  const reasons = sensitiveReasons(name, values);
  const potentialSensitive = reasons.length > 0;
  if (constant) columnIssues.push(issue({ dimension: 'distribution', severity: 'info', title: 'Constant column', description: 'Only one non-missing value is present.', recommendation: 'Exclude it from anomaly scans unless needed for lineage.', column: name }));
  if (nearConstant) columnIssues.push(issue({ dimension: 'distribution', severity: 'info', title: 'Near-constant column', description: `${((topValues[0]?.share ?? 0) * 100).toFixed(1)}% of rows share one value.`, recommendation: 'Review whether the field offers useful segmentation.', column: name }));
  if (identifierCandidate) columnIssues.push(issue({ dimension: 'readiness', severity: 'info', title: 'Identifier-like column', description: 'The field appears to identify rows or entities.', recommendation: 'Keep it for traceability but exclude it from root-cause ranking.', column: name }));
  if (potentialSensitive) columnIssues.push(issue({ dimension: 'privacy', severity: 'warning', title: 'Potential sensitive data', description: `${name} may be sensitive because ${reasons.join(' and ')}.`, recommendation: 'Apply masking, access controls, minimization, and approved retention rules.', column: name }));

  let analysisRole: AnalysisRole = 'excluded';
  if (identifierCandidate) analysisRole = 'identifier';
  else if (inferredKind === 'numeric' && typeConsistency >= 0.9 && nullRate < 0.5 && !constant) analysisRole = 'measure';
  else if (['categorical', 'date', 'boolean'].includes(inferredKind) && distinctCount > 1 && !highCardinality && nullRate < 0.7) analysisRole = 'dimension';

  const formatRate = stringStats ? (stringStats.leadingTrailingWhitespaceCount + stringStats.normalizedCollisionRows) / Math.max(nonNullCount * 2, 1) : 0;
  const distributionPenalty = (numericStats?.outlierRate ?? 0) * 1.5 + (constant ? 0.3 : nearConstant ? 0.12 : 0);
  const qualityScore = clamp(100 * (0.42 * (1 - nullRate) + 0.28 * typeConsistency + 0.18 * (1 - Math.min(1, formatRate)) + 0.12 * (1 - Math.min(1, distributionPenalty))));

  return { name, inferredKind, runtimeTypes, dominantType, typeConsistency, rowCount, nonNullCount, nullCount, nullRate, distinctCount, uniquenessRate, duplicateValueRows: Math.max(0, nonNullCount - distinctCount), topValues, constant, nearConstant, highCardinality, identifierCandidate, potentialSensitive, sensitiveReasons: reasons, analysisRole, excludedFromAnalysis: analysisRole === 'identifier' || analysisRole === 'excluded', qualityScore, issues: columnIssues, numeric: numericStats, date: dateStats, string: stringStats };
}

function buildCorrelations(rows: DataRow[], columns: ColumnQualityProfile[]): CorrelationFinding[] {
  const numeric = columns.filter((column) => column.analysisRole === 'measure').slice(0, 14);
  const output: CorrelationFinding[] = [];
  for (let left = 0; left < numeric.length; left += 1) for (let right = left + 1; right < numeric.length; right += 1) {
    const pairs = rows.map((row) => [finiteNumber(row[numeric[left].name]), finiteNumber(row[numeric[right].name])] as const).filter((pair): pair is readonly [number, number] => pair[0] !== null && pair[1] !== null);
    if (pairs.length < 20) continue;
    const xs = pairs.map((pair) => pair[0]);
    const ys = pairs.map((pair) => pair[1]);
    const mx = mean(xs); const my = mean(ys);
    const numerator = pairs.reduce((sum, pair) => sum + (pair[0] - mx) * (pair[1] - my), 0);
    const dx = Math.sqrt(xs.reduce((sum, value) => sum + (value - mx) ** 2, 0));
    const dy = Math.sqrt(ys.reduce((sum, value) => sum + (value - my) ** 2, 0));
    if (!dx || !dy) continue;
    const correlation = numerator / (dx * dy);
    if (Math.abs(correlation) >= 0.8) output.push({ left: numeric[left].name, right: numeric[right].name, correlation, sampleSize: pairs.length });
  }
  return output.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)).slice(0, 20);
}

function buildDependencies(rows: DataRow[], columns: ColumnQualityProfile[]): DependencyFinding[] {
  const candidates = columns.filter((column) => column.analysisRole === 'dimension' && column.distinctCount <= 60).slice(0, 20);
  const output: DependencyFinding[] = [];
  for (const determinant of candidates) for (const dependent of candidates) {
    if (determinant.name === dependent.name || determinant.distinctCount < dependent.distinctCount) continue;
    const groups = new Map<string, Map<string, number>>();
    let usable = 0;
    for (const row of rows) {
      const left = row[determinant.name]; const right = row[dependent.name];
      if (isMissing(left) || isMissing(right)) continue;
      usable += 1;
      const values = groups.get(String(left)) ?? new Map<string, number>();
      values.set(String(right), (values.get(String(right)) ?? 0) + 1);
      groups.set(String(left), values);
    }
    if (usable < 30) continue;
    let consistent = 0;
    for (const values of groups.values()) if (values.size === 1) consistent += [...values.values()][0];
    const confidence = consistent / usable;
    if (confidence >= 0.98) output.push({ determinant: determinant.name, dependent: dependent.name, confidence, rows: usable });
  }
  return output.sort((a, b) => b.confidence - a.confidence || b.rows - a.rows).slice(0, 20);
}

function buildMissingPatterns(rows: DataRow[], columns: string[]): MissingPattern[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const missing = columns.filter((column) => isMissing(row[column]));
    if (!missing.length) continue;
    const key = missing.slice(0, 8).join('|') + (missing.length > 8 ? '|…' : '');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => ({ columns: key.split('|'), count, share: count / Math.max(rows.length, 1) })).sort((a, b) => b.count - a.count).slice(0, 12);
}

export function analyzeDataQuality(rows: DataRow[], options: DataQualityOptions = {}): DataQualityReport {
  const thresholds = { ...defaults, ...options };
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort((a, b) => a.localeCompare(b));
  const rowCount = rows.length;
  const columnCount = columns.length;
  const cellCount = rowCount * columnCount;
  const missingCells = rows.reduce((sum, row) => sum + columns.filter((column) => isMissing(row[column])).length, 0);
  const missingRate = missingCells / Math.max(cellCount, 1);
  const raggedRows = rows.filter((row) => columns.some((column) => !Object.prototype.hasOwnProperty.call(row, column))).length;
  const emptyRows = rows.filter((row) => columns.every((column) => isMissing(row[column]))).length;
  const rowCounts = new Map<string, number>();
  for (const row of rows) { const key = canonicalRow(row, columns); rowCounts.set(key, (rowCounts.get(key) ?? 0) + 1); }
  const duplicateRows = [...rowCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const duplicateRate = duplicateRows / Math.max(rowCount, 1);
  const columnProfiles = columns.map((column) => profileColumn(rows, column, options));
  const issues = columnProfiles.flatMap((column) => column.issues);

  if (!rowCount) issues.push(issue({ dimension: 'readiness', severity: 'critical', title: 'No rows', description: 'The dataset is empty.', recommendation: 'Load a non-empty tabular dataset.' }));
  if (!columnCount) issues.push(issue({ dimension: 'readiness', severity: 'critical', title: 'No columns', description: 'The dataset has no fields.', recommendation: 'Check the header row or JSON object properties.' }));
  if (duplicateRows && duplicateRate >= thresholds.duplicateWarningRate) issues.push(issue({ dimension: 'uniqueness', severity: duplicateRate >= 0.1 ? 'critical' : 'warning', title: 'Duplicate rows', description: `${duplicateRows.toLocaleString()} rows duplicate an earlier row.`, recommendation: 'Confirm the intended grain and deduplicate before totals or anomaly attribution.', affectedRows: duplicateRows, affectedRate: duplicateRate }));
  if (raggedRows) issues.push(issue({ dimension: 'integrity', severity: raggedRows / Math.max(rowCount, 1) > 0.1 ? 'critical' : 'warning', title: 'Ragged records', description: `${raggedRows.toLocaleString()} rows do not contain the complete schema.`, recommendation: 'Normalize the source schema and distinguish absent fields from explicit nulls.', affectedRows: raggedRows, affectedRate: raggedRows / Math.max(rowCount, 1) }));
  if (emptyRows) issues.push(issue({ dimension: 'completeness', severity: 'warning', title: 'Empty records', description: `${emptyRows.toLocaleString()} rows contain no usable values.`, recommendation: 'Remove empty records during ingestion.', affectedRows: emptyRows, affectedRate: emptyRows / Math.max(rowCount, 1) }));

  for (const required of options.requiredColumns ?? []) if (!columns.includes(required)) issues.push(issue({ dimension: 'schema', severity: 'critical', title: 'Required column missing', description: `${required} is not present.`, recommendation: 'Correct the source schema or rule.', column: required }));
  for (const key of options.keyColumns ?? []) {
    const profile = columnProfiles.find((column) => column.name === key);
    if (!profile) issues.push(issue({ dimension: 'integrity', severity: 'critical', title: 'Configured key missing', description: `${key} is not present.`, recommendation: 'Correct the key configuration.', column: key }));
    else if (profile.nullCount || profile.uniquenessRate < 1) issues.push(issue({ dimension: 'integrity', severity: 'critical', title: 'Key is not unique and complete', description: `${key} has ${profile.nullCount} missing values and ${(profile.uniquenessRate * 100).toFixed(1)}% uniqueness.`, recommendation: 'Repair duplicate or missing key values before joins or updates.', column: key }));
  }

  const measureCandidates = columnProfiles.filter((column) => column.analysisRole === 'measure').map((column) => column.name);
  const dimensionCandidates = columnProfiles.filter((column) => column.analysisRole === 'dimension').map((column) => column.name);
  const identifierCandidates = columnProfiles.filter((column) => column.analysisRole === 'identifier').map((column) => column.name);
  const sensitiveColumns = columnProfiles.filter((column) => column.potentialSensitive).map((column) => column.name);
  if (!measureCandidates.length) issues.push(issue({ dimension: 'readiness', severity: 'critical', title: 'No reliable numeric measure', description: 'No numeric field passes basic type, completeness, and variability checks.', recommendation: 'Clean or select a numeric measure before anomaly analysis.' }));
  if (dimensionCandidates.length < 2) issues.push(issue({ dimension: 'readiness', severity: 'critical', title: 'Insufficient dimensions', description: 'Fewer than two analysis-ready dimensions were found.', recommendation: 'Provide or clean descriptive fields for drill-down analysis.' }));

  const completenessScore = clamp(100 * (1 - missingRate) - emptyRows / Math.max(rowCount, 1) * 20);
  const uniquenessScore = clamp(100 * (1 - duplicateRate));
  const validityScore = clamp(mean(columnProfiles.map((column) => column.typeConsistency * 100)) - issues.filter((item) => item.dimension === 'validity' && item.severity === 'critical').length * 8);
  const consistencyIssues = columnProfiles.reduce((sum, column) => sum + (column.string?.leadingTrailingWhitespaceCount ?? 0) + (column.string?.normalizedCollisionRows ?? 0), 0);
  const consistencyScore = clamp(100 * (1 - Math.min(1, consistencyIssues / Math.max(cellCount, 1) * 3)) - raggedRows / Math.max(rowCount, 1) * 20);
  const outliers = columnProfiles.reduce((sum, column) => sum + (column.numeric?.outlierCount ?? 0), 0);
  const numericCells = columnProfiles.reduce((sum, column) => sum + (column.numeric?.count ?? 0), 0);
  const distributionScore = clamp(100 * (1 - Math.min(1, outliers / Math.max(numericCells, 1) * 2)));
  const integrityScore = clamp(100 - duplicateRate * 100 - raggedRows / Math.max(rowCount, 1) * 100);
  const readinessScore = clamp((measureCandidates.length ? 45 : 0) + (dimensionCandidates.length >= 2 ? 45 : dimensionCandidates.length * 20) + (rowCount >= 20 ? 10 : rowCount / 2));

  let timelinessScore: number | null = null;
  const dated = columnProfiles.filter((column) => column.date?.daysSinceLatest !== null && column.date?.daysSinceLatest !== undefined);
  if (typeof options.freshnessSlaDays === 'number' && options.freshnessSlaDays >= 0 && dated.length) {
    const freshest = Math.min(...dated.map((column) => Math.max(0, column.date?.daysSinceLatest ?? 0)));
    timelinessScore = clamp(100 * (1 - Math.max(0, freshest - options.freshnessSlaDays) / Math.max(options.freshnessSlaDays * 3, 1)));
    if (freshest > options.freshnessSlaDays) issues.push(issue({ dimension: 'timeliness', severity: freshest > options.freshnessSlaDays * 3 ? 'critical' : 'warning', title: 'Freshness SLA missed', description: `The newest date is ${freshest} days old, beyond the ${options.freshnessSlaDays}-day SLA.`, recommendation: 'Check refresh schedules, late records, and pipeline failures.' }));
  }

  const dimensions: QualityDimensionResult[] = [
    { id: 'completeness', label: 'Completeness', score: completenessScore, status: dimensionStatus(completenessScore), summary: `${(missingRate * 100).toFixed(1)}% of cells are missing.`, measured: true },
    { id: 'uniqueness', label: 'Uniqueness', score: uniquenessScore, status: dimensionStatus(uniquenessScore), summary: `${duplicateRows.toLocaleString()} exact duplicate rows found.`, measured: true },
    { id: 'validity', label: 'Validity', score: validityScore, status: dimensionStatus(validityScore), summary: 'Checks types, dates, and usable numeric values.', measured: true },
    { id: 'conformity', label: 'Conformity & consistency', score: consistencyScore, status: dimensionStatus(consistencyScore), summary: 'Checks schema shape, whitespace, casing, and category representations.', measured: true },
    { id: 'integrity', label: 'Structural integrity', score: integrityScore, status: dimensionStatus(integrityScore), summary: 'Checks duplicate records, ragged rows, and configured keys.', measured: true },
    { id: 'distribution', label: 'Distribution & outliers', score: distributionScore, status: dimensionStatus(distributionScore), summary: 'Checks extremes, constants, concentration, and numerical spread.', measured: true },
    { id: 'timeliness', label: 'Timeliness & freshness', score: timelinessScore, status: dimensionStatus(timelinessScore), summary: timelinessScore === null ? 'Add a freshness SLA to score this dimension.' : 'Compared with the configured freshness SLA.', measured: timelinessScore !== null },
    { id: 'accuracy', label: 'Accuracy', score: null, status: 'not-configured', summary: 'Requires trusted reconciliation or reference data.', measured: false },
    { id: 'drift', label: 'Drift & stability', score: null, status: 'not-configured', summary: 'Requires a prior profile or approved baseline.', measured: false },
    { id: 'lineage', label: 'Lineage & provenance', score: null, status: 'not-configured', summary: 'Requires source, transformation, ownership, and refresh metadata.', measured: false },
    { id: 'privacy', label: 'Privacy & sensitivity', score: sensitiveColumns.length ? 75 : 100, status: sensitiveColumns.length ? 'warning' : 'pass', summary: `${sensitiveColumns.length} potentially sensitive columns detected.`, measured: true },
    { id: 'readiness', label: 'Analysis readiness', score: readinessScore, status: dimensionStatus(readinessScore), summary: `${measureCandidates.length} measures and ${dimensionCandidates.length} dimensions are ready.`, measured: true },
  ];
  const overallScore = clamp(mean(dimensions.filter((dimension) => dimension.score !== null && dimension.id !== 'privacy').map((dimension) => dimension.score as number)));
  const blockers = issues.filter((item) => item.severity === 'critical').length;
  const warnings = issues.filter((item) => item.severity === 'warning').length;
  const analysisReady = blockers === 0 && measureCandidates.length > 0 && dimensionCandidates.length >= 2 && rowCount > 0;

  return {
    generatedAt: new Date().toISOString(), rowCount, columnCount, cellCount, missingCells, missingRate, duplicateRows, duplicateRate, raggedRows, emptyRows, overallScore, status: status(overallScore), analysisReady, blockers, warnings, dimensions,
    issues: [...issues].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]),
    columns: [...columnProfiles].sort((a, b) => a.qualityScore - b.qualityScore || a.name.localeCompare(b.name)),
    correlations: buildCorrelations(rows, columnProfiles), functionalDependencies: buildDependencies(rows, columnProfiles), missingPatterns: buildMissingPatterns(rows, columns), measureCandidates, dimensionCandidates, identifierCandidates, sensitiveColumns,
    concepts: [
      { name: 'Completeness', description: 'Required values are present at the row, column, and dataset level.', coverage: 'measured' },
      { name: 'Uniqueness', description: 'Rows, business keys, and identifiers do not contain unintended duplicates.', coverage: 'measured' },
      { name: 'Validity', description: 'Values conform to expected types, parse rules, and formats.', coverage: 'measured' },
      { name: 'Conformity', description: 'Values use consistent units, casing, whitespace, labels, and representations.', coverage: 'measured' },
      { name: 'Consistency', description: 'Equivalent values and related fields agree across records and sources.', coverage: 'measured' },
      { name: 'Accuracy', description: 'Values match a trusted source of truth or verified business reality.', coverage: 'requires-reference' },
      { name: 'Integrity', description: 'Keys, relationships, hierarchy mappings, and record structures remain valid.', coverage: 'requires-rule' },
      { name: 'Timeliness / freshness', description: 'Data arrives within an agreed service-level window.', coverage: 'requires-rule' },
      { name: 'Distribution / outliers', description: 'Ranges, frequencies, balance, skew, and extreme values remain plausible.', coverage: 'measured' },
      { name: 'Drift / stability', description: 'Schema, volume, missingness, and distributions remain stable against a baseline.', coverage: 'requires-baseline' },
      { name: 'Granularity', description: 'The record grain matches the intended analytical unit and target grain.', coverage: 'requires-rule' },
      { name: 'Referential integrity', description: 'Foreign keys resolve to valid parent records and approved reference values.', coverage: 'requires-reference' },
      { name: 'Lineage / provenance', description: 'Source, transformations, ownership, refresh time, and version are traceable.', coverage: 'requires-reference' },
      { name: 'Privacy / sensitivity', description: 'Potential personal, confidential, or restricted fields are identified and governed.', coverage: 'measured' },
      { name: 'Usability / readiness', description: 'Reliable measures, dimensions, dates, and identifiers exist for the intended analysis.', coverage: 'measured' },
    ],
  };
}
