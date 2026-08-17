import type { DataRow, DataValue } from '../types';

export const FINANCE_DATA_CONTRACT_VERSION = '1.0';

export const FINANCE_DATA_CONTRACT_FIELDS = {
  requiredWide: ['period_date', 'actual_value'] as const,
  recommendedWide: ['plan_value', 'metric_name', 'metric_polarity', 'aggregation_method'] as const,
  requiredLong: ['period_date', 'scenario', 'value'] as const,
  dimensionPrefix: 'dim_',
} as const;

export type FinanceContractMode = 'canonical-wide' | 'canonical-long' | 'unrecognized';

export interface FinanceDataContractReport {
  version: typeof FINANCE_DATA_CONTRACT_VERSION;
  detected: boolean;
  mode: FinanceContractMode;
  inputRows: number;
  outputRows: number;
  dateField?: string;
  actualField?: string;
  comparisonField?: string;
  scenarioField?: string;
  valueField?: string;
  dimensionFields: string[];
  normalizedDimensionFields: string[];
  metricNames: string[];
  warnings: string[];
  errors: string[];
}

export interface FinanceDataNormalizationResult {
  rows: DataRow[];
  report: FinanceDataContractReport;
}

const METADATA_FIELDS = new Set([
  'record_id',
  'dataset_name',
  'metric_id',
  'metric_name',
  'metric_definition',
  'metric_description',
  'metric_owner',
  'metric_certification',
  'metric_unit',
  'metric_scale',
  'numerator_metric_id',
  'denominator_metric_id',
  'metric_caveat',
  'close_process_note',
  'allocation_note',
  'currency',
  'metric_polarity',
  'aggregation_method',
  'fiscal_year_start_month',
  'planning_lens',
  'source_system',
  'scenario',
]);

const COMPARISON_PRIORITY: Record<string, number> = {
  plan: 6,
  budget: 6,
  target: 6,
  expected: 6,
  forecast: 5,
  outlook: 5,
};

const WIDE_COMPARISON_FIELDS = ['plan_value', 'budget_value', 'target_value', 'forecast_value'] as const;

function allFields(rows: DataRow[]) {
  return [...new Set(rows.flatMap((row) => Object.keys(row)))];
}

function finiteNumber(value: DataValue | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function cleanedDimensionName(field: string) {
  const stripped = field.replace(/^dim_/i, '');
  return stripped
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || field;
}

function uniqueStrings(rows: DataRow[], fields: string[]) {
  const values = new Set<string>();
  for (const row of rows) {
    for (const field of fields) {
      const value = row[field];
      if (value !== null && value !== undefined && String(value).trim()) values.add(String(value).trim());
    }
  }
  return [...values];
}

function metricSummary(rows: DataRow[], fields: string[]) {
  const identityField = fields.includes('metric_id') ? 'metric_id' : fields.includes('metric_name') ? 'metric_name' : '';
  const identities = identityField ? uniqueStrings(rows, [identityField]) : [];
  const metricNames = fields.includes('metric_name') ? uniqueStrings(rows, ['metric_name']) : identities;
  return { identityField, identities, metricNames };
}

function validateMetricIdentity(report: FinanceDataContractReport, rows: DataRow[], fields: string[], formatLabel: string) {
  const summary = metricSummary(rows, fields);
  report.metricNames = summary.metricNames;
  if (summary.identities.length > 1) {
    report.errors.push(`Finance Data Contract v1 accepts one metric per uploaded file. Split this ${formatLabel} file by ${summary.identityField || 'metric'} before analysis.`);
  }
  if (summary.identities.length === 1 && summary.metricNames.length > 1) {
    report.warnings.push('One metric_id is associated with multiple metric_name values. The calculations can run, but the metric label should be standardized.');
  }
}

function validateAggregation(report: FinanceDataContractReport, rows: DataRow[], fields: string[]) {
  if (!fields.includes('aggregation_method')) return;
  const supported = new Set(['sum', 'average', 'avg', 'mean', 'period_end', 'ending_balance', 'snapshot']);
  const values = uniqueStrings(rows, ['aggregation_method']).map((value) => value.toLowerCase().replace(/[\s-]+/g, '_'));
  const unsupported = values.filter((value) => !supported.has(value));
  if (unsupported.length) {
    report.errors.push(`Finance Data Contract v1 does not yet support aggregation_method values: ${unsupported.join(', ')}. Use sum, average, or period_end, or provide a governed semantic extension.`);
  }
}

function baseReport(rows: DataRow[]): FinanceDataContractReport {
  return {
    version: FINANCE_DATA_CONTRACT_VERSION,
    detected: false,
    mode: 'unrecognized',
    inputRows: rows.length,
    outputRows: rows.length,
    dimensionFields: [],
    normalizedDimensionFields: [],
    metricNames: [],
    warnings: [],
    errors: [],
  };
}

function normalizeWide(rows: DataRow[], fields: string[]): FinanceDataNormalizationResult {
  const report = baseReport(rows);
  report.detected = true;
  report.mode = 'canonical-wide';
  report.dateField = 'period_date';
  report.actualField = 'actual_value';

  const availableComparisons = WIDE_COMPARISON_FIELDS.filter((field) => fields.includes(field));
  const comparisonField = availableComparisons[0];
  report.comparisonField = comparisonField;
  if (!comparisonField) {
    report.warnings.push('No plan_value, budget_value, target_value, or forecast_value column was found. The dashboard will use a rolling historical baseline.');
  } else if (availableComparisons.length > 1) {
    report.warnings.push(`${comparisonField} was selected as the primary comparison. ${availableComparisons.slice(1).join(', ')} remain available as supporting measures.`);
  }

  const dimensionFields = fields.filter((field) => field.toLowerCase().startsWith(FINANCE_DATA_CONTRACT_FIELDS.dimensionPrefix));
  report.dimensionFields = dimensionFields;
  report.normalizedDimensionFields = dimensionFields.map(cleanedDimensionName);
  if (!dimensionFields.length) {
    report.warnings.push('No dim_* columns were found. Time-series analysis will work, but multidimensional driver analysis will be limited.');
  }

  validateMetricIdentity(report, rows, fields, 'wide-format');
  validateAggregation(report, rows, fields);

  const normalized = rows.map((row) => {
    const output: DataRow = {
      period_date: row.period_date ?? null,
      actual: row.actual_value ?? null,
    };

    if (comparisonField) output.target = row[comparisonField] ?? null;
    if (fields.includes('plan_value')) output.plan = row.plan_value ?? null;
    if (fields.includes('budget_value')) output.budget = row.budget_value ?? null;
    if (fields.includes('target_value')) output.business_target = row.target_value ?? null;
    if (fields.includes('forecast_value')) output.forecast = row.forecast_value ?? null;
    if (fields.includes('prior_year_value')) output.prior_year = row.prior_year_value ?? null;

    for (const field of dimensionFields) output[cleanedDimensionName(field)] = row[field] ?? null;
    for (const field of fields) {
      if (METADATA_FIELDS.has(field) && field !== 'scenario') output[field] = row[field] ?? null;
    }
    return output;
  });

  report.outputRows = normalized.length;
  return { rows: normalized, report };
}

function normalizedScenario(value: DataValue | undefined) {
  const scenario = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['actual', 'actuals', 'reported', 'observed'].includes(scenario)) return 'actual';
  if (['plan', 'budget', 'target', 'expected'].includes(scenario)) return scenario;
  if (['forecast', 'outlook', 'latest_estimate', 'latest_forecast'].includes(scenario)) return 'forecast';
  if (['prior_year', 'prior', 'py', 'last_year'].includes(scenario)) return 'prior_year';
  return scenario;
}

interface PivotRow {
  row: DataRow;
  scenarioTotals: Map<string, number>;
}

function normalizeLong(rows: DataRow[], fields: string[]): FinanceDataNormalizationResult {
  const report = baseReport(rows);
  report.detected = true;
  report.mode = 'canonical-long';
  report.dateField = 'period_date';
  report.scenarioField = 'scenario';
  report.valueField = 'value';
  report.actualField = 'value where scenario = actual';
  report.comparisonField = 'value where scenario = plan/budget/target/forecast';

  const dimensionFields = fields.filter((field) => field.toLowerCase().startsWith(FINANCE_DATA_CONTRACT_FIELDS.dimensionPrefix));
  report.dimensionFields = dimensionFields;
  report.normalizedDimensionFields = dimensionFields.map(cleanedDimensionName);
  if (!dimensionFields.length) report.warnings.push('No dim_* columns were found. Driver analysis will be limited.');

  validateMetricIdentity(report, rows, fields, 'long-format');
  validateAggregation(report, rows, fields);
  const metricKeyFields = fields.includes('metric_id') ? ['metric_id'] : fields.includes('metric_name') ? ['metric_name'] : [];
  const grouped = new Map<string, PivotRow>();
  const observedScenarios = new Set<string>();

  for (const source of rows) {
    const scenario = normalizedScenario(source.scenario);
    const value = finiteNumber(source.value);
    if (value === null || !scenario) continue;
    observedScenarios.add(scenario);

    const keyParts: Record<string, DataValue> = { period_date: source.period_date ?? null };
    for (const field of dimensionFields) keyParts[cleanedDimensionName(field)] = source[field] ?? null;
    for (const field of metricKeyFields) keyParts[field] = source[field] ?? null;

    const key = JSON.stringify(keyParts);
    const existing = grouped.get(key) ?? { row: { ...keyParts }, scenarioTotals: new Map<string, number>() };
    existing.scenarioTotals.set(scenario, (existing.scenarioTotals.get(scenario) ?? 0) + value);

    for (const field of fields) {
      if (METADATA_FIELDS.has(field) && !['scenario', 'record_id'].includes(field)) {
        existing.row[field] = source[field] ?? null;
      }
    }
    grouped.set(key, existing);
  }

  if (!observedScenarios.has('actual')) {
    report.errors.push('Long-format data must contain at least one scenario value of actual, actuals, reported, or observed.');
  }

  const comparisonScenarios = [...observedScenarios]
    .filter((scenario) => COMPARISON_PRIORITY[scenario] !== undefined)
    .sort((left, right) => COMPARISON_PRIORITY[right] - COMPARISON_PRIORITY[left] || left.localeCompare(right));
  const primaryComparison = comparisonScenarios[0];
  if (comparisonScenarios.length > 1) {
    report.warnings.push(`${primaryComparison} was selected as the primary long-format comparison scenario. ${comparisonScenarios.slice(1).join(', ')} remain available as supporting measures.`);
  }

  const normalized = [...grouped.values()].map(({ row, scenarioTotals }) => {
    const output = { ...row };
    if (scenarioTotals.has('actual')) output.actual = scenarioTotals.get('actual') ?? null;
    if (primaryComparison && scenarioTotals.has(primaryComparison)) output.target = scenarioTotals.get(primaryComparison) ?? null;
    if (scenarioTotals.has('forecast')) output.forecast = scenarioTotals.get('forecast') ?? null;
    if (scenarioTotals.has('prior_year')) output.prior_year = scenarioTotals.get('prior_year') ?? null;
    for (const scenario of ['plan', 'budget', 'target', 'expected']) {
      if (scenarioTotals.has(scenario)) output[scenario === 'target' ? 'business_target' : scenario] = scenarioTotals.get(scenario) ?? null;
    }
    return output;
  });

  report.outputRows = normalized.length;
  if (normalized.some((row) => row.target === undefined)) {
    report.warnings.push('Some long-format grains have no primary comparison value. Those rows may be excluded from Actual-versus-Plan analysis.');
  }
  return { rows: normalized, report };
}

export function normalizeFinanceDataRows(rows: DataRow[]): FinanceDataNormalizationResult {
  const fields = allFields(rows);
  const hasWide = FINANCE_DATA_CONTRACT_FIELDS.requiredWide.every((field) => fields.includes(field));
  const hasLong = FINANCE_DATA_CONTRACT_FIELDS.requiredLong.every((field) => fields.includes(field));
  if (hasWide) return normalizeWide(rows, fields);
  if (hasLong) return normalizeLong(rows, fields);
  return { rows, report: baseReport(rows) };
}

export const FINANCE_DATA_TEMPLATE_CSV = `period_date,actual_value,plan_value,forecast_value,dataset_name,metric_id,metric_name,metric_definition,metric_owner,metric_certification,metric_polarity,aggregation_method,planning_lens,currency,metric_unit,fiscal_year_start_month,dim_region,dim_business_unit,dim_product,dim_channel,dim_customer_segment,dim_cost_center,dim_department,dim_vendor,dim_project,dim_campaign\n2025-01-31,1285000,1320000,1300000,Enterprise FP&A Demo,REV_NET,Net Revenue,Recognized net revenue after credits,Revenue Finance,certified,higher_is_better,sum,revenue,USD,USD,1,West,Consumer,Wireless,Retail,Enterprise,CC100,Sales,Vendor A,Project Atlas,Winter Promo\n2025-02-28,1340000,1365000,1355000,Enterprise FP&A Demo,REV_NET,Net Revenue,Recognized net revenue after credits,Revenue Finance,certified,higher_is_better,sum,revenue,USD,USD,1,West,Consumer,Wireless,Digital,Enterprise,CC100,Sales,Vendor A,Project Atlas,Spring Launch\n2025-03-31,1420000,1390000,1410000,Enterprise FP&A Demo,REV_NET,Net Revenue,Recognized net revenue after credits,Revenue Finance,certified,higher_is_better,sum,revenue,USD,USD,1,East,Business,Fiber,Partner,Mid Market,CC220,Commercial,Vendor B,Project Beacon,Always On`;

export function downloadFinanceDataTemplate() {
  const blob = new Blob([FINANCE_DATA_TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'fpa-finance-data-contract-v1.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}
