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
  'metric_id',
  'metric_name',
  'metric_unit',
  'currency',
  'metric_polarity',
  'aggregation_method',
  'fiscal_year_start_month',
  'source_system',
  'scenario',
]);

const COMPARISON_PRIORITY: Record<string, number> = {
  plan: 5,
  budget: 5,
  target: 5,
  expected: 5,
  forecast: 4,
  outlook: 4,
  prior_year: 2,
  prior: 2,
};

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

  const comparisonField = ['plan_value', 'budget_value', 'target_value', 'forecast_value']
    .find((field) => fields.includes(field));
  report.comparisonField = comparisonField;
  if (!comparisonField) {
    report.warnings.push('No plan_value, budget_value, target_value, or forecast_value column was found. The dashboard will use a rolling historical baseline.');
  }

  const dimensionFields = fields.filter((field) => field.toLowerCase().startsWith(FINANCE_DATA_CONTRACT_FIELDS.dimensionPrefix));
  report.dimensionFields = dimensionFields;
  report.normalizedDimensionFields = dimensionFields.map(cleanedDimensionName);
  if (!dimensionFields.length) {
    report.warnings.push('No dim_* columns were found. Time-series analysis will work, but multidimensional driver analysis will be limited.');
  }

  const metricFields = fields.filter((field) => field === 'metric_id' || field === 'metric_name');
  const metricNames = uniqueStrings(rows, metricFields);
  report.metricNames = metricNames;
  if (metricNames.length > 1) {
    report.errors.push('Finance Data Contract v1 accepts one metric per uploaded file. Split this file by metric_id or metric_name before analysis.');
  }

  const normalized = rows.map((row) => {
    const output: DataRow = {
      period_date: row.period_date ?? null,
      actual: row.actual_value ?? null,
    };

    if (comparisonField) output.target = row[comparisonField] ?? null;
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
  comparisonPriority: number;
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

  const metricFields = fields.filter((field) => field === 'metric_id' || field === 'metric_name');
  const metricNames = uniqueStrings(rows, metricFields);
  report.metricNames = metricNames;
  if (metricNames.length > 1) {
    report.errors.push('Finance Data Contract v1 accepts one metric per uploaded file. Split this long-format file by metric_id or metric_name before analysis.');
  }

  const grouped = new Map<string, PivotRow>();
  let actualScenarioCount = 0;

  for (const source of rows) {
    const scenario = normalizedScenario(source.scenario);
    const value = finiteNumber(source.value);
    if (value === null) continue;

    const keyParts: Record<string, DataValue> = { period_date: source.period_date ?? null };
    for (const field of dimensionFields) keyParts[cleanedDimensionName(field)] = source[field] ?? null;
    for (const field of metricFields) keyParts[field] = source[field] ?? null;
    if (fields.includes('record_id')) keyParts.record_id = source.record_id ?? null;

    const key = JSON.stringify(keyParts);
    const existing = grouped.get(key) ?? { row: { ...keyParts }, comparisonPriority: -1 };

    if (scenario === 'actual') {
      actualScenarioCount += 1;
      existing.row.actual = (finiteNumber(existing.row.actual) ?? 0) + value;
    } else if (scenario === 'forecast') {
      existing.row.forecast = (finiteNumber(existing.row.forecast) ?? 0) + value;
      if (COMPARISON_PRIORITY.forecast > existing.comparisonPriority) {
        existing.row.target = value;
        existing.comparisonPriority = COMPARISON_PRIORITY.forecast;
      }
    } else if (scenario === 'prior_year') {
      existing.row.prior_year = (finiteNumber(existing.row.prior_year) ?? 0) + value;
    } else if (COMPARISON_PRIORITY[scenario] !== undefined) {
      const priority = COMPARISON_PRIORITY[scenario];
      if (priority > existing.comparisonPriority) {
        existing.row.target = value;
        existing.comparisonPriority = priority;
      } else if (priority === existing.comparisonPriority) {
        existing.row.target = (finiteNumber(existing.row.target) ?? 0) + value;
      }
    }

    for (const field of fields) {
      if (METADATA_FIELDS.has(field) && !['scenario', 'record_id', 'metric_id', 'metric_name'].includes(field)) {
        existing.row[field] = source[field] ?? null;
      }
    }
    grouped.set(key, existing);
  }

  if (!actualScenarioCount) report.errors.push('Long-format data must contain at least one scenario value of actual, actuals, reported, or observed.');

  const normalized = [...grouped.values()].map(({ row }) => row);
  report.outputRows = normalized.length;
  if (normalized.some((row) => row.target === undefined)) {
    report.warnings.push('Some long-format grains have no plan, budget, target, or forecast value. Those rows may be excluded from Actual-versus-Plan analysis.');
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

export const FINANCE_DATA_TEMPLATE_CSV = `period_date,actual_value,plan_value,forecast_value,metric_name,metric_polarity,aggregation_method,currency,metric_unit,fiscal_year_start_month,dim_region,dim_business_unit,dim_product,dim_channel,dim_customer_segment,dim_cost_center,dim_department,dim_vendor,dim_project,dim_campaign\n2025-01-31,1285000,1320000,1300000,Net Revenue,higher_is_better,sum,USD,USD,1,West,Consumer,Wireless,Retail,Enterprise,CC100,Sales,Vendor A,Project Atlas,Winter Promo\n2025-02-28,1340000,1365000,1355000,Net Revenue,higher_is_better,sum,USD,USD,1,West,Consumer,Wireless,Digital,Enterprise,CC100,Sales,Vendor A,Project Atlas,Spring Launch\n2025-03-31,1420000,1390000,1410000,Net Revenue,higher_is_better,sum,USD,USD,1,East,Business,Fiber,Partner,Mid Market,CC220,Commercial,Vendor B,Project Beacon,Always On`;

export function downloadFinanceDataTemplate() {
  const blob = new Blob([FINANCE_DATA_TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'fpa-finance-data-contract-v1.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}
