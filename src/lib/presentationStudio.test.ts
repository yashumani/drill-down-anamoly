import { describe, expect, it } from 'vitest';
import { createSampleData } from '../data/sampleData';
import { investigate } from './anomaly';
import { createDatasetSession } from './datasetSession';
import { buildFinanceTimeSeries } from './timeIntelligence';
import {
  buildPresentationSlideModel,
  defaultPresentationDesign,
  renderPresentationSlideSvg,
  validatePresentationDesignPatch,
} from './presentationStudio';

function fixture() {
  const rows = createSampleData();
  const datasetSession = createDatasetSession({ rows, source: { kind: 'embedded', name: 'Finance sample' } });
  const dimensions = datasetSession.qualityReport.dimensionCandidates.filter((field) => !datasetSession.timeCandidates.some((candidate) => candidate.field === field));
  const result = investigate(rows, dimensions, 'actual', 'target', [], 'higher_is_better', { aggregationMethod: 'sum', timeField: 'month' });
  const timeSeries = buildFinanceTimeSeries({
    rows,
    predicates: [],
    actualKey: 'actual',
    expectedKey: 'target',
    timeField: 'month',
    grain: 'month',
    window: '15m',
    aggregation: 'sum',
    metricPolarity: 'higher_is_better',
    fiscalYearStartMonth: 1,
    materialityPercent: 0.03,
  });
  return { rows, datasetSession, result, timeSeries };
}

describe('presentation studio', () => {
  it('builds a deterministic slide model with questions, drivers, and evidence linkage', () => {
    const { datasetSession, result, timeSeries } = fixture();
    const model = buildPresentationSlideModel({
      result,
      timeSeries,
      dataQuality: datasetSession.qualityReport,
      metricDefinition: datasetSession.metricDefinition,
      datasetSession,
      predicates: [],
      planningLens: 'revenue',
      actualKey: 'actual',
      expectedKey: 'target',
    });

    expect(model.schemaVersion).toBe('presentation-slide-v1');
    expect(model.questions.length).toBeGreaterThanOrEqual(4);
    expect(model.topDrivers.length).toBeGreaterThan(0);
    expect(model.runId).toBe(result.runId);
    expect(model.datasetSessionId).toBe(datasetSession.sessionId);
    expect(JSON.stringify(model)).not.toContain('sourceRows');
  });

  it('renders PowerPoint-ready 16:9 SVG presets without changing evidence values', () => {
    const { datasetSession, result, timeSeries } = fixture();
    const model = buildPresentationSlideModel({
      result,
      timeSeries,
      dataQuality: datasetSession.qualityReport,
      metricDefinition: datasetSession.metricDefinition,
      datasetSession,
      predicates: [],
      planningLens: 'revenue',
      actualKey: 'actual',
      expectedKey: 'target',
    });
    const design = defaultPresentationDesign(model);
    const svg = renderPresentationSlideSvg(model, design, 'executive');

    expect(svg).toContain('viewBox="0 0 1920 1080"');
    expect(svg).toContain('Questions answered');
    expect(svg).toContain(result.runId);
    expect(svg).toContain('BUSINESS IMPACT');
  });

  it('accepts only design fields from an LLM patch', () => {
    const current = {
      title: 'Current title',
      subtitle: 'Current subtitle',
      theme: 'board' as const,
      density: 'balanced' as const,
      emphasis: 'impact' as const,
      callout: 'Current callout',
    };
    const next = validatePresentationDesignPatch({
      title: 'CFO risk review',
      theme: 'risk',
      emphasis: 'anomalies',
      businessImpact: 999999999,
      actual: 1,
    }, current);

    expect(next.title).toBe('CFO risk review');
    expect(next.theme).toBe('risk');
    expect(next.emphasis).toBe('anomalies');
    expect('businessImpact' in next).toBe(false);
    expect('actual' in next).toBe(false);
  });
});
