import { describe, expect, it } from 'vitest';
import { investigate } from './anomaly';
import { createDatasetSession } from './datasetSession';
import { buildEvidenceLedger } from './evidenceLedger';
import { createInvestigationSnapshot, validateInvestigationSnapshot } from './investigationSnapshot';
import type { DataRow } from '../types';

const rows: DataRow[] = Array.from({ length: 24 }, (_, index) => ({
  period_date: `2025-${String(index % 12 + 1).padStart(2, '0')}-01`,
  region: index < 12 ? 'West' : 'East',
  actual: index < 12 ? 90 : 105,
  target: 100,
  metric_id: 'REV_NET',
  metric_name: 'Net Revenue',
  metric_polarity: 'higher_is_better',
  aggregation_method: 'sum',
}));

describe('investigation snapshot', () => {
  it('preserves dataset, metric, calculation, and evidence identities', () => {
    const session = createDatasetSession({ rows, source: { kind: 'embedded', name: 'Test data' } });
    const result = investigate(rows, ['region'], 'actual', 'target');
    const ledger = buildEvidenceLedger({
      result,
      predicates: [],
      datasetSession: session,
      metricDefinition: session.metricDefinition,
      dataQuality: session.qualityReport,
    });
    const snapshot = createInvestigationSnapshot({
      datasetSession: session,
      metricDefinition: session.metricDefinition,
      actualKey: 'actual',
      expectedKey: 'target',
      metricPolarity: 'higher_is_better',
      aggregation: 'sum',
      timeField: 'period_date',
      timeGrain: 'month',
      timeWindow: '15m',
      fiscalYearStartMonth: 1,
      materialityPercent: 0.03,
      predicates: [],
      investigation: result,
      timeSeries: null,
      evidenceLedger: ledger,
    });

    expect(snapshot.dataset.sessionId).toBe(session.sessionId);
    expect(snapshot.investigation.runId).toBe(ledger.calculationRunId);
    expect(validateInvestigationSnapshot(snapshot)).toEqual({ valid: true, errors: [] });
  });

  it('rejects evidence from a different calculation run', () => {
    const session = createDatasetSession({ rows, source: { kind: 'embedded', name: 'Test data' } });
    const result = investigate(rows, ['region'], 'actual', 'target');
    const ledger = buildEvidenceLedger({
      result,
      predicates: [],
      datasetSession: session,
      metricDefinition: session.metricDefinition,
    });
    const snapshot = createInvestigationSnapshot({
      datasetSession: session,
      metricDefinition: session.metricDefinition,
      actualKey: 'actual',
      expectedKey: 'target',
      metricPolarity: 'higher_is_better',
      aggregation: 'sum',
      timeGrain: 'month',
      timeWindow: 'all',
      fiscalYearStartMonth: 1,
      materialityPercent: 0.03,
      predicates: [],
      investigation: result,
      timeSeries: null,
      evidenceLedger: ledger,
    });
    snapshot.evidenceLedger.calculationRunId = 'different-run';
    const validation = validateInvestigationSnapshot(snapshot);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toContain('does not match');
  });
});
