import { investigate } from './anomaly';
import type { InvestigationOptions } from './anomaly';
import { buildFinanceTimeSeries } from './timeIntelligence';
import type { BuildFinanceTimeSeriesOptions, FinanceTimeSeriesResult } from './timeIntelligence';
import type { DataRow, InvestigationResult, MetricPolarity, Predicate } from '../types';

export type AnalyticsExecutionMode = 'browser' | 'remote-aggregate' | 'warehouse';

export interface AnalyticsCapabilities {
  rawRowLimit?: number;
  serverSideAggregation: boolean;
  timeSeries: boolean;
  dimensionScan: boolean;
  interactions: boolean;
  evidenceRows: boolean;
}

export interface InvestigationQuery {
  dimensions: string[];
  actualKey: string;
  expectedKey?: string;
  predicates?: Predicate[];
  metricPolarity?: MetricPolarity;
  options?: InvestigationOptions;
}

export interface AnalyticsProvider {
  readonly providerId: string;
  readonly executionMode: AnalyticsExecutionMode;
  readonly capabilities: AnalyticsCapabilities;
  getInvestigation(query: InvestigationQuery): Promise<InvestigationResult>;
  getTimeSeries(query: Omit<BuildFinanceTimeSeriesOptions, 'rows'>): Promise<FinanceTimeSeriesResult | null>;
}

export class BrowserAnalyticsProvider implements AnalyticsProvider {
  readonly providerId = 'browser-file-v1';
  readonly executionMode = 'browser' as const;
  readonly capabilities: AnalyticsCapabilities = {
    rawRowLimit: 100_000,
    serverSideAggregation: false,
    timeSeries: true,
    dimensionScan: true,
    interactions: true,
    evidenceRows: true,
  };

  constructor(private readonly rows: DataRow[]) {}

  async getInvestigation(query: InvestigationQuery) {
    return investigate(
      this.rows,
      query.dimensions,
      query.actualKey,
      query.expectedKey,
      query.predicates ?? [],
      query.metricPolarity ?? 'higher_is_better',
      query.options,
    );
  }

  async getTimeSeries(query: Omit<BuildFinanceTimeSeriesOptions, 'rows'>) {
    if (!query.timeField) return null;
    return buildFinanceTimeSeries({ ...query, rows: this.rows });
  }
}

export interface RemoteAnalyticsTransport {
  getInvestigation(query: InvestigationQuery): Promise<InvestigationResult>;
  getTimeSeries(query: Omit<BuildFinanceTimeSeriesOptions, 'rows'>): Promise<FinanceTimeSeriesResult | null>;
}

export interface RemoteAnalyticsProviderOptions {
  providerId: string;
  executionMode?: Extract<AnalyticsExecutionMode, 'remote-aggregate' | 'warehouse'>;
  capabilities?: Partial<AnalyticsCapabilities>;
  transport: RemoteAnalyticsTransport;
}

export class RemoteAggregateAnalyticsProvider implements AnalyticsProvider {
  readonly providerId: string;
  readonly executionMode: Extract<AnalyticsExecutionMode, 'remote-aggregate' | 'warehouse'>;
  readonly capabilities: AnalyticsCapabilities;
  private readonly transport: RemoteAnalyticsTransport;

  constructor(options: RemoteAnalyticsProviderOptions) {
    if (!options.providerId.trim()) throw new Error('Remote analytics providers require a stable provider ID.');
    this.providerId = options.providerId;
    this.executionMode = options.executionMode ?? 'remote-aggregate';
    this.transport = options.transport;
    this.capabilities = {
      serverSideAggregation: true,
      timeSeries: true,
      dimensionScan: true,
      interactions: true,
      evidenceRows: false,
      ...options.capabilities,
    };
  }

  getInvestigation(query: InvestigationQuery) {
    return this.transport.getInvestigation(query);
  }

  getTimeSeries(query: Omit<BuildFinanceTimeSeriesOptions, 'rows'>) {
    return this.transport.getTimeSeries(query);
  }
}

export interface ProviderRunMetadata {
  providerId: string;
  executionMode: AnalyticsExecutionMode;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  queryFingerprint: string;
  warnings: string[];
}

export async function timedProviderRun<T>(
  provider: AnalyticsProvider,
  queryFingerprint: string,
  operation: () => Promise<T>,
): Promise<{ result: T; metadata: ProviderRunMetadata }> {
  const startedAt = new Date();
  const start = performance.now();
  const result = await operation();
  const completedAt = new Date();
  return {
    result,
    metadata: {
      providerId: provider.providerId,
      executionMode: provider.executionMode,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: performance.now() - start,
      queryFingerprint,
      warnings: [],
    },
  };
}
