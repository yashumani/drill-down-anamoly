import { describe, expect, it } from 'vitest';
import { investigate } from './anomaly';
import type { DataRow } from '../types';

describe('aggregation-aware driver attribution', () => {
  it('reconciles support-weighted category contributions for average metrics', () => {
    const rows: DataRow[] = Array.from({ length: 40 }, (_, index) => ({
      group: index < 20 ? 'A' : 'B',
      actual: index < 20 ? 120 : 80,
      target: 100,
      period_date: '2025-01-31',
    }));
    const result = investigate(rows, ['group'], 'actual', 'target', [], 'higher_is_better', { aggregationMethod: 'average' });
    const score = result.dimensionScores[0];
    expect(result.actual).toBe(100);
    expect(result.expected).toBe(100);
    expect(result.businessImpact).toBeCloseTo(0);
    expect(score.categories.reduce((sum, category) => sum + category.businessImpact, 0)).toBeCloseTo(result.businessImpact);
    expect(result.attributionBasis).toBe('support_weighted_average');
  });

  it('uses only the latest timestamp for period-end attribution', () => {
    const rows: DataRow[] = [
      ...Array.from({ length: 20 }, (_, index) => ({ period_date: '2025-01-31', group: index < 10 ? 'A' : 'B', actual: 10, target: 10 })),
      ...Array.from({ length: 20 }, (_, index) => ({ period_date: '2025-02-28', group: index < 10 ? 'A' : 'B', actual: index < 10 ? 12 : 8, target: 10 })),
    ];
    const result = investigate(rows, ['group'], 'actual', 'target', [], 'higher_is_better', {
      aggregationMethod: 'period_end',
      timeField: 'period_date',
    });
    expect(result.validRowCount).toBe(20);
    expect(result.actual).toBe(200);
    expect(result.expected).toBe(200);
    expect(result.attributionPopulationDate?.slice(0, 10)).toBe('2025-02-28');
    expect(result.attributionReconciles).toBe(true);
  });

  it('warns rather than silently claiming a period-end population without a date field', () => {
    const rows: DataRow[] = Array.from({ length: 40 }, (_, index) => ({ group: index < 20 ? 'A' : 'B', actual: 10, target: 9 }));
    const result = investigate(rows, ['group'], 'actual', 'target', [], 'higher_is_better', { aggregationMethod: 'period_end' });
    expect(result.attributionReconciles).toBe(false);
    expect(result.warnings.some((warning) => warning.includes('could not identify a valid latest date'))).toBe(true);
  });
});
