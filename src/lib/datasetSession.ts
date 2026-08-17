import type { DataQualityReport } from './dataQuality';
import { analyzeDataQuality } from './dataQuality';
import type { DatasetDefaults } from './datasetDefaults';
import { inferDatasetDefaults } from './datasetDefaults';
import type { FinanceDataContractReport } from './financeDataContract';
import type { MetricDefinition } from './metricSemantics';
import { inferMetricDefinition } from './metricSemantics';
import type { TimeFieldCandidate } from './timeIntelligence';
import { detectTimeFields } from './timeIntelligence';
import type { DataRow } from '../types';

export type DatasetSourceKind = 'embedded' | 'upload' | 'public-api' | 'unknown';

export interface DatasetSource {
  kind: DatasetSourceKind;
  name: string;
  fileName?: string;
  provider?: string;
}

export interface DatasetSession {
  sessionId: string;
  contentHash: string;
  loadedAt: string;
  source: DatasetSource;
  rows: DataRow[];
  contractReport: FinanceDataContractReport;
  qualityReport: DataQualityReport;
  defaults: DatasetDefaults;
  metricDefinition: MetricDefinition;
  timeCandidates: TimeFieldCandidate[];
}

function stableValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return String(value).slice(0, 256);
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function hashDataRows(rows: DataRow[]) {
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
  const sampleIndexes = rows.length <= 500
    ? rows.map((_, index) => index)
    : Array.from({ length: 500 }, (_, index) => Math.floor(index * (rows.length - 1) / 499));
  const body = sampleIndexes.map((index) => fields.map((field) => stableValue(rows[index]?.[field])).join('\u001f')).join('\u001e');
  return hashText(`${rows.length}|${fields.join('|')}|${body}`);
}

export function createDatasetSession({
  rows,
  source,
  contractReport,
}: {
  rows: DataRow[];
  source: DatasetSource;
  contractReport?: FinanceDataContractReport;
}): DatasetSession {
  const qualityReport = analyzeDataQuality(rows);
  const defaults = inferDatasetDefaults(rows, qualityReport.measureCandidates);
  const timeCandidates = detectTimeFields(rows);
  const dimensions = qualityReport.dimensionCandidates.filter((field) => !timeCandidates.some((candidate) => candidate.field === field));
  const metricDefinition = inferMetricDefinition({
    rows,
    actualField: defaults.actualKey,
    comparisonField: defaults.expectedKey || undefined,
    dimensions,
  });
  const contentHash = hashDataRows(rows);
  return {
    sessionId: `dataset-${contentHash}`,
    contentHash,
    loadedAt: new Date().toISOString(),
    source,
    rows,
    contractReport: contractReport ?? {
      version: '1.0',
      detected: false,
      mode: 'unrecognized',
      inputRows: rows.length,
      outputRows: rows.length,
      dimensionFields: [],
      normalizedDimensionFields: [],
      metricNames: [],
      warnings: ['The uploaded or embedded dataset did not declare Finance Data Contract v1 column names; automatic profiling was used.'],
      errors: [],
    },
    qualityReport,
    defaults,
    metricDefinition,
    timeCandidates,
  };
}

export function datasetSessionSummary(session: DatasetSession) {
  return {
    sessionId: session.sessionId,
    contentHash: session.contentHash,
    loadedAt: session.loadedAt,
    source: session.source,
    rowCount: session.rows.length,
    contract: {
      version: session.contractReport.version,
      detected: session.contractReport.detected,
      mode: session.contractReport.mode,
      actualField: session.contractReport.actualField,
      comparisonField: session.contractReport.comparisonField,
      dimensions: session.contractReport.normalizedDimensionFields,
      warnings: session.contractReport.warnings,
      errors: session.contractReport.errors,
    },
    quality: {
      score: session.qualityReport.overallScore,
      status: session.qualityReport.status,
      blockers: session.qualityReport.blockers,
      warnings: session.qualityReport.warnings,
    },
    defaults: session.defaults,
    metricDefinition: session.metricDefinition,
    timeCandidates: session.timeCandidates.slice(0, 5),
  };
}
