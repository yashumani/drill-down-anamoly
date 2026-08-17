import { describe, expect, it } from 'vitest';
import { planAgentTools, runAgentToolPlan } from './agentTools';
import type { ChatContext } from './chatEngine';
import type { EvidenceLedger } from './evidenceLedger';

const context = {
  rows: [],
  dimensions: ['region'],
  actualKey: 'actual',
  expectedKey: 'target',
  metricPolarity: 'higher_is_better',
  predicates: [],
  result: {
    calculationVersion: 'test',
    runId: 'run-1',
    generatedAt: '2026-01-01T00:00:00.000Z',
    rowCount: 10,
    validRowCount: 10,
    excludedMeasureRows: 0,
    actual: 90,
    expected: 100,
    variance: -10,
    businessImpact: -10,
    impactDirection: 'unfavorable',
    variancePct: -0.1,
    anomalyScore: 2,
    residualScale: 1,
    baselineMethod: 'target',
    metricPolarity: 'higher_is_better',
    aggregationMethod: 'sum',
    attributionBasis: 'total',
    attributionReconciles: true,
    dimensionsScanned: 1,
    dimensionScores: [{
      dimension: 'region',
      score: 90,
      impact: 1,
      surprise: 1,
      concentration: 1,
      supportQuality: 1,
      cardinalityPenalty: 1,
      distinctCount: 2,
      topCategory: {
        dimension: 'region',
        value: 'West',
        count: 5,
        support: 0.5,
        actual: 40,
        expected: 50,
        variance: -10,
        businessImpact: -10,
        impactDirection: 'unfavorable',
        variancePerRow: -2,
        businessImpactPerRow: -2,
        shareOfAbsVariance: 1,
        surprise: 1,
        standardizedResidual: 2,
        attributionBasis: 'total',
      },
      categories: [],
    }],
    interactions: [],
    warnings: [],
  },
} satisfies ChatContext;

const ledger = {
  schemaVersion: 'finance-evidence-v1',
  ledgerId: 'ledger-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  calculationRunId: 'run-1',
  items: [
    { id: 'scope-1', kind: 'scope', title: 'Scope', summary: 'All rows', source: 'deterministic-calculation', runId: 'run-1', payload: {} },
    { id: 'metric-1', kind: 'metric-definition', title: 'Metric', summary: 'Revenue', source: 'dataset-contract', payload: {} },
    { id: 'time-1', kind: 'time-series', title: 'Time', summary: 'YTD is unfavorable', source: 'deterministic-calculation', runId: 'run-1', payload: {} },
    { id: 'forecast-1', kind: 'forecast-model', title: 'Forecast', summary: 'Backtest is ready', source: 'deterministic-calculation', runId: 'run-1', payload: {} },
    { id: 'driver-1', kind: 'driver', title: 'Region', summary: 'West is leading', source: 'deterministic-calculation', runId: 'run-1', payload: {} },
  ],
  allowedEvidenceIds: ['scope-1', 'metric-1', 'time-1', 'forecast-1', 'driver-1'],
} satisfies EvidenceLedger;

describe('agent tool plan', () => {
  it('plans time, forecast, scope, and metric tools for pacing questions', () => {
    const calls = planAgentTools('Are we pacing to hit the quarter forecast?');
    expect(calls.map((call) => call.name)).toContain('get_time_analysis');
    expect(calls.map((call) => call.name)).toContain('get_current_scope');
    expect(calls.map((call) => call.name)).toContain('get_metric_definition');
  });

  it('executes tools only against evidence already in the ledger', () => {
    const trace = runAgentToolPlan('What is driving the result over time?', context, ledger);
    expect(trace.some((item) => item.call.name === 'scan_dimensions')).toBe(true);
    expect(trace.some((item) => item.call.name === 'get_time_analysis')).toBe(true);
    for (const execution of trace) {
      for (const evidenceId of execution.evidenceIds) expect(ledger.allowedEvidenceIds).toContain(evidenceId);
    }
  });
});
