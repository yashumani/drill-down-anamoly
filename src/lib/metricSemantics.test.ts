import { describe, expect, it } from 'vitest';
import { inferMetricDefinition, metricDefinitionLimitations } from './metricSemantics';
import type { DataRow } from '../types';

describe('metric semantic inference', () => {
  it('builds a governed additive metric definition from contract metadata', () => {
    const rows: DataRow[] = [{
      metric_id: 'REV_NET',
      metric_name: 'Net Revenue',
      metric_definition: 'Recognized net revenue after credits.',
      metric_owner: 'Revenue Finance',
      metric_certification: 'certified',
      aggregation_method: 'sum',
      metric_polarity: 'higher_is_better',
      currency: 'USD',
      fiscal_year_start_month: 1,
      actual: 100,
      target: 95,
      region: 'West',
    }];
    const definition = inferMetricDefinition({ rows, actualField: 'actual', comparisonField: 'target', dimensions: ['region'] });
    expect(definition.metricId).toBe('REV_NET');
    expect(definition.aggregation).toBe('sum');
    expect(definition.attributionSupported).toBe(true);
    expect(definition.semanticCompleteness).toBe(100);
  });

  it('blocks ratio attribution without numerator and denominator semantics', () => {
    const rows: DataRow[] = [{ metric_id: 'GM_PCT', metric_name: 'Gross Margin %', aggregation_method: 'ratio', actual: 0.42 }];
    const definition = inferMetricDefinition({ rows, actualField: 'actual', dimensions: [] });
    expect(definition.attributionSupported).toBe(false);
    expect(definition.missingSemantics).toContain('ratio numerator and denominator');
    expect(metricDefinitionLimitations(definition).length).toBeGreaterThan(0);
  });
});
