import type { DataQualityReport } from './dataQuality';
import type { DatasetSession } from './datasetSession';
import type { MetricDefinition } from './metricSemantics';
import { metricDefinitionLimitations } from './metricSemantics';
import type { FinanceTimeSeriesResult } from './timeIntelligence';
import { backtestBaselineForecasts } from './forecastBacktest';
import type { InvestigationResult, Predicate } from '../types';

export type EvidenceKind =
  | 'dataset'
  | 'metric-definition'
  | 'quality'
  | 'scope'
  | 'variance'
  | 'time-series'
  | 'forecast-model'
  | 'driver'
  | 'interaction'
  | 'external-context'
  | 'limitation';

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  title: string;
  summary: string;
  source: 'deterministic-calculation' | 'dataset-contract' | 'analyst-context' | 'external-context';
  runId?: string;
  payload: unknown;
}

export interface EvidenceLedger {
  schemaVersion: 'finance-evidence-v1';
  ledgerId: string;
  createdAt: string;
  calculationRunId: string;
  items: EvidenceItem[];
  allowedEvidenceIds: string[];
}

export interface EvidenceLedgerInput {
  result: InvestigationResult;
  predicates: Predicate[];
  metricDefinition: MetricDefinition;
  dataQuality?: DataQualityReport;
  timeSeries?: FinanceTimeSeriesResult | null;
  datasetSession?: DatasetSession;
  externalContext?: string;
}

function compact(value: number) {
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function item(input: EvidenceItem) {
  return input;
}

export function buildEvidenceLedger(input: EvidenceLedgerInput): EvidenceLedger {
  const { result, metricDefinition, predicates } = input;
  const items: EvidenceItem[] = [];

  if (input.datasetSession) {
    const session = input.datasetSession;
    items.push(item({
      id: `dataset:${session.sessionId}`,
      kind: 'dataset',
      title: session.source.name,
      summary: `${session.rows.length.toLocaleString()} rows; contract ${session.contractReport.detected ? session.contractReport.mode : 'not declared'}; content hash ${session.contentHash}.`,
      source: 'dataset-contract',
      payload: {
        sessionId: session.sessionId,
        source: session.source,
        rowCount: session.rows.length,
        contentHash: session.contentHash,
        contract: session.contractReport,
      },
    }));
  }

  items.push(item({
    id: `metric:${metricDefinition.metricId}`,
    kind: 'metric-definition',
    title: metricDefinition.name,
    summary: `${metricDefinition.aggregation.replace('_', ' ')} metric; ${metricDefinition.polarity.replaceAll('_', ' ')}; semantic completeness ${metricDefinition.semanticCompleteness}/100.`,
    source: 'dataset-contract',
    payload: metricDefinition,
  }));

  items.push(item({
    id: `scope:${result.runId}`,
    kind: 'scope',
    title: 'Investigation scope',
    summary: predicates.length
      ? predicates.map((predicate) => `${predicate.dimension}=${predicate.value}`).join(' · ')
      : 'All selected-window business rows.',
    source: 'deterministic-calculation',
    runId: result.runId,
    payload: {
      predicates,
      rowCount: result.rowCount,
      validRowCount: result.validRowCount,
      excludedMeasureRows: result.excludedMeasureRows,
      aggregationMethod: result.aggregationMethod,
      attributionPopulationDate: result.attributionPopulationDate,
    },
  }));

  items.push(item({
    id: `variance:${result.runId}`,
    kind: 'variance',
    title: 'Selected-scope variance',
    summary: `${compact(Math.abs(result.businessImpact))} ${result.impactDirection}; actual ${compact(result.actual)} versus comparison ${compact(result.expected)}.`,
    source: 'deterministic-calculation',
    runId: result.runId,
    payload: {
      actual: result.actual,
      expected: result.expected,
      rawVariance: result.variance,
      businessImpact: result.businessImpact,
      impactDirection: result.impactDirection,
      variancePct: result.variancePct,
      anomalyScore: result.anomalyScore,
      baselineMethod: result.baselineMethod,
      aggregationMethod: result.aggregationMethod,
      attributionBasis: result.attributionBasis,
      attributionReconciles: result.attributionReconciles,
      warnings: result.warnings,
    },
  }));

  if (input.timeSeries) {
    const time = input.timeSeries;
    items.push(item({
      id: `time:${time.runId}`,
      kind: 'time-series',
      title: 'Finance time intelligence',
      summary: `${time.window} ${time.grain} view; trend ${time.trend.direction}; model health ${time.modelHealth.score.toFixed(0)}/100.`,
      source: 'deterministic-calculation',
      runId: time.runId,
      payload: {
        calculationVersion: time.calculationVersion,
        configuration: {
          timeField: time.timeField,
          grain: time.grain,
          window: time.window,
          aggregation: time.aggregation,
          fiscalYearStartMonth: time.fiscalYearStartMonth,
          materialityPercent: time.materialityPercent,
          baselineMethod: time.baselineMethod,
        },
        currentPeriod: time.currentPeriod,
        priorPeriod: time.priorPeriod,
        priorYearPeriod: time.priorYearPeriod,
        mtd: time.mtd,
        qtd: time.qtd,
        ytd: time.ytd,
        trailing: time.trailing,
        runRate: time.runRate,
        trend: time.trend,
        forecastBias: time.forecastBias,
        volatility: time.volatility,
        modelHealth: time.modelHealth,
        warnings: time.warnings,
      },
    }));
    const forecast = backtestBaselineForecasts(time.allPoints.map((point) => ({
      key: point.key,
      label: point.label,
      actual: point.actual,
    })));
    items.push(item({
      id: `forecast:${time.runId}`,
      kind: 'forecast-model',
      title: 'Backtested baseline forecast',
      summary: forecast.champion
        ? `${forecast.champion.replaceAll('_', ' ')} selected from ${forecast.evaluatedPeriods} out-of-sample periods; status ${forecast.status}.`
        : `No forecast champion was selected; status ${forecast.status}.`,
      source: 'deterministic-calculation',
      runId: time.runId,
      payload: forecast,
    }));
  }

  for (const dimension of result.dimensionScores.slice(0, 8)) {
    if (!dimension.topCategory) continue;
    items.push(item({
      id: `driver:${result.runId}:${dimension.dimension}:${hashText(dimension.topCategory.value)}`,
      kind: 'driver',
      title: `${dimension.dimension}: ${dimension.topCategory.value}`,
      summary: `${compact(Math.abs(dimension.topCategory.businessImpact))} ${dimension.topCategory.impactDirection}; ${(dimension.topCategory.support * 100).toFixed(1)}% support; priority score ${dimension.score.toFixed(0)}.`,
      source: 'deterministic-calculation',
      runId: result.runId,
      payload: {
        dimension: dimension.dimension,
        score: dimension.score,
        impact: dimension.impact,
        surprise: dimension.surprise,
        supportQuality: dimension.supportQuality,
        topCategory: dimension.topCategory,
      },
    }));
  }

  for (const [index, interaction] of result.interactions.slice(0, 5).entries()) {
    items.push(item({
      id: `interaction:${result.runId}:${index + 1}`,
      kind: 'interaction',
      title: interaction.predicates.map((predicate) => `${predicate.dimension}=${predicate.value}`).join(' + '),
      summary: `${compact(Math.abs(interaction.businessImpact))} ${interaction.impactDirection}; ${(interaction.support * 100).toFixed(1)}% support.`,
      source: 'deterministic-calculation',
      runId: result.runId,
      payload: interaction,
    }));
  }

  if (input.dataQuality) {
    const quality = input.dataQuality;
    items.push(item({
      id: `quality:${input.datasetSession?.sessionId ?? result.runId}`,
      kind: 'quality',
      title: 'Data readiness',
      summary: `${quality.overallScore.toFixed(0)}/100; ${quality.blockers} blockers; ${quality.warnings} warnings.`,
      source: 'deterministic-calculation',
      payload: {
        overallScore: quality.overallScore,
        status: quality.status,
        analysisReady: quality.analysisReady,
        blockers: quality.blockers,
        warnings: quality.warnings,
        missingRate: quality.missingRate,
        duplicateRate: quality.duplicateRate,
        sensitiveColumns: quality.sensitiveColumns,
        topIssues: quality.issues.slice(0, 10),
      },
    }));
  }

  if (input.externalContext?.trim()) {
    items.push(item({
      id: `external:${hashText(input.externalContext)}`,
      kind: 'external-context',
      title: 'External and analyst context',
      summary: 'Untrusted hypothesis material supplied for contextual comparison; it is not causal evidence.',
      source: 'external-context',
      payload: input.externalContext.slice(0, 12_000),
    }));
  }

  for (const [index, limitation] of metricDefinitionLimitations(metricDefinition).entries()) {
    items.push(item({
      id: `limitation:${metricDefinition.metricId}:${index + 1}`,
      kind: 'limitation',
      title: 'Metric or model limitation',
      summary: limitation,
      source: 'dataset-contract',
      payload: limitation,
    }));
  }

  const ledgerId = `ledger-${hashText(items.map((entry) => `${entry.id}:${entry.summary}`).join('|'))}`;
  return {
    schemaVersion: 'finance-evidence-v1',
    ledgerId,
    createdAt: new Date().toISOString(),
    calculationRunId: result.runId,
    items,
    allowedEvidenceIds: items.map((entry) => entry.id),
  };
}

export function findEvidence(ledger: EvidenceLedger, id: string) {
  return ledger.items.find((item) => item.id === id) ?? null;
}
