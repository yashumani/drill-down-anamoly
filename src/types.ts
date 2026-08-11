export type DataValue = string | number | boolean | null;
export type DataRow = Record<string, DataValue>;

export interface FieldProfile {
  name: string;
  kind: 'numeric' | 'categorical' | 'date' | 'boolean' | 'identifier';
  distinctCount: number;
  nullCount: number;
}

export interface Predicate {
  dimension: string;
  value: string;
}

export interface CategoryContribution {
  dimension: string;
  value: string;
  count: number;
  support: number;
  actual: number;
  expected: number;
  variance: number;
  variancePerRow: number;
  shareOfAbsVariance: number;
  surprise: number;
  standardizedResidual: number;
}

export interface DimensionScore {
  dimension: string;
  score: number;
  impact: number;
  surprise: number;
  concentration: number;
  supportQuality: number;
  cardinalityPenalty: number;
  distinctCount: number;
  topCategory: CategoryContribution | null;
  categories: CategoryContribution[];
}

export interface InteractionSegment {
  predicates: Predicate[];
  count: number;
  support: number;
  actual: number;
  expected: number;
  variance: number;
  variancePerRow: number;
  lift: number;
  score: number;
}

export interface InvestigationResult {
  rowCount: number;
  validRowCount: number;
  excludedMeasureRows: number;
  actual: number;
  expected: number;
  variance: number;
  variancePct: number | null;
  anomalyScore: number;
  residualScale: number;
  baselineMethod: 'target' | 'robust-median';
  dimensionsScanned: number;
  dimensionScores: DimensionScore[];
  interactions: InteractionSegment[];
  warnings: string[];
}
