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

export interface TopValue {
  value: string;
  count: number;
  share: number;
}

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

export interface CorrelationFinding {
  left: string;
  right: string;
  correlation: number;
  sampleSize: number;
}

export interface DependencyFinding {
  determinant: string;
  dependent: string;
  confidence: number;
  rows: number;
}

export interface MissingPattern {
  columns: string[];
  count: number;
  share: number;
}

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
const DEFAULTS: Required<Pick<DataQualityOptions, 'missingWarningRate' | 'missingCriticalRate' | 'duplicateWarningRate' | 'outlierWarningRate'>> = {
  missingWarningRate: 0.05,
  missingCriticalRate: 0.4,
  duplicateWarningRate: 0.005,
  outlierWarningRate: 0.02,
};

function isMissing(value: unknown) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function runtimeType(value: unknown) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
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
  if (date.getUTCFullYear() < 1900 || date.getUTCFullYear() > 2200) return null;
  return date;
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

function quantile(sorted: number[], probability: number) {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function statusForScore(score: number): QualityStatus {
  if (score >= 95) return 'excellent';
  if (score >= 85) return 'good';
  if (score >= 70) return 'watch';
  return 'poor';
}

function dimensionStatus(score: number | null): QualityDimensionResult['status'] {
  if (score === null) return 'not-configured';
  if (score >= 90) return 'pass';
  if (score >= 70) return 'warning';
  return 'critical';
}

function normalizedString(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function canonicalRow(row: DataRow, columns: string[]) {
  return columns.map((column) => {
    const value = row[column];
    if (isMissing(value)) return `${column}=∅`;
    return `${column}=${typeof value}:${String(value)}`;
  }).join('|');
}

function potentialSensitiveReasons(name: string, values: unknown[]) {
  const reasons: string[] = [];
  const lower = name.toLowerCase();
  if (/(^|_)(email|e-mail|phone|mobile|ssn|social.?security|address|street|postal|zip|dob|birth|first.?name|last.?name|full.?name|card|account.?number|ip.?address)($|_)/i.test(lower)) {
    reasons.push('column name suggests personal or sensitive data');
  }
  const sample = values.filter((value) => !isMissing(value)).slice(0, 250).map(String);
  if (sample.some((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) reasons.push('values resemble email addresses');
  if (sample.some((value) => /(?:\+?\d[\s().-]*){9,}/.test(value))) reasons.push('values resemble phone or account numbers');
  if (sample.some((value) => /^\d{3}-\d{2}-\d{4}$/.test(value))) reasons.push('values resemble a US Social Security number');
  return reasons;
}

function identifierName(name: string) {
  return /(^id$|(^|_)(id|identifier|record.?id|transaction.?id|customer.?id|account.?id)($|_)|Id$)/i.test(name);
}

function issue(input: Omit<QualityIssue, 'id'>): QualityIssue {
  return { ...input, id: `${input.dimension}:${input.column ?? 'dataset'}:${input.title}` };
}

function inferKind(values: unknown[], distinctCount: number, rowCount: number): FieldProfile['kind'] {
  const present = values.filter((value) => !isMissing(value));
  if (!present.length) return 'categorical';
  const numeric = present.filter((value) => finiteNumber(value) !== null).length / present.length;
  const boolean = present.filter((value) => typeof value === 'boolean' || /^(true|false)$/i.test(String(value))).length / present.length;
  const dates = present.filter((value) => parseDate(value) !== null).length / present.length;
  if (numeric >= 0.95) return 'numeric';
  if (boolean >= 0.95) return 'boolean';
  if (dates >= 0.9) return 'date';
  if (distinctCount / Math.max(rowCount, 1) >= 0.92) return 'identifier';
  return 'categorical';
}

function topValues(values: unknown[], rowCount: number): TopValue[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (isMissing(value)) continue;
    const key = String(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([value, count]) => ({ value, count, share: count / Math.max(rowCount, 1) }));
}

function profileColumn(rows: DataRow[], name: string, options: DataQualityOptions): ColumnQualityProfile {
  const values = rows.map((row) => row[name]);
  const present = values.filter((value) => !isMissing(value));
  const rowCount = rows.length;
  const nonNullCount = present.length;
  const nullCount = rowCount - nonNullCount;
  const nullRate = nullCount / Math.max(rowCount, 1);
  const distinctCount = new Set(present.map((value) => `${typeof value}:${String(value)}`)).size;
  const uniquenessRate = distinctCount / Math.max(nonNullCount, 1);
  const duplicateValueRows = Math.max(0, nonNullCount - distinctCount);
  const runtimeTypes: Record<string, number> = {};
  for (const value of present) runtimeTypes[runtimeType(value)] = (runtimeTypes[runtimeType(value)] ?? 0) + 1;
  const sortedTypes = Object.entries(runtimeTypes).sort((a, b) => b[1] - a[1]);
  const dominantType = sortedTypes[0]?.[0] ?? 'missing';
  const typeConsistency = (sortedTypes[0]?.[1] ?? 0) / Math.max(nonNullCount, 1);
  const inferredKind = inferKind(values, distinctCount, rowCount);
  const columnIssues: QualityIssue[] = [];
  const thresholds = { ...DEFAULTS, ...options };

  if (nullRate >= thresholds.missingCriticalRate) {
    columnIssues.push(issue({ dimension: 'completeness', severity: 'critical', title: 'High missingness', description: `${(nullRate * 100).toFixed(1)}% of ${name} is missing.`, recommendation: 'Confirm whether this column is required, repair the upstream source, or exclude it from analytical decisions.', column: name, affectedRows: nullCount, affectedRate: nullRate }));
  } else if (nullRate >= thresholds.missingWarningRate) {
    columnIssues.push(issue({ dimension: 'completeness', severity: 'warning', title: 'Missing values', description: `${(nullRate * 100).toFixed(1)}% of ${name} is missing.`, recommendation: 'Review the missingness pattern before filtering, grouping, or calculating measures.', column: name, affectedRows: nullCount, affectedRate: nullRate }));
  }

  if (typeConsistency < 0.95 && nonNullCount > 0) {
    columnIssues.push(issue({ dimension: 'validity', severity: typeConsistency < 0.8 ? 'critical' : 'warning', title: 'Mixed runtime types', description: `${name} contains multiple value types; the dominant type covers ${(typeConsistency * 100).toFixed(1)}% of non-missing rows.`, recommendation: 'Standardize the column type before using it as a measure, key, or hierarchy level.', column: name, affectedRows: Math.round(nonNullCount * (1 - typeConsistency)), affectedRate: 1 - typeConsistency }));
  }

  const stringValues = present.filter((value): value is string => typeof value === 'string');
  let stringStats: StringQualityStats | undefined;
  if (stringValues.length) {
    const lengths = stringValues.map((value) => value.length);
    const whitespaceCount = stringValues.filter((value) => value !== value.trim()).length;
    const normalizedVariants = new Map<string, Set<string>>();
    const normalizedRowCounts = new Map<string, number>();
    for (const value of stringValues) {
      const normalized = normalizedString(value);
      const variants = normalizedVariants.get(normalized) ?? new Set<string>();
      variants.add(value);
      normalizedVariants.set(normalized, variants);
      normalizedRowCounts.set(normalized, (normalizedRowCounts.get(normalized) ?? 0) + 1);
    }
    const collisionKeys = [...normalizedVariants.entries()].filter(([, variants]) => variants.size > 1).map(([key]) => key);
    const normalizedCollisionRows = collisionKeys.reduce((sum, key) => sum + (normalizedRowCounts.get(key) ?? 0), 0);
    stringStats = {
      minLength: Math.min(...lengths),
      maxLength: Math.max(...lengths),
      averageLength: mean(lengths),
      leadingTrailingWhitespaceCount: whitespaceCount,
      normalizedCollisionRows,
    };
    if (whitespaceCount > 0) {
      columnIssues.push(issue({ dimension: 'conformity', severity: 'warning', title: 'Whitespace inconsistencies', description: `${whitespaceCount.toLocaleString()} values in ${name} contain leading or trailing whitespace.`, recommendation: 'Trim values before grouping or joining so equivalent categories do not split.', column: name, affectedRows: whitespaceCount, affectedRate: whitespaceCount / Math.max(nonNullCount, 1) }));
    }
    if (normalizedCollisionRows > 0) {
      columnIssues.push(issue({ dimension: 'consistency', severity: 'warning', title: 'Category variants', description: `${name} contains values that differ only by case or spacing.`, recommendation: 'Create a canonical mapping for category labels before anomaly attribution.', column: name, affectedRows: normalizedCollisionRows, affectedRate: normalizedCollisionRows / Math.max(nonNullCount, 1) }));
    }
  }

  const numericValues = present.map(finiteNumber).filter((value): value is number => value !== null);
  let numericStats: NumericQualityStats | undefined;
  if (numericValues.length && numericValues.length / Math.max(nonNullCount, 1) >= 0.8) {
    const sorted = [...numericValues].sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const median = quantile(sorted, 0.5);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const extremeLower = q1 - 3 * iqr;
    const extremeUpper = q3 + 3 * iqr;
    const outlierCount = iqr > 0 ? numericValues.filter((value) => value < lowerFence || value > upperFence).length : 0;
    const extremeOutlierCount = iqr > 0 ? numericValues.filter((value) => value < extremeLower || value > extremeUpper).length : 0;
    const deviation = standardDeviation(numericValues);
    numericStats = {
      count: numericValues.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: mean(numericValues),
      standardDeviation: deviation,
      q1,
      median,
      q3,
      zeros: numericValues.filter((value) => value === 0).length,
      negatives: numericValues.filter((value) => value < 0).length,
      outlierCount,
      outlierRate: outlierCount / Math.max(numericValues.length, 1),
      extremeOutlierCount,
      skewIndicator: deviation ? (mean(numericValues) - median) / deviation : 0,
    };
    if (numericStats.outlierRate >= thresholds.outlierWarningRate) {
      columnIssues.push(issue({ dimension: 'distribution', severity: extremeOutlierCount > 0 ? 'warning' : 'info', title: 'Potential numeric outliers', description: `${outlierCount.toLocaleString()} values in ${name} fall outside the 1.5×IQR range.`, recommendation: 'Validate whether these values are genuine extremes, unit errors, or data-entry problems before modeling.', column: name, affectedRows: outlierCount, affectedRate: numericStats.outlierRate }));
    }
  }

  const dateValues = present.map(parseDate);
  const validDates = dateValues.filter((value): value is Date => value !== null);
  let dateStats: DateQualityStats | undefined;
  if (validDates.length && validDates.length / Math.max(nonNullCount, 1) >= 0.5) {
    const timestamps = validDates.map((value) => value.getTime()).sort((a, b) => a - b);
    const now = Date.now();
    const latest = timestamps[timestamps.length - 1];
    dateStats = {
      validCount: validDates.length,
      invalidCount: nonNullCount - validDates.length,
      min: new Date(timestamps[0]).toISOString(),
      max: new Date(latest).toISOString(),
      futureCount: timestamps.filter((timestamp) => timestamp > now + DAY_MS).length,
      daysSinceLatest: Math.floor((now - latest) / DAY_MS),
    };
    if (dateStats.invalidCount > 0) {
      columnIssues.push(issue({ dimension: 'validity', severity: dateStats.invalidCount / Math.max(nonNullCount, 1) > 0.1 ? 'critical' : 'warning', title: 'Invalid date values', description: `${dateStats.invalidCount.toLocaleString()} values in ${name} cannot be parsed as dates.`, recommendation: 'Standardize the date format and quarantine invalid values before time-based analysis.', column: name, affectedRows: dateStats.invalidCount, affectedRate: dateStats.invalidCount / Math.max(nonNullCount, 1) }));
    }
    if (dateStats.futureCount > 0) {
      columnIssues.push(issue({ dimension: 'validity', severity: 'warning', title: 'Future-dated records', description: `${dateStats.futureCount.toLocaleString()} values in ${name} are later than today.`, recommendation: 'Confirm whether future records are forecasts or invalid transaction dates.', column: name, affectedRows: dateStats.futureCount, affectedRate: dateStats.futureCount / Math.max(nonNullCount, 1) }));
    }
  }

  const top = topValues(values, rowCount);
  const constant = distinctCount <= 1 && nonNullCount > 0;
  const nearConstant = top[0]?.share >= 0.98 && distinctCount > 1;
  const highCardinality = distinctCount > Math.max(80, rowCount * 0.2);
  const identifierCandidate = identifierName(name) || (uniquenessRate >= 0.98 && highCardinality);
  const sensitiveReasons = potentialSensitiveReasons(name, values);
  const potentialSensitive = sensitiveReasons.length > 0;

  if (constant) {
    columnIssues.push(issue({ dimension: 'distribution', severity: 'info', title: 'Constant column', description: `${name} contains only one non-missing value.`, recommendation: 'Exclude it from anomaly scans unless the constant is required for lineage or filtering.', column: name }));
  } else if (nearConstant) {
    columnIssues.push(issue({ dimension: 'distribution', severity: 'info', title: 'Near-constant column', description: `${(top[0].share * 100).toFixed(1)}% of rows share the same value in ${name}.`, recommendation: 'Review whether this field contributes meaningful segmentation.', column: name, affectedRows: top[0].count, affectedRate: top[0].share }));
  }
  if (identifierCandidate) {
    columnIssues.push(issue({ dimension: 'readiness', severity: 'info', title: 'Identifier-like column', description: `${name} appears to be a row or entity identifier.`, recommendation: 'Keep it for traceability, but exclude it from category-level anomaly ranking.', column: name }));
  }
  if (potentialSensitive) {
    columnIssues.push(issue({ dimension: 'privacy', severity: 'warning', title: 'Potential sensitive data', description: `${name} may contain sensitive information because ${sensitiveReasons.join(' and ')}.`, recommendation: 'Apply access controls, masking, minimization, and approved retention rules before sharing or sending data to an LLM.', column: name }));
  }

  let analysisRole: AnalysisRole = 'excluded';
  if (identifierCandidate) analysisRole = 'identifier';
  else if (inferredKind === 'numeric' && typeConsistency >= 0.9 && nullRate < 0.5 && !constant) analysisRole = 'measure';
  else if (['categorical', 'date', 'boolean'].includes(inferredKind) && distinctCount > 1 && !highCardinality && nullRate < 0.7) analysisRole = 'dimension';

  const formatIssueRate = stringStats ? (stringStats.leadingTrailingWhitespaceCount + stringStats.normalizedCollisionRows) / Math.max(nonNullCount * 2, 1) : 0;
  const distributionPenalty = (numericStats?.outlierRate ?? 0) * 1.5 + (constant ? 0.3 : nearConstant ? 0.12 : 0);
  const qualityScore = clampScore(100 * (
    0.42 * (1 - nullRate)
    + 0.28 * typeConsistency
    + 0.18 * (1 - Math.min(1, formatIssueRate))
    + 0.12 * (1 - Math.min(1, distributionPenalty))
  ));

  return {
    name,
    inferredKind,
    runtimeTypes,
    dominantType,
    typeConsistency,
    rowCount,
    nonNullCount,
    nullCount,
    nullRate,
    distinctCount,
    uniquenessRate,
    duplicateValueRows,
    topValues: top,
    constant,
    nearConstant,
    highCardinality,
    identifierCandidate,
    potentialSensitive,
    sensitiveReasons,
    analysisRole,
    excludedFromAnalysis: analysisRole === 'excluded' || analysisRole === 'identifier',
    qualityScore,
    issues: columnIssues,
    numeric: numericStats,
    date: dateStats,
    string: stringStats,
  };
}

function pearson(rows: DataRow[], left: string, right: string): CorrelationFinding | null {
  const pairs = rows.map((row) => [finiteNumber(row[left]), finiteNumber(row[right])] as const).filter((pair): pair is readonly [number, number] => pair[0] !== null && pair[1] !== null);
  if (pairs.length < 20) return null;
  const xs = pairs.map((pair) => pair[0]);
  const ys = pairs.map((pair) => pair[1]);
  const mx = mean(xs);
  const my = mean(ys);
  const numerator = pairs.reduce((sum, pair) => sum + (pair[0] - mx) * (pair[1] - my), 0);
  const dx = Math.sqrt(xs.reduce((sum, value) => sum + (value - mx) ** 2, 0));
  const dy = Math.sqrt(ys.reduce((sum, value) => sum + (value - my) ** 2, 0));
  if (!dx || !dy) return null;
  return { left, right, correlation: numerator / (dx * dy), sampleSize: pairs.length };
}

function correlations(rows: DataRow[], columns: ColumnQualityProfile[]) {
  const numericColumns = columns.filter((column) => column.analysisRole === 'measure').slice(0, 14);
  const findings: CorrelationFinding[] = [];
  for (let i = 0; i < numericColumns.length; i += 1) {
    for (let j = i + 1; j < numericColumns.length; j += 1) {
      const finding = pearson(rows, numericColumns[i].name, numericColumns[j].name);
      if (finding && Math.abs(finding.correlation) >= 0.8) findings.push(finding);
    }
  }
  return findings.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)).slice(0, 20);
}

function functionalDependencies(rows: DataRow[], columns: ColumnQualityProfile[]) {
  const candidates = columns.filter((column) => column.analysisRole === 'dimension' && column.distinctCount <= 60).slice(0, 20);
  const findings: DependencyFinding[] = [];
  for (const determinant of candidates) {
    for (const dependent of candidates) {
      if (determinant.name === dependent.name || determinant.distinctCount < dependent.distinctCount) continue;
      const groups = new Map<string, Map<string, number>>();
      let usable = 0;
      for (const row of rows) {
        const left = row[determinant.name];
        const right = row[dependent.name];
        if (isMissing(left) || isMissing(right)) continue;
        usable += 1;
        const key = String(left);
        const values = groups.get(key) ?? new Map<string, number>();
        const rightKey = String(right);
        values.set(rightKey, (values.get(rightKey) ?? 0) + 1);
        groups.set(key, values);
      }
      if (usable < 30) continue;
      let consistentRows = 0;
      for (const values of groups.values()) {
        if (values.size === 1) consistentRows += [...values.values()][0];
      }
      const confidence = consistentRows / usable;
      if (confidence >= 0.98) findings.push({ determinant: determinant.name, dependent: dependent.name, confidence, rows: usable });
    }
  }
  return findings.sort((a, b) => b.confidence - a.confidence || b.rows - a.rows).slice(0, 20);
}

function missingPatterns(rows: DataRow[], columns: string[]): MissingPattern[] {
  const patterns = new Map<string, number>();
  for (const row of rows) {
    const missing = columns.filter((column) => isMissing(row[column]));
    if (!missing.length) continue;
    const key = missing.slice(0, 8).join('|') + (missing.length > 8 ? '|…' : '');
    patterns.set(key, (patterns.get(key) ?? 0) + 1);
  }
  return [...patterns.entries()]
    .map(([key, count]) => ({ columns: key.split('|'), count, share: count / Math.max(rows.length, 1) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

export function analyzeDataQuality(rows: DataRow[], options: DataQualityOptions = {}): DataQualityReport {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort((a, b) => a.localeCompare(b));
  const rowCount = rows.length;
  const columnCount = columns.length;
  const cellCount = rowCount * columnCount;
  const missingCells = rows.reduce((sum, row) => sum + columns.filter((column) => isMissing(row[column])).length, 0);
  const missingRate = missingCells / Math.max(cellCount, 1);
  const raggedRows = rows.filter((row) => columns.some((column) => !Object.prototype.hasOwnProperty.call(row, column))).length;
  const emptyRows = rows.filter((row) => columns.every((column) => isMissing(row[column]))).length;

  const rowCounts = new Map<string, number>();
  for (const row of rows) {
    const key = canonicalRow(row, columns);
    rowCounts.set(key, (rowCounts.get(key) ?? 0) + 1);
  }
  const duplicateRows = [...rowCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const duplicateRate = duplicateRows / Math.max(rowCount, 1);

  const columnProfiles = columns.map((column) => profileColumn(rows, column, options));
  const issues: QualityIssue[] = columnProfiles.flatMap((column) => column.issues);
  const thresholds = { ...DEFAULTS, ...options };

  if (!rowCount) {
    issues.push(issue({ dimension: 'readiness', severity: 'critical', title: 'No rows', description: 'The dataset does not contain any records.', recommendation: 'Load a non-empty tabular dataset before running quality or anomaly analysis.' }));
  }
  if (!columnCount) {
    issues.push(issue({ dimension: 'readiness', severity: 'critical', title: 'No columns', description: 'The dataset does not contain any fields.', recommendation: 'Confirm the file has a header row or JSON object properties.' }));
  }
  if (duplicateRate >= thresholds.duplicateWarningRate && duplicateRows > 0) {
    issues.push(issue({ dimension: 'uniqueness', severity: duplicateRate >= 0.1 ? 'critical' : 'warning', title: 'Duplicate rows', description: `${duplicateRows.toLocaleString()} rows duplicate an earlier row across all available columns.`, recommendation: 'Confirm the intended grain and deduplicate before calculating totals or anomaly contributions.', affectedRows: duplicateRows, affectedRate: duplicateRate }));
  }
  if (raggedRows > 0) {
    issues.push(issue({ dimension: 'integrity', severity: raggedRows / Math.max(rowCount, 1) > 0.1 ? 'critical' : 'warning', title: 'Ragged records', description: `${raggedRows.toLocaleString()} rows do not contain the same set of fields as the complete schema.`, recommendation: 'Normalize the source schema and distinguish absent fields from explicit null values.', affectedRows: raggedRows, affectedRate: raggedRows / Math.max(rowCount, 1) }));
  }
  if (emptyRows > 0) {
    issues.push(issue({ dimension: 'completeness', severity: 'warning', title: 'Empty records', description: `${emptyRows.toLocaleString()} rows contain no usable values.`, recommendation: 'Remove empty records during ingestion.', affectedRows: emptyRows, affectedRate: emptyRows / Math.max(rowCount, 1) }));
  }

  for (const required of options.requiredColumns ?? []) {
    if (!columns.includes(required)) {
      issues.push(issue({ dimension: 'schema', severity: 'critical', title: 'Required column missing', description: `Required column ${required} is not present.`, recommendation: 'Correct the source schema or update the required-column rule.', column: required }));
    }
  }

  for (const keyColumn of options.keyColumns ?? []) {
    const profile = columnProfiles.find((column) => column.name === keyColumn);
    if (!profile) {
      issues.push(issue({ dimension: 'integrity', severity: 'critical', title: 'Configured key missing', description: `Configured key ${keyColumn} is not present.`, recommendation: 'Correct the key configuration or source schema.', column: keyColumn }));
    } else if (profile.nullCount > 0 || profile.uniquenessRate < 1) {
      issues.push(issue({ dimension: 'integrity', severity: 'critical', title: 'Key is not unique and complete', description: `${keyColumn} has ${profile.nullCount.toLocaleString()} missing values and ${(profile.uniquenessRate * 100).toFixed(1)}% uniqueness.`, recommendation: 'Repair duplicate or missing key values before joins, updates, or row-level traceability.', column: keyColumn }));
    }
  }

  const measureCandidates = columnProfiles.filter((column) => column.analysisRole === 'measure').map((column) => column.name);
  const dimensionCandidates = columnProfiles.filter((column) => column.analysisRole === 'dimension').map((column) => column.name);
  const identifierCandidates = columnProfiles.filter((column) => column.analysisRole === 'identifier').map((column) => column.name);
  const sensitiveColumns = columnProfiles.filter((column) => column.potentialSensitive).map((column) => column.name);

  if (!measureCandidates.length) {
    issues.push(issue({ dimension: 'readiness', severity: 'critical', title: 'No reliable numeric measure', description: 'No numeric column currently passes the basic type, completeness, and variability checks.', recommendation: 'Clean or select a numeric measure before running anomaly analysis.' }));
  }
  if (dimensionCandidates.length < 2) {
    issues.push(issue({ dimension: 'readiness', severity: 'critical', title: 'Insufficient dimensions', description: 'Fewer than two analysis-ready categorical, date, or boolean dimensions were found.', recommendation: 'Provide additional descriptive fields or clean excluded dimensions before drill-down analysis.' }));
  }

  const completenessScore = clampScore(100 * (1 - missingRate) - (emptyRows / Math.max(rowCount, 1)) * 20);
  const uniquenessScore = clampScore(100 * (1 - duplicateRate));
  const validityScore = clampScore(mean(columnProfiles.map((column) => column.typeConsistency * 100)) - issues.filter((item) => item.dimension === 'validity' && item.severity === 'critical').length * 8);
  const consistencyIssueRate = columnProfiles.reduce((sum, column) => sum + (column.string?.leadingTrailingWhitespaceCount ?? 0) + (column.string?.normalizedCollisionRows ?? 0), 0) / Math.max(cellCount, 1);
  const consistencyScore = clampScore(100 * (1 - Math.min(1, consistencyIssueRate * 3)) - (raggedRows / Math.max(rowCount, 1)) * 20);
  const outlierRows = columnProfiles.reduce((sum, column) => sum + (column.numeric?.outlierCount ?? 0), 0);
  const numericCells = columnProfiles.reduce((sum, column) => sum + (column.numeric?.count ?? 0), 0);
  const distributionScore = clampScore(100 * (1 - Math.min(1, outlierRows / Math.max(numericCells, 1) * 2)));
  const integrityScore = clampScore(100 - duplicateRate * 100 - raggedRows / Math.max(rowCount, 1) * 100);
  const readinessScore = clampScore((measureCandidates.length ? 45 : 0) + (dimensionCandidates.length >= 2 ? 45 : dimensionCandidates.length * 20) + (rowCount >= 20 ? 10 : rowCount / 2));

  let timelinessScore: number | null = null;
  const dateColumns = columnProfiles.filter((column) => column.date?.daysSinceLatest !== null && column.date?.daysSinceLatest !== undefined);
  if (typeof options.freshnessSlaDays === 'number' && options.freshnessSlaDays >= 0 && dateColumns.length) {
    const freshest = Math.min(...dateColumns.map((column) => Math.max(0, column.date?.daysSinceLatest ?? 0)));
    timelinessScore = clampScore(100 * (1 - Math.max(0, freshest - options.freshnessSlaDays) / Math.max(options.freshnessSlaDays * 3, 1)));
    if (freshest > options.freshnessSlaDays) {
      issues.push(issue({ dimension: 'timeliness', severity: freshest > options.freshnessSlaDays * 3 ? 'critical' : 'warning', title: 'Freshness SLA missed', description: `The newest observed date is ${freshest.toLocaleString()} days old, beyond the ${options.freshnessSlaDays}-day SLA.`, recommendation: 'Check source refresh schedules, late-arriving records, and pipeline failures.' }));
    }
  }

  const dimensions: QualityDimensionResult[] = [
    { id: 'completeness', label: 'Completeness', score: completenessScore, status: dimensionStatus(completenessScore), summary: `${(missingRate * 100).toFixed(1)}% of cells are missing.`, measured: true },
    { id: 'uniqueness', label: 'Uniqueness', score: uniquenessScore, status: dimensionStatus(uniquenessScore), summary: `${duplicateRows.toLocaleString()} exact duplicate rows found.`, measured: true },
    { id: 'validity', label: 'Validity', score: validityScore, status: dimensionStatus(validityScore), summary: 'Checks runtime type consistency, date validity, and usable numeric values.', measured: true },
    { id: 'conformity', label: 'Conformity & consistency', score: consistencyScore, status: dimensionStatus(consistencyScore), summary: 'Checks schema shape, whitespace, casing, and category-format consistency.', measured: true },
    { id: 'integrity', label: 'Structural integrity', score: integrityScore, status: dimensionStatus(integrityScore), summary: 'Checks duplicate records, ragged rows, and configured key rules.', measured: true },
    { id: 'distribution', label: 'Distribution & outliers', score: distributionScore, status: dimensionStatus(distributionScore), summary: 'Checks extreme values, constant fields, concentration, and numerical spread.', measured: true },
    { id: 'timeliness', label: 'Timeliness & freshness', score: timelinessScore, status: dimensionStatus(timelinessScore), summary: timelinessScore === null ? 'Add a freshness SLA to score this dimension.' : 'Compared with the configured freshness SLA.', measured: timelinessScore !== null },
    { id: 'accuracy', label: 'Accuracy', score: null, status: 'not-configured', summary: 'Requires a trusted source, reconciliation rule, or business validation dataset.', measured: false },
    { id: 'drift', label: 'Drift & stability', score: null, status: 'not-configured', summary: 'Requires a prior profile, reference period, or approved baseline.', measured: false },
    { id: 'lineage', label: 'Lineage & provenance', score: null, status: 'not-configured', summary: 'Requires source-system, transformation, ownership, and refresh metadata.', measured: false },
    { id: 'privacy', label: 'Privacy & sensitivity', score: sensitiveColumns.length ? 75 : 100, status: sensitiveColumns.length ? 'warning' : 'pass', summary: `${sensitiveColumns.length.toLocaleString()} potentially sensitive columns detected.`, measured: true },
    { id: 'readiness', label: 'Analysis readiness', score: readinessScore, status: dimensionStatus(readinessScore), summary: `${measureCandidates.length} measure candidates and ${dimensionCandidates.length} dimension candidates are ready.`, measured: true },
  ];

  const measuredScores = dimensions.filter((dimension) => dimension.score !== null && dimension.id !== 'privacy').map((dimension) => dimension.score as number);
  const overallScore = clampScore(mean(measuredScores));
  const blockers = issues.filter((item) => item.severity === 'critical').length;
  const warnings = issues.filter((item) => item.severity === 'warning').length;
  const analysisReady = blockers === 0 && measureCandidates.length > 0 && dimensionCandidates.length >= 2 && rowCount > 0;

  return {
    generatedAt: new Date().toISOString(),
    rowCount,
    columnCount,
    cellCount,
    missingCells,
    missingRate,
    duplicateRows,
    duplicateRate,
    raggedRows,
    emptyRows,
    overallScore,
    status: statusForScore(overallScore),
    analysisReady,
    blockers,
    warnings,
    dimensions,
    issues: issues.sort((a, b) => ({ critical: 0, warning: 1, info: 2 }[a.severity] - ({ critical: 0, warning: 1, info: 2 }[b.severity])),
    columns: columnProfiles.sort((a, b) => a.qualityScore - b.qualityScore || a.name.localeCompare(b.name)),
    correlations: correlations(rows, columnProfiles),
    functionalDependencies: functionalDependencies(rows, columnProfiles),
    missingPatterns: missingPatterns(rows, columns),
    measureCandidates,
    dimensionCandidates,
    identifierCandidates,
    sensitiveColumns,
    concepts: [
      { name: 'Completeness', description: 'Required values are present at the row, column, and dataset level.', coverage: 'measured' },
      { name: 'Uniqueness', description: 'Rows, business keys, and identifiers do not contain unintended duplicates.', coverage: 'measured' },
      { name: 'Validity', description: 'Values conform to their expected types, parse rules, and allowed formats.', coverage: 'measured' },
      { name: 'Conformity', description: 'Values use consistent representations, units, casing, whitespace, and labels.', coverage: 'measured' },
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
      { name: 'Usability / readiness', description: 'The dataset contains reliable measures, dimensions, dates, and identifiers for the intended analysis.', coverage: 'measured' },
    ],
  };
}
