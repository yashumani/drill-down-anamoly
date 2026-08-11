export type DataRow = Record<string, string | number | boolean | null>;

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
  actual: number;
  expected: number;
  variance: number;
  shareOfAbsVariance: number;
  surprise: number;
}

export interface DimensionScore {
  dimension: string;
  score: number;
  impact: number;
  surprise: number;
  concentration: number;
  distinctCount: number;
  topCategory: CategoryContribution | null;
  categories: CategoryContribution[];
}

export interface InteractionSegment {
  predicates: Predicate[];
  count: number;
  actual: number;
  expected: number;
  variance: number;
  lift: number;
  score: number;
}

export interface InvestigationResult {
  rowCount: number;
  actual: number;
  expected: number;
  variance: number;
  variancePct: number | null;
  anomalyScore: number;
  dimensionsScanned: number;
  dimensionScores: DimensionScore[];
  interactions: InteractionSegment[];
}
