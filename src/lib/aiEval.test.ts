import { describe, expect, it } from 'vitest';
import { evaluateAgentResponse } from './aiEval';
import { runDeterministicAgent } from './agentOrchestrator';
import { buildEvidenceLedger } from './evidenceLedger';
import { inferMetricDefinition } from './metricSemantics';
import { investigate } from './anomaly';
import type { DataRow } from '../types';

describe('AI evaluation gate', () => {
  it('passes an evidence-grounded deterministic response', () => {
    const rows: DataRow[] = Array.from({ length: 40 }, (_, index) => ({ region: index < 20 ? 'West' : 'East', actual: index < 20 ? 80 : 105, target: 100 }));
    const result = investigate(rows, ['region'], 'actual', 'target');
    const metric = inferMetricDefinition({ rows, actualField: 'actual', comparisonField: 'target', dimensions: ['region'] });
    const ledger = buildEvidenceLedger({ result, predicates: [], metricDefinition: metric });
    const response = runDeterministicAgent('What is driving the result?', {
      rows,
      dimensions: ['region'],
      actualKey: 'actual',
      expectedKey: 'target',
      metricPolarity: 'higher_is_better',
      predicates: [],
      result,
    }, ledger);
    const evaluation = evaluateAgentResponse(response, ledger);
    expect(evaluation.score).toBeGreaterThanOrEqual(75);
    expect(evaluation.checks.find((check) => check.id === 'evidence-references')?.passed).toBe(true);
  });
});
