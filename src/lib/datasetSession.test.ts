import { describe, expect, it } from 'vitest';
import { createDatasetSession, hashDataRows } from './datasetSession';
import { normalizeFinanceDataRows } from './financeDataContract';
import type { DataRow } from '../types';

describe('dataset session', () => {
  it('preserves finance contract evidence and deterministic content identity', () => {
    const raw: DataRow[] = [{
      period_date: '2025-01-31',
      actual_value: 120,
      plan_value: 100,
      metric_id: 'REV',
      metric_name: 'Revenue',
      metric_definition: 'Recognized revenue.',
      metric_owner: 'FP&A',
      metric_certification: 'certified',
      aggregation_method: 'sum',
      metric_polarity: 'higher_is_better',
      dim_region: 'West',
    }];
    const normalized = normalizeFinanceDataRows(raw);
    const session = createDatasetSession({
      rows: normalized.rows,
      source: { kind: 'upload', name: 'revenue.csv' },
      contractReport: normalized.report,
    });
    expect(session.contractReport.detected).toBe(true);
    expect(session.metricDefinition.metricId).toBe('REV');
    expect(session.contentHash).toBe(hashDataRows(normalized.rows));
    expect(session.sessionId).toContain(session.contentHash);
  });
});
