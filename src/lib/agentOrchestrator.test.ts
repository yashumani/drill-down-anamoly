import { describe, expect, it } from 'vitest';
import { runDeterministicAgent, validateAgentResponse } from './agentOrchestrator';
import { buildEvidenceLedger } from './evidenceLedger';
import { inferMetricDefinition } from './metricSemantics';
import { investigate } from './anomaly';
import type { DataRow } from '../types';

const rows: DataRow[] = Array.from({ length: 40 }, (_, index) => ({
  region: index < 20 ? 'West' : 'East',
  actual: index < 20 ? 80 : 105,
  target: 100,
  period_date: `2025-${String(index % 12 + 1).padStart(2, '0')}-01`,
}));

describe('evidence-first deterministic agent', () => {
  it('returns only validated evidence identifiers and safe UI actions', () => {
    const result = investigate(rows, ['region'], 'actual', 'target');
    const metric = inferMetricDefinition({ rows, actualField: 'actual', comparisonField: 'target', dimensions: ['region'] });
    const ledger = buildEvidenceLedger({ result, predicates: [], metricDefinition: metric });
    const context = {
      rows,
      dimensions: ['region'],
      actualKey: 'actual',
      expectedKey: 'target',
      metricPolarity: 'higher_is_better' as const,
      predicates: [],
      result,
    };
    const response = runDeterministicAgent('What is driving the result?', context, ledger);
    const validation = validateAgentResponse(response, ledger, ['region']);
    expect(response.evidenceIds.length).toBeGreaterThan(0);
    expect(validation.valid).toBe(true);
    expect(response.calculationRunId).toBe(result.runId);
  });
});
