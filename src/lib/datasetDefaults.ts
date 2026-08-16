import type { PlanningLens } from './fpaInsights';
import type { AggregationMethod } from './timeIntelligence';
import type { DataRow, MetricPolarity } from '../types';

export interface DatasetDefaults {
  actualKey: string;
  expectedKey: string;
  metricPolarity: MetricPolarity;
  planningLens: PlanningLens;
  aggregation: AggregationMethod;
  fiscalYearStartMonth: number;
  datasetLabel: string;
  metricLabel: string;
}

function firstValue(rows: DataRow[], field: string) {
  for (const row of rows) {
    const value = row[field];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return '';
}

function hasField(rows: DataRow[], field: string) {
  return rows.some((row) => Object.prototype.hasOwnProperty.call(row, field));
}

function planningLens(rows: DataRow[]): PlanningLens {
  const explicit = firstValue(rows, 'planning_lens').toLowerCase().replace(/[\s-]+/g, '_');
  if (['revenue', 'opex', 'capex', 'marketing', 'corporate', 'workforce'].includes(explicit)) {
    return explicit as PlanningLens;
  }
  const metric = `${firstValue(rows, 'metric_name')} ${firstValue(rows, 'metric_id')}`.toLowerCase();
  if (/(capex|capital|asset|investment)/.test(metric)) return 'capex';
  if (/(marketing|campaign|media|demand|lead)/.test(metric)) return 'marketing';
  if (/(headcount|workforce|fte|labor|employee|attrition)/.test(metric)) return 'workforce';
  if (/(opex|expense|cost|spend|vendor)/.test(metric)) return 'opex';
  if (/(corporate|g&a|general and administrative|legal|allocation)/.test(metric)) return 'corporate';
  return 'revenue';
}

function aggregation(rows: DataRow[]): AggregationMethod {
  const value = firstValue(rows, 'aggregation_method').toLowerCase().replace(/[\s-]+/g, '_');
  if (value === 'average' || value === 'avg' || value === 'mean') return 'average';
  if (value === 'period_end' || value === 'ending_balance' || value === 'snapshot') return 'period_end';
  return 'sum';
}

function polarity(rows: DataRow[]): MetricPolarity {
  const value = firstValue(rows, 'metric_polarity').toLowerCase().replace(/[\s-]+/g, '_');
  if (value === 'lower_is_better' || value === 'lower') return 'lower_is_better';
  return 'higher_is_better';
}

function fiscalStart(rows: DataRow[]) {
  const parsed = Number(firstValue(rows, 'fiscal_year_start_month'));
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : 1;
}

export function inferDatasetDefaults(rows: DataRow[], measureCandidates: string[]): DatasetDefaults {
  const actualKey = hasField(rows, 'actual') && measureCandidates.includes('actual')
    ? 'actual'
    : measureCandidates[0] ?? '';
  const expectedKey = ['target', 'plan', 'budget', 'forecast', 'business_target', 'prior_year']
    .find((field) => field !== actualKey && hasField(rows, field) && measureCandidates.includes(field))
    ?? measureCandidates.find((field) => field !== actualKey)
    ?? '';
  return {
    actualKey,
    expectedKey,
    metricPolarity: polarity(rows),
    planningLens: planningLens(rows),
    aggregation: aggregation(rows),
    fiscalYearStartMonth: fiscalStart(rows),
    datasetLabel: firstValue(rows, 'dataset_name') || 'Uploaded finance data',
    metricLabel: firstValue(rows, 'metric_name') || actualKey || 'Selected metric',
  };
}
