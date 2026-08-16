import { describe, expect, it } from 'vitest';
import { normalizeFinanceDataRows } from './financeDataContract';

describe('Finance Data Contract v1', () => {
  it('normalizes canonical wide data and strips dim_ prefixes', () => {
    const result = normalizeFinanceDataRows([
      {
        period_date: '2025-01-31',
        actual_value: 120,
        plan_value: 100,
        metric_name: 'Revenue',
        dim_region: 'West',
        dim_product: 'Wireless',
      },
    ]);

    expect(result.report.detected).toBe(true);
    expect(result.report.mode).toBe('canonical-wide');
    expect(result.rows[0]).toMatchObject({
      period_date: '2025-01-31',
      actual: 120,
      target: 100,
      region: 'West',
      product: 'Wireless',
    });
  });

  it('pivots canonical long scenarios into actual and target values', () => {
    const result = normalizeFinanceDataRows([
      { period_date: '2025-01-31', scenario: 'actual', value: 120, metric_name: 'Revenue', dim_region: 'West' },
      { period_date: '2025-01-31', scenario: 'budget', value: 100, metric_name: 'Revenue', dim_region: 'West' },
      { period_date: '2025-01-31', scenario: 'forecast', value: 110, metric_name: 'Revenue', dim_region: 'West' },
    ]);

    expect(result.report.mode).toBe('canonical-long');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ actual: 120, target: 100, forecast: 110, region: 'West' });
  });

  it('rejects multi-metric files in the v1 contract report', () => {
    const result = normalizeFinanceDataRows([
      { period_date: '2025-01-31', actual_value: 120, plan_value: 100, metric_name: 'Revenue', dim_region: 'West' },
      { period_date: '2025-01-31', actual_value: 80, plan_value: 90, metric_name: 'Expense', dim_region: 'West' },
    ]);

    expect(result.report.errors.join(' ')).toContain('one metric per uploaded file');
  });

  it('leaves non-contract datasets unchanged', () => {
    const rows = [{ month: '2025-01', actual: 12, target: 10, region: 'West' }];
    const result = normalizeFinanceDataRows(rows);
    expect(result.report.detected).toBe(false);
    expect(result.rows).toBe(rows);
  });
});
