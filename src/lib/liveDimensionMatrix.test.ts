import { describe, expect, it } from 'vitest';
import { buildLiveDimensionMatrix } from './liveDimensionMatrix';
import type { LiveMonthlyPoint } from './livePublicFinance';

function point(month: number, actual = 100): LiveMonthlyPoint {
  const key = `2025-${String(month).padStart(2, '0')}`;
  return {
    key,
    label: `M${month}`,
    periodStart: `2025-${String(month).padStart(2, '0')}-01T00:00:00.000`,
    periodEnd: `2025-${String(month).padStart(2, '0')}-28T00:00:00.000`,
    actual,
    expected: 100,
    variance: actual - 100,
    businessImpact: 100 - actual,
    variancePct: (actual - 100) / 100,
    transactions: 10,
    anomalyScore: 0,
    materialityThreshold: 3,
    alertSeverity: 'normal',
    partialPeriod: false,
  };
}

describe('live dimension matrix', () => {
  it('creates category-by-period business-impact cells', () => {
    const periods = [1, 2, 3, 4].map((month) => point(month));
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

    expect(result.cells).toHaveLength(8);
    const latestA = result.cells.find((cell) => cell.category === 'A' && cell.periodKey === '2025-04');
    expect(latestA?.businessImpact).toBe(-80);
    expect(result.latestContributions[0].category).toBe('A');
  });

  it('reconciles top categories to the selected-scope total with Other', () => {
    const periods = [1, 2, 3, 4].map((month) => point(month));
    const result = buildLiveDimensionMatrix({
      dimension: { field: 'fund_name', label: 'Fund', description: 'Test' },
      categories: ['A'],
      periods,
      currentTotalImpact: -100,
      rows: [
        ...[1, 2, 3, 4].map((month) => ({ value: 'A', fiscal_year: 2025, fiscal_month_number: month, amount: month === 4 ? 180 : 100, transactions: 10 })),
      ],
    });

    expect(result.latestContributions.at(-1)?.category).toBe('Other categories');
    expect(result.latestContributions.reduce((sum, item) => sum + item.businessImpact, 0)).toBeCloseTo(-100);
  });
});
