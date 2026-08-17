import type { DatasetSession } from './datasetSession';
import type { EvidenceLedger } from './evidenceLedger';
import type { MetricDefinition } from './metricSemantics';
import type { FinanceTimeSeriesResult, TimeGrain, TimeWindow } from './timeIntelligence';
import type { AggregationMethod } from './timeIntelligence';
import type { InvestigationResult, MetricPolarity, Predicate } from '../types';

export const INVESTIGATION_SNAPSHOT_VERSION = 'fpa-investigation-snapshot-v1' as const;

export interface InvestigationSnapshot {
  schemaVersion: typeof INVESTIGATION_SNAPSHOT_VERSION;
  snapshotId: string;
  createdAt: string;
  dataset: {
    sessionId: string;
    contentHash: string;
    source: DatasetSession['source'];
    contractReport: DatasetSession['contractReport'];
    qualitySummary: {
      score: number;
      status: string;
      blockers: number;
      warnings: number;
    };
  };
  metricDefinition: MetricDefinition;
  configuration: {
    actualKey: string;
    expectedKey?: string;
    metricPolarity: MetricPolarity;
    aggregation: AggregationMethod;
    timeField?: string;
    timeGrain: TimeGrain;
    timeWindow: TimeWindow;
    fiscalYearStartMonth: number;
    materialityPercent: number;
    predicates: Predicate[];
  };
  investigation: InvestigationResult;
  timeSeries: FinanceTimeSeriesResult | null;
  evidenceLedger: EvidenceLedger;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

export function createInvestigationSnapshot(input: {
  datasetSession: DatasetSession;
  metricDefinition: MetricDefinition;
  actualKey: string;
  expectedKey?: string;
  metricPolarity: MetricPolarity;
  aggregation: AggregationMethod;
  timeField?: string;
  timeGrain: TimeGrain;
  timeWindow: TimeWindow;
  fiscalYearStartMonth: number;
  materialityPercent: number;
  predicates: Predicate[];
  investigation: InvestigationResult;
  timeSeries: FinanceTimeSeriesResult | null;
  evidenceLedger: EvidenceLedger;
}): InvestigationSnapshot {
  const identity = [
    input.datasetSession.sessionId,
    input.investigation.runId,
    input.evidenceLedger.ledgerId,
    JSON.stringify(input.predicates),
  ].join('|');
  return {
    schemaVersion: INVESTIGATION_SNAPSHOT_VERSION,
    snapshotId: `snapshot-${stableHash(identity)}`,
    createdAt: new Date().toISOString(),
    dataset: {
      sessionId: input.datasetSession.sessionId,
      contentHash: input.datasetSession.contentHash,
      source: input.datasetSession.source,
      contractReport: input.datasetSession.contractReport,
      qualitySummary: {
        score: input.datasetSession.qualityReport.overallScore,
        status: input.datasetSession.qualityReport.status,
        blockers: input.datasetSession.qualityReport.blockers,
        warnings: input.datasetSession.qualityReport.warnings,
      },
    },
    metricDefinition: input.metricDefinition,
    configuration: {
      actualKey: input.actualKey,
      expectedKey: input.expectedKey,
      metricPolarity: input.metricPolarity,
      aggregation: input.aggregation,
      timeField: input.timeField,
      timeGrain: input.timeGrain,
      timeWindow: input.timeWindow,
      fiscalYearStartMonth: input.fiscalYearStartMonth,
      materialityPercent: input.materialityPercent,
      predicates: input.predicates,
    },
    investigation: input.investigation,
    timeSeries: input.timeSeries,
    evidenceLedger: input.evidenceLedger,
  };
}

export function validateInvestigationSnapshot(value: unknown) {
  const errors: string[] = [];
  const snapshot = value as Partial<InvestigationSnapshot> | null;
  if (!snapshot || typeof snapshot !== 'object') return { valid: false, errors: ['Snapshot must be an object.'] };
  if (snapshot.schemaVersion !== INVESTIGATION_SNAPSHOT_VERSION) errors.push(`Unsupported snapshot schema ${String(snapshot.schemaVersion)}.`);
  if (!snapshot.snapshotId) errors.push('Snapshot ID is missing.');
  if (!snapshot.dataset?.sessionId || !snapshot.dataset.contentHash) errors.push('Dataset session identity is missing.');
  if (!snapshot.metricDefinition?.metricId) errors.push('Metric definition is missing.');
  if (!snapshot.investigation?.runId) errors.push('Investigation run ID is missing.');
  if (!snapshot.evidenceLedger?.ledgerId) errors.push('Evidence ledger is missing.');
  if (snapshot.investigation?.runId && snapshot.evidenceLedger?.calculationRunId
    && snapshot.investigation.runId !== snapshot.evidenceLedger.calculationRunId) {
    errors.push('Evidence ledger calculation run does not match the investigation run.');
  }
  const allowedEvidence = new Set(snapshot.evidenceLedger?.allowedEvidenceIds ?? []);
  for (const item of snapshot.evidenceLedger?.items ?? []) {
    if (!allowedEvidence.has(item.id)) errors.push(`Evidence item ${item.id} is not included in the allowed evidence list.`);
  }
  return { valid: errors.length === 0, errors };
}

export function downloadInvestigationSnapshot(snapshot: InvestigationSnapshot) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${snapshot.snapshotId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
