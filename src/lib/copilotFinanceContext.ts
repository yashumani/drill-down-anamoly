import type { DataQualityReport } from './dataQuality';
import type { DatasetSession } from './datasetSession';
import type { MetricDefinition } from './metricSemantics';
import type { FinanceTimeSeriesResult } from './timeIntelligence';
import type { InvestigationResult, Predicate } from '../types';

interface EvidenceLedgerLike {
  id: string;
  items: Array<{ id: string }>;
}

export interface CopilotFinanceContextInput {
  actualKey: string;
  expectedKey?: string;
  predicates: Predicate[];
  result: InvestigationResult;
  dataQuality: DataQualityReport;
  datasetSession: DatasetSession;
  metricDefinition: MetricDefinition;
  timeSeries: FinanceTimeSeriesResult | null;
  evidenceLedger: EvidenceLedgerLike;
  externalContext?: string;
}

const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const text = (value: unknown) => typeof value === 'string' ? value : '';

function compactCategory(category: unknown) {
  const source = (category ?? {}) as Record<string, unknown>;
  return {
    value: String(source.value ?? ''),
    businessImpact: finite(source.businessImpact),
    support: finite(source.support),
    count: finite(source.count),
  };
}

export function buildCopilotFinanceContext(input: CopilotFinanceContextInput) {
  const result = input.result as unknown as Record<string, unknown>;
  const metric = input.metricDefinition as unknown as Record<string, unknown>;
  const session = input.datasetSession as unknown as Record<string, unknown>;
  const source = (session.source ?? {}) as Record<string, unknown>;
  const timeSeries = input.timeSeries as unknown as Record<string, unknown> | null;
  const currentPeriod = (timeSeries?.currentPeriod ?? {}) as Record<string, unknown>;
  const ytd = (timeSeries?.ytd ?? {}) as Record<string, unknown>;
  const modelHealth = (timeSeries?.modelHealth ?? {}) as Record<string, unknown>;

  const dimensions = input.result.dimensionScores.slice(0, 12).map((score) => {
    const scoreRecord = score as unknown as Record<string, unknown>;
    const topCategory = score.topCategory ? compactCategory(score.topCategory) : null;
    return {
      dimension: score.dimension,
      priorityScore: finite(scoreRecord.score ?? scoreRecord.overallScore),
      topCategory,
      categories: score.categories.slice(0, 8).map(compactCategory),
    };
  });

  const interactions = input.result.interactions.slice(0, 6).map((interaction) => ({
    predicates: interaction.predicates.map((predicate) => ({ dimension: predicate.dimension, value: String(predicate.value) })),
    businessImpact: finite(interaction.businessImpact),
    count: finite(interaction.count),
  }));

  return {
    schemaVersion: 'fpa-copilot-context/v1',
    authority: 'Deterministic calculations and evidence IDs are authoritative. The agent may explain or navigate them, but must not invent or recalculate financial values.',
    dataset: {
      sessionId: text(session.sessionId),
      name: text(source.name),
      sourceKind: text(source.kind),
      rowCount: Array.isArray(session.rows) ? session.rows.length : null,
      contentHash: text(session.contentHash),
    },
    metric: {
      name: text(metric.name),
      definition: text(metric.description ?? metric.definition),
      owner: text(metric.owner),
      certificationStatus: text(metric.certificationStatus),
      aggregation: text(metric.aggregation),
      polarity: text(metric.polarity),
      actualField: input.actualKey,
      comparisonField: input.expectedKey ?? null,
    },
    scope: {
      predicates: input.predicates.map((predicate) => ({ dimension: predicate.dimension, value: String(predicate.value) })),
      validRows: finite(result.validRows),
      excludedRows: finite(result.excludedRows),
      calculationRunId: text(result.runId),
      aggregationMethod: text(result.aggregationMethod),
      attributionReconciles: Boolean(result.attributionReconciles),
    },
    variance: {
      actual: finite(result.totalActual ?? result.actual),
      comparison: finite(result.totalExpected ?? result.expected),
      rawVariance: finite(result.rawVariance ?? result.variance),
      variancePct: finite(result.variancePct),
      businessImpact: finite(result.businessImpact),
    },
    time: input.timeSeries ? {
      timeField: text(timeSeries?.timeField),
      grain: text(timeSeries?.grain),
      window: text(timeSeries?.window),
      currentPeriod: {
        label: text(currentPeriod.label),
        actual: finite(currentPeriod.actual),
        comparison: finite(currentPeriod.expected),
        businessImpact: finite(currentPeriod.businessImpact),
        variancePct: finite(currentPeriod.variancePct),
        anomalyScore: finite(currentPeriod.anomalyScore),
      },
      ytd: {
        actual: finite(ytd.actual),
        comparison: finite(ytd.expected),
        businessImpact: finite(ytd.businessImpact),
        variancePct: finite(ytd.variancePct),
        pace: finite(ytd.pace),
      },
      health: {
        score: finite(modelHealth.score),
        status: text(modelHealth.status),
        periodCount: finite(modelHealth.periodCount),
      },
    } : null,
    drivers: dimensions,
    interactions,
    quality: {
      score: input.dataQuality.overallScore,
      status: input.dataQuality.status,
      analysisReady: input.dataQuality.analysisReady,
      blockers: input.dataQuality.blockers,
      warnings: input.dataQuality.warnings,
      missingRate: input.dataQuality.missingRate,
      duplicateRows: input.dataQuality.duplicateRows,
    },
    externalHypotheses: input.externalContext?.trim() ? input.externalContext.trim().slice(0, 2500) : null,
    evidence: {
      ledgerId: input.evidenceLedger.id,
      evidenceIds: input.evidenceLedger.items.slice(0, 40).map((item) => item.id),
    },
    limitations: Array.isArray(result.warnings) ? result.warnings.slice(0, 12) : [],
  };
}
