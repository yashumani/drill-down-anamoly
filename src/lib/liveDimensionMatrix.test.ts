import { describe, expect, it } from 'vitest';
import { buildLiveDimensionMatrix } from './liveDimensionMatrix';
import type { LiveMonthlyPoint } from './livePublicFinance';

function point(month: number, actual = 150, expected = 150, transactions = 15): LiveMonthlyPoint {
  const key = `2025-${String(month).padStart(2, '0')}`;
  return {
    key,
    label: `M${month}`,
    periodStart: `2025-${String(month).padStart(2, '0')}-01T00:00:00.000`,
    periodEnd: `2025-${String(month).padStart(2, '0')}-28T00:00:00.000`,
    actual,
    expected,
    variance: actual - expected,
    businessImpact: expected - actual,
    variancePct: expected === 0 ? null : (actual - expected) / expected,
    transactions,
    anomalyScore: 0,
    materialityThreshold: 3,
    alertSeverity: 'normal',
    partialPeriod: false,
  };
}

describe('live dimension matrix', () => {
  it('creates category-by-period business-impact cells using historical mix', () => {
    const periods = [point(1), point(2), point(3), point(4, 230, 150, 15)];
    const result = buildLiveDimensionMatrix({
      dimension: { field: 'department_name', label: 'Department', description: 'Test' },
      categories: ['A', 'B'],
      periods,
      currentTotalImpact: -80,
      rows: [
        ...[1, 2, 3, 4].map((month) => ({ value: 'A', fiscal_year: 2025, fiscal_month_number: month, amount: month === 4 ? 180 : 100, transactions: 10 })),
        ...[1, 2, 3, 4].map((month) => ({ value: 'B', fiscal_year: 2025, fiscal_month_number: month, amount: 50, transactions: 5 })),
      ],
    });

    expect(result.cells).toHaveLength(12);
    const latestA = result.cells.find((cell) => cell.category === 'A' && cell.periodKey === '2025-04');
    expect(latestA?.expected).toBeCloseTo(100);
    expect(latestA?.businessImpact).toBeCloseTo(-80);
    expect(result.latestContributions[0].category).toBe('A');
  });

  it('reconciles top categories and Other exactly to the selected-scope total', () => {
    const periods = [point(1), point(2), point(3), point(4, 250, 150, 15)];
    const result = buildLiveDimensionMatrix({
      dimension: { field: 'fund_name', label: 'Fund', description: 'Test' },
      categories: ['A'],
      periods,
      currentTotalImpact: -100,
      rows: [
        ...[1, 2, 3, 4].map((month) => ({ value: 'A', fiscal_year: 2025, fiscal_month_number: month, amount: month === 4 ? 180 : 100, transactions: 10 })),
      ],
    });

    expect(result.categories).toContain('Other categories');
    expect(result.latestContributions.at(-1)?.category).toBe('Other categories');
    expect(result.latestContributions.reduce((sum, item) => sum + item.businessImpact, 0)).toBeCloseTo(-100);
    expect(result.warning).toBeUndefined();
  });
});
