import { describe, expect, it, vi } from 'vitest';
import {
  BrowserAnalyticsProvider,
  RemoteAggregateAnalyticsProvider,
  timedProviderRun,
} from './analyticsProvider';
import type { InvestigationResult } from '../types';

function result(): InvestigationResult {
  return {
    calculationVersion: 'test',
    runId: 'run-1',
    generatedAt: '2026-01-01T00:00:00.000Z',
    rowCount: 1,
    validRowCount: 1,
    excludedMeasureRows: 0,
    actual: 90,
    expected: 100,
    variance: -10,
    businessImpact: -10,
    impactDirection: 'unfavorable',
    variancePct: -0.1,
    anomalyScore: 1,
    residualScale: 1,
    baselineMethod: 'target',
    metricPolarity: 'higher_is_better',
    aggregationMethod: 'sum',
    attributionBasis: 'total',
    attributionReconciles: true,
    dimensionsScanned: 0,
    dimensionScores: [],
    interactions: [],
    warnings: [],
  };
}

describe('analytics provider boundary', () => {
  it('keeps browser calculations behind the same interface', async () => {
    const provider = new BrowserAnalyticsProvider([{ region: 'West', actual: 90, target: 100 }]);
    const investigation = await provider.getInvestigation({
      dimensions: ['region'],
      actualKey: 'actual',
      expectedKey: 'target',
    });
    expect(provider.executionMode).toBe('browser');
    expect(investigation.actual).toBe(90);
  });

  it('delegates remote aggregate calculations without exposing raw rows', async () => {
    const getInvestigation = vi.fn(async () => result());
    const provider = new RemoteAggregateAnalyticsProvider({
      providerId: 'warehouse-v1',
      executionMode: 'warehouse',
      capabilities: { evidenceRows: true },
      transport: {
        getInvestigation,
        getTimeSeries: async () => null,
      },
    });
    const output = await provider.getInvestigation({ dimensions: [], actualKey: 'actual' });
    expect(output.runId).toBe('run-1');
    expect(provider.capabilities.serverSideAggregation).toBe(true);
    expect(getInvestigation).toHaveBeenCalledOnce();
  });

  it('records provider execution metadata', async () => {
    const provider = new BrowserAnalyticsProvider([{ actual: 1 }]);
    const output = await timedProviderRun(provider, 'query-1', async () => 42);
    expect(output.result).toBe(42);
    expect(output.metadata.providerId).toBe('browser-file-v1');
    expect(output.metadata.durationMs).toBeGreaterThanOrEqual(0);
  });
});
