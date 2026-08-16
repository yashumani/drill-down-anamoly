import { describe, expect, it } from 'vitest';
import type { DataRow } from '../types';
import { buildFinanceTimeSeries, detectTimeFields } from './timeIntelligence';
import { filterRowsByTimeWindow } from './timeWindow';

function monthlyRows(): DataRow[] {
  return Array.from({ length: 15 }, (_, index) => {
    const year = 2025 + Math.floor(index / 12);
    const month = index % 12 + 1;
    return {
      month: `${year}-${String(month).padStart(2, '0')}`,
      actual: 100 + index,
      target: 100,
      region: index % 2 ? 'West' : 'East',
    };
  });
}

describe('finance time intelligence', () => {
  it('detects a monthly time field and produces 15 monthly periods', () => {
    const rows = monthlyRows();
    const candidates = detectTimeFields(rows);
    expect(candidates[0]?.field).toBe('month');
    expect(candidates[0]?.suggestedGrain).toBe('month');

    const result = buildFinanceTimeSeries({
      rows,
      actualKey: 'actual',
      expectedKey: 'target',
      timeField: 'month',
      grain: 'month',
      window: '15m',
      aggregation: 'sum',
      metricPolarity: 'higher_is_better',
      fiscalYearStartMonth: 1,
      materialityPercent: 0.03,
    });

    expect(result.allPoints).toHaveLength(15);
    expect(result.points).toHaveLength(15);
    expect(result.currentPeriod?.actual).toBe(114);
    expect(result.currentPeriod?.expected).toBe(100);
    expect(result.currentPeriod?.businessImpact).toBe(14);
    expect(result.qtd?.actual).toBe(339);
    expect(result.qtd?.expected).toBe(300);
    expect(result.qtd?.businessImpact).toBe(39);
    expect(result.ytd?.businessImpact).toBe(39);
    expect(result.runId).toMatch(/^fin-/);
  });

  it('reverses business impact when lower values are better', () => {
    const result = buildFinanceTimeSeries({
      rows: monthlyRows(),
      actualKey: 'actual',
      expectedKey: 'target',
      timeField: 'month',
      grain: 'month',
      window: '15m',
      aggregation: 'sum',
      metricPolarity: 'lower_is_better',
    });

    expect(result.currentPeriod?.variance).toBe(14);
    expect(result.currentPeriod?.businessImpact).toBe(-14);
    expect(result.currentPeriod?.impactDirection).toBe('unfavorable');
  });

  it('filters the driver-analysis population to the selected rolling window', () => {
    const rows = monthlyRows();
    const filtered = filterRowsByTimeWindow(rows, 'month', 'ytd', 1);
    expect(filtered).toHaveLength(3);
    expect(filtered[0]?.month).toBe('2026-01');
    expect(filtered[2]?.month).toBe('2026-03');
  });

  it('uses the last dated snapshot for period-end aggregation', () => {
    const rows: DataRow[] = [
      { date: '2026-01-01', actual: 90, target: 100, account: 'A' },
      { date: '2026-01-31', actual: 110, target: 100, account: 'A' },
      { date: '2026-01-31', actual: 40, target: 50, account: 'B' },
    ];
    const result = buildFinanceTimeSeries({
      rows,
      actualKey: 'actual',
      expectedKey: 'target',
      timeField: 'date',
      grain: 'month',
      window: 'all',
      aggregation: 'period_end',
      metricPolarity: 'higher_is_better',
    });

    expect(result.currentPeriod?.actual).toBe(150);
    expect(result.currentPeriod?.expected).toBe(150);
    expect(result.currentPeriod?.businessImpact).toBe(0);
  });
});
