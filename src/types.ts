export type DataValue = string | number | boolean | null;
export type DataRow = Record<string, DataValue>;

export type MetricPolarity = 'higher_is_better' | 'lower_is_better';
export type ImpactDirection = 'favorable' | 'unfavorable' | 'neutral';
export type AttributionAggregation = 'sum' | 'average' | 'period_end';
export type AttributionBasis = 'total' | 'support_weighted_average' | 'latest_period_total';

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
  businessImpact: number;
  impactDirection: ImpactDirection;
  variancePerRow: number;
  businessImpactPerRow: number;
  shareOfAbsVariance: number;
  surprise: number;
  standardizedResidual: number;
  attributionBasis: AttributionBasis;
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
  businessImpact: number;
  impactDirection: ImpactDirection;
  variancePerRow: number;
  businessImpactPerRow: number;
  lift: number;
  score: number;
  attributionBasis: AttributionBasis;
}

export interface InvestigationResult {
  calculationVersion: string;
  runId: string;
  generatedAt: string;
  rowCount: number;
  validRowCount: number;
  excludedMeasureRows: number;
  actual: number;
  expected: number;
  variance: number;
  businessImpact: number;
  impactDirection: ImpactDirection;
  variancePct: number | null;
  anomalyScore: number;
  residualScale: number;
  baselineMethod: 'target' | 'robust-median';
  metricPolarity: MetricPolarity;
  aggregationMethod: AttributionAggregation;
  attributionBasis: AttributionBasis;
  attributionReconciles: boolean;
  attributionPopulationDate?: string;
  dimensionsScanned: number;
  dimensionScores: DimensionScore[];
  interactions: InteractionSegment[];
  warnings: string[];
}
