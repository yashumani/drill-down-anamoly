import { describe, expect, it } from 'vitest';
import type { DataRow } from '../types';
import { applyPredicates, investigate } from './anomaly';

const rows: DataRow[] = [
  { region: 'West', actual: 120, target: 100 },
  { region: 'West', actual: 110, target: 100 },
  { region: 'East', actual: 90, target: 100 },
  { region: null, actual: null, target: 100 },
];

describe('anomaly engine', () => {
  it('excludes invalid measure rows instead of silently converting them to zero', () => {
    const result = investigate(rows, ['region'], 'actual', 'target');
    expect(result.rowCount).toBe(4);
    expect(result.validRowCount).toBe(3);
    expect(result.excludedMeasureRows).toBe(1);
    expect(result.actual).toBe(320);
    expect(result.expected).toBe(300);
    expect(result.variance).toBe(20);
  });

  it('applies metric polarity to business impact', () => {
    const higherIsBetter = investigate(rows, ['region'], 'actual', 'target', [], 'higher_is_better');
    const lowerIsBetter = investigate(rows, ['region'], 'actual', 'target', [], 'lower_is_better');
    expect(higherIsBetter.businessImpact).toBe(20);
    expect(higherIsBetter.impactDirection).toBe('favorable');
    expect(lowerIsBetter.businessImpact).toBe(-20);
    expect(lowerIsBetter.impactDirection).toBe('unfavorable');
  });

  it('uses the same canonical missing label for grouping and drill filters', () => {
    const missingRows = applyPredicates(rows, [{ dimension: 'region', value: '(missing)' }]);
    expect(missingRows).toHaveLength(1);
    expect(missingRows[0]?.region).toBeNull();
  });
});
