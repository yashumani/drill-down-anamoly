import { describe, expect, it } from 'vitest';
import { buildCopilotFinanceContext } from './copilotFinanceContext';

describe('CopilotKit finance context', () => {
  it('exports compact evidence without raw rows', () => {
    const context = buildCopilotFinanceContext({
      actualKey: 'actual',
      expectedKey: 'target',
      predicates: [{ dimension: 'region', value: 'West' }],
      result: {
        runId: 'run-1',
        validRows: 10,
        excludedRows: 1,
        aggregationMethod: 'sum',
        attributionReconciles: true,
        businessImpact: -125,
        dimensionScores: [{
          dimension: 'product',
          score: 0.8,
          topCategory: { value: 'Device', businessImpact: -90, support: 0.4 },
          categories: [{ value: 'Device', businessImpact: -90, support: 0.4 }],
        }],
        interactions: [],
        warnings: ['Demo warning'],
      } as any,
      dataQuality: {
        overallScore: 92,
        status: 'good',
        analysisReady: true,
        blockers: 0,
        warnings: 1,
        missingRate: 0.01,
        duplicateRows: 0,
      } as any,
      datasetSession: {
        sessionId: 'dataset-1',
        contentHash: 'hash-1',
        source: { name: 'Finance sample', kind: 'embedded' },
        rows: [{ actual: 100, customer_email: 'private@example.com' }],
      } as any,
      metricDefinition: {
        name: 'Revenue',
        description: 'Recognized revenue',
        owner: 'FP&A',
        certificationStatus: 'certified',
        aggregation: 'sum',
        polarity: 'higher_is_better',
      } as any,
      timeSeries: null,
      evidenceLedger: { id: 'ledger-1', items: [{ id: 'variance:run-1' }] },
      externalContext: 'A product launch occurred.',
    });

    const serialized = JSON.stringify(context);
    expect(context.dataset.sessionId).toBe('dataset-1');
    expect(context.scope.calculationRunId).toBe('run-1');
    expect(context.drivers[0].dimension).toBe('product');
    expect(context.evidence.evidenceIds).toEqual(['variance:run-1']);
    expect(serialized).not.toContain('private@example.com');
    expect(serialized).not.toContain('customer_email');
  });
});
