import { describe, expect, it } from 'vitest';
import { runExternalEventStudy } from './externalEventStudy';
import type { DataRow } from '../types';

function rows() {
  const output: DataRow[] = [];
  const start = new Date('2025-01-01T00:00:00.000Z');
  for (let index = 0; index < 60; index += 1) {
    const date = new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10);
    const afterEvent = index >= 30;
    output.push({ period_date: date, region: 'Affected', actual: afterEvent ? 80 : 100, target: 100 });
    output.push({ period_date: date, region: 'Control', actual: 100, target: 100 });
  }
  return output;
}

describe('external event study', () => {
  it('detects an unfavorable affected-versus-control deterioration', () => {
    const result = runExternalEventStudy({
      rows: rows(),
      eventId: 'event-1',
      eventTitle: 'Competitor price action',
      eventDate: '2025-01-31',
      timeField: 'period_date',
      actualKey: 'actual',
      expectedKey: 'target',
      metricPolarity: 'higher_is_better',
      affectedPredicates: [{ dimension: 'region', value: 'Affected' }],
      controlPredicates: [{ dimension: 'region', value: 'Control' }],
      preDays: 30,
      postDays: 29,
      expectedDirection: 'unfavorable',
    });

    expect(result.method).toBe('difference_in_differences');
    expect(result.rawEffect).toBeCloseTo(-20);
    expect(result.businessImpactEffect).toBeCloseTo(-20);
    expect(result.impactDirection).toBe('unfavorable');
    expect(['supported', 'weak']).toContain(result.status);
    expect(result.affected.prePeriods).toBeGreaterThanOrEqual(29);
    expect(result.control?.postPeriods).toBeGreaterThanOrEqual(29);
  });

  it('reports insufficient evidence when the time window is too sparse', () => {
    const result = runExternalEventStudy({
      rows: rows().slice(0, 8),
      eventId: 'event-2',
      eventTitle: 'Sparse event',
      eventDate: '2025-01-03',
      timeField: 'period_date',
      actualKey: 'actual',
      expectedKey: 'target',
      metricPolarity: 'higher_is_better',
      affectedPredicates: [{ dimension: 'region', value: 'Affected' }],
      preDays: 7,
      postDays: 7,
      expectedDirection: 'unknown',
    });

    expect(result.status).toBe('insufficient');
    expect(result.confidence).toBe('low');
  });
});
