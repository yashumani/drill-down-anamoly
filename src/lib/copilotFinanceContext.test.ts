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
        rowCount: 11,
        validRowCount: 10,
        excludedMeasureRows: 1,
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
      evidenceLedger: { ledgerId: 'ledger-1', items: [{ id: 'variance:run-1' }] },
      externalContext: 'A product launch occurred.',
    });

    const serialized = JSON.stringify(context);
    expect(context.dataset.sessionId).toBe('dataset-1');
    expect(context.scope.calculationRunId).toBe('run-1');
    expect(context.scope.validRows).toBe(10);
    expect(context.scope.excludedRows).toBe(1);
    expect(context.drivers[0].dimension).toBe('product');
    expect(context.evidence.ledgerId).toBe('ledger-1');
    expect(context.evidence.evidenceIds).toEqual(['variance:run-1']);
    expect(serialized).not.toContain('private@example.com');
    expect(serialized).not.toContain('customer_email');
  });

  it('excludes profiler-detected sensitive dimensions and values from outbound context', () => {
    const context = buildCopilotFinanceContext({
      actualKey: 'actual',
      expectedKey: 'target',
      predicates: [
        { dimension: 'contactPhone', value: '+1-415-555-0100' },
        { dimension: 'region', value: 'West' },
      ],
      result: {
        runId: 'run-sensitive',
        validRowCount: 20,
        excludedMeasureRows: 0,
        aggregationMethod: 'sum',
        attributionReconciles: true,
        businessImpact: -125,
        dimensionScores: [
          {
            dimension: 'customerEmail',
            score: 0.95,
            topCategory: { value: 'private@example.com', businessImpact: -100, support: 0.5 },
            categories: [
              { value: 'private@example.com', businessImpact: -100, support: 0.5 },
              { value: 'other@example.com', businessImpact: -25, support: 0.25 },
            ],
          },
          {
            dimension: 'region',
            score: 0.8,
            topCategory: { value: 'West', businessImpact: -90, support: 0.4 },
            categories: [{ value: 'West', businessImpact: -90, support: 0.4 }],
          },
        ],
        interactions: [
          {
            predicates: [
              { dimension: 'customerEmail', value: 'private@example.com' },
              { dimension: 'region', value: 'West' },
            ],
            businessImpact: -100,
            count: 10,
          },
          {
            predicates: [
              { dimension: 'region', value: 'West' },
              { dimension: 'channel', value: 'Partner' },
            ],
            businessImpact: -25,
            count: 5,
          },
        ],
        warnings: [],
      } as any,
      dataQuality: {
        overallScore: 90,
        status: 'good',
        analysisReady: true,
        blockers: 0,
        warnings: 1,
        missingRate: 0,
        duplicateRows: 0,
        sensitiveColumns: ['customerEmail', 'contactPhone'],
      } as any,
      datasetSession: {
        sessionId: 'dataset-sensitive',
        contentHash: 'hash-sensitive',
        source: { name: 'Finance sample', kind: 'embedded' },
        rows: [],
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
      evidenceLedger: {
        ledgerId: 'ledger-sensitive',
        items: [
          { id: 'driver:run-sensitive:customerEmail:private-hash' },
          { id: 'driver:run-sensitive:region:west-hash' },
          { id: 'variance:run-sensitive' },
        ],
      },
    });

    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain('customerEmail');
    expect(serialized).not.toContain('contactPhone');
    expect(serialized).not.toContain('private@example.com');
    expect(serialized).not.toContain('other@example.com');
    expect(serialized).not.toContain('+1-415-555-0100');
    expect(context.scope.predicates).toEqual([{ dimension: 'region', value: 'West' }]);
    expect(context.drivers.map((driver) => driver.dimension)).toEqual(['region']);
    expect(context.interactions).toEqual([{
      predicates: [
        { dimension: 'region', value: 'West' },
        { dimension: 'channel', value: 'Partner' },
      ],
      businessImpact: -25,
      count: 5,
    }]);
    expect(context.evidence.evidenceIds).toEqual([
      'driver:run-sensitive:region:west-hash',
      'variance:run-sensitive',
    ]);
  });
});
