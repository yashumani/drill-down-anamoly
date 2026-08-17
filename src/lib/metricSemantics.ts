import type { AttributionAggregation, DataRow, MetricPolarity } from '../types';

export type MetricAggregation = AttributionAggregation | 'ratio' | 'distinct_count';
export type MetricCertificationStatus = 'draft' | 'certified' | 'deprecated' | 'unknown';

export interface MetricDefinition {
  metricId: string;
  name: string;
  description: string;
  owner: string;
  certificationStatus: MetricCertificationStatus;
  aggregation: MetricAggregation;
  polarity: MetricPolarity;
  unit: string;
  currency?: string;
  scale: number;
  fiscalYearStartMonth: number;
  actualField: string;
  comparisonField?: string;
  numeratorMetricId?: string;
  denominatorMetricId?: string;
  validDimensions: string[];
  sourceSystem?: string;
  caveats: string[];
  semanticCompleteness: number;
  missingSemantics: string[];
  attributionSupported: boolean;
}

function firstValue(rows: DataRow[], field: string) {
  for (const row of rows) {
    const value = row[field];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return '';
}

function normalizeAggregation(value: string): MetricAggregation {
  const normalized = value.toLowerCase().replace(/[\s-]+/g, '_');
  if (['average', 'avg', 'mean'].includes(normalized)) return 'average';
  if (['period_end', 'ending_balance', 'snapshot', 'last_value'].includes(normalized)) return 'period_end';
  if (['ratio', 'rate', 'percentage', 'percent'].includes(normalized)) return 'ratio';
  if (['distinct_count', 'count_distinct', 'unique_count'].includes(normalized)) return 'distinct_count';
  return 'sum';
}

function normalizePolarity(value: string): MetricPolarity {
  const normalized = value.toLowerCase().replace(/[\s-]+/g, '_');
  return normalized === 'lower_is_better' || normalized === 'lower' ? 'lower_is_better' : 'higher_is_better';
}

function normalizeCertification(value: string): MetricCertificationStatus {
  const normalized = value.toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'certified' || normalized === 'approved') return 'certified';
  if (normalized === 'draft' || normalized === 'provisional') return 'draft';
  if (normalized === 'deprecated' || normalized === 'retired') return 'deprecated';
  return 'unknown';
}

function fiscalStart(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : 1;
}

function numericScale(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function inferMetricDefinition({
  rows,
  actualField,
  comparisonField,
  dimensions,
}: {
  rows: DataRow[];
  actualField: string;
  comparisonField?: string;
  dimensions: string[];
}): MetricDefinition {
  const metricId = firstValue(rows, 'metric_id') || actualField || 'metric';
  const name = firstValue(rows, 'metric_name') || actualField || 'Selected metric';
  const description = firstValue(rows, 'metric_definition') || firstValue(rows, 'metric_description');
  const owner = firstValue(rows, 'metric_owner');
  const certificationStatus = normalizeCertification(firstValue(rows, 'metric_certification'));
  const aggregation = normalizeAggregation(firstValue(rows, 'aggregation_method'));
  const polarity = normalizePolarity(firstValue(rows, 'metric_polarity'));
  const unit = firstValue(rows, 'metric_unit') || firstValue(rows, 'currency') || 'unspecified';
  const currency = firstValue(rows, 'currency') || undefined;
  const scale = numericScale(firstValue(rows, 'metric_scale'));
  const fiscalYearStartMonth = fiscalStart(firstValue(rows, 'fiscal_year_start_month'));
  const numeratorMetricId = firstValue(rows, 'numerator_metric_id') || undefined;
  const denominatorMetricId = firstValue(rows, 'denominator_metric_id') || undefined;
  const sourceSystem = firstValue(rows, 'source_system') || undefined;
  const caveats = unique([
    firstValue(rows, 'metric_caveat'),
    firstValue(rows, 'close_process_note'),
    firstValue(rows, 'allocation_note'),
  ]);
  const missingSemantics: string[] = [];
  if (!description) missingSemantics.push('business definition');
  if (!owner) missingSemantics.push('metric owner');
  if (certificationStatus === 'unknown') missingSemantics.push('certification status');
  if (unit === 'unspecified') missingSemantics.push('unit or currency');
  if ((aggregation === 'ratio') && (!numeratorMetricId || !denominatorMetricId)) {
    missingSemantics.push('ratio numerator and denominator');
  }
  if (!comparisonField) missingSemantics.push('approved comparison scenario');

  const requiredCount = 6;
  const presentCount = requiredCount - Math.min(requiredCount, missingSemantics.length);
  const semanticCompleteness = Math.round(presentCount / requiredCount * 100);
  const attributionSupported = aggregation === 'sum' || aggregation === 'average' || aggregation === 'period_end';
  if (!attributionSupported) {
    caveats.push(`${aggregation.replace('_', ' ')} attribution requires a governed calculation strategy and is disabled in the current driver engine.`);
  }

  return {
    metricId,
    name,
    description,
    owner,
    certificationStatus,
    aggregation,
    polarity,
    unit,
    currency,
    scale,
    fiscalYearStartMonth,
    actualField,
    comparisonField,
    numeratorMetricId,
    denominatorMetricId,
    validDimensions: unique(dimensions),
    sourceSystem,
    caveats,
    semanticCompleteness,
    missingSemantics,
    attributionSupported,
  };
}

export function metricDefinitionLimitations(definition: MetricDefinition) {
  const limitations = [...definition.caveats];
  if (definition.missingSemantics.length) {
    limitations.push(`Metric semantics still require: ${definition.missingSemantics.join(', ')}.`);
  }
  if (definition.certificationStatus !== 'certified') {
    limitations.push(`Metric certification status is ${definition.certificationStatus}; management commentary should remain provisional.`);
  }
  return unique(limitations);
}
