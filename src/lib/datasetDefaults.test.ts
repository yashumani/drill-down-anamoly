import { describe, expect, it } from 'vitest';
import { inferDatasetDefaults } from './datasetDefaults';

describe('finance dataset defaults', () => {
  it('uses canonical contract fields and metadata', () => {
    const rows = [{
      period_date: '2025-01-31',
      actual: 120,
      target: 100,
      forecast: 110,
      dataset_name: 'OpEx Review',
      metric_name: 'Operating Expense',
      metric_polarity: 'lower_is_better',
      aggregation_method: 'sum',
      planning_lens: 'opex',
      fiscal_year_start_month: 7,
      cost_center: 'CC100',
    }];
    const defaults = inferDatasetDefaults(rows, ['actual', 'target', 'forecast']);
    expect(defaults).toMatchObject({
      actualKey: 'actual',
      expectedKey: 'target',
      metricPolarity: 'lower_is_better',
      planningLens: 'opex',
      aggregation: 'sum',
      fiscalYearStartMonth: 7,
      datasetLabel: 'OpEx Review',
      metricLabel: 'Operating Expense',
    });
  });

  it('infers period-end aggregation and workforce lens', () => {
    const defaults = inferDatasetDefaults([{
      actual: 100,
      target: 98,
      metric_name: 'Ending Headcount',
      aggregation_method: 'period_end',
    }], ['actual', 'target']);
    expect(defaults.aggregation).toBe('period_end');
    expect(defaults.planningLens).toBe('workforce');
  });
});
