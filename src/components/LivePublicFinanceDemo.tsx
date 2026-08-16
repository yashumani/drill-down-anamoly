import { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { EChart } from './EChart';
import {
  LIVE_PUBLIC_DIMENSIONS,
  loadLivePublicFinance,
} from '../lib/livePublicFinance';
import type {
  LiveDemoFilter,
  LiveDemoScope,
  LiveDimensionSummary,
  LivePublicFinanceResult,
} from '../lib/livePublicFinance';

const money = (value: number) => Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
}).format(value);
const number = (value: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
const humanize = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_.-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function monthlyOption(result: LivePublicFinanceResult): EChartsOption {
  const points = result.monthly.slice(-24);
  return {
    animationDuration: 250,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params as Array<{ dataIndex?: number; seriesName?: string; value?: number }> : [];
        const point = points[items[0]?.dataIndex ?? 0];
        if (!point) return '';
        return [
          `<strong>${point.label}${point.partialPeriod ? ' · partial' : ''}</strong>`,
          `Actual spend: ${money(point.actual)}`,
          `Rolling benchmark: ${money(point.expected)}`,
          `Business impact: ${money(point.businessImpact)} (${point.businessImpact < 0 ? 'unfavorable' : 'favorable'})`,
          `Transactions: ${point.transactions.toLocaleString()}`,
          `Anomaly score: ${point.anomalyScore.toFixed(1)}`,
        ].join('<br/>');
      },
    },
    legend: { data: ['Actual spend', 'Rolling benchmark', 'Business impact'] },
    grid: { left: 82, right: 82, top: 54, bottom: points.length > 16 ? 74 : 44 },
    xAxis: { type: 'category', data: points.map((point) => point.label), axisLabel: { hideOverlap: true } },
    yAxis: [
      { type: 'value', name: 'Spend', axisLabel: { formatter: (value: number) => number(value) } },
      { type: 'value', name: 'Impact', axisLabel: { formatter: (value: number) => number(value) } },
    ],
    dataZoom: points.length > 16 ? [{ type: 'inside' }, { type: 'slider', height: 20, bottom: 12 }] : undefined,
    series: [
      { name: 'Actual spend', type: 'line', data: points.map((point) => point.actual), showSymbol: points.length <= 24, emphasis: { focus: 'series' } },
      { name: 'Rolling benchmark', type: 'line', data: points.map((point) => point.expected), showSymbol: points.length <= 24, emphasis: { focus: 'series' } },
      { name: 'Business impact', type: 'bar', yAxisIndex: 1, data: points.map((point) => point.businessImpact), barMaxWidth: 24, markLine: { symbol: 'none', data: [{ yAxis: 0 }] } },
    ],
  };
}

function dimensionOption(summary: LiveDimensionSummary): EChartsOption {
  const values = summary.values.slice(0, 8);
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const item = Array.isArray(params) ? params[0] as { dataIndex?: number } : params as { dataIndex?: number };
        const value = values[item?.dataIndex ?? 0];
        return value ? `${value.value}<br/>Spend: ${money(value.amount)}<br/>Share: ${percent(value.shareOfSpend)}<br/>Transactions: ${value.transactions.toLocaleString()}<br/>Average transaction: ${money(value.averageTransaction)}` : '';
      },
    },
    grid: { left: 210, right: 34, top: 18, bottom: 32 },
    xAxis: { type: 'value', name: 'Payment amount', axisLabel: { formatter: (value: number) => number(value) } },
    yAxis: { type: 'category', inverse: true, data: values.map((value) => value.value), axisLabel: { width: 190, overflow: 'truncate' } },
    series: [{ type: 'bar', data: values.map((value) => value.amount), barMaxWidth: 22 }],
  };
}

export function LivePublicFinanceDemo() {
  const [scope, setScope] = useState<LiveDemoScope>('all');
  const [filter, setFilter] = useState<LiveDemoFilter | null>(null);
  const [selectedDimension, setSelectedDimension] = useState(LIVE_PUBLIC_DIMENSIONS[0].field);
  const [appToken, setAppToken] = useState('');
  const [result, setResult] = useState<LivePublicFinanceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ message: 'Preparing live queries…', completed: 0, total: 1 });
  const [refreshKey, setRefreshKey] = useState(0);
  const filterKey = filter ? `${filter.field}:${filter.value}` : '';

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    loadLivePublicFinance({
      scope,
      filter,
      appToken,
      signal: controller.signal,
      onProgress: (message, completed, total) => setProgress({ message, completed, total }),
    }).then((next) => {
      setResult(next);
      setLoading(false);
      if (!next.dimensions.some((dimension) => dimension.field === selectedDimension && !dimension.error)) {
        setSelectedDimension(next.dimensions.find((dimension) => !dimension.error)?.field ?? LIVE_PUBLIC_DIMENSIONS[0].field);
      }
    }).catch((loadError) => {
      if (controller.signal.aborted) return;
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setLoading(false);
    });
    return () => controller.abort();
  }, [scope, filterKey, refreshKey]);

  const selectedSummary = useMemo(
    () => result?.dimensions.find((dimension) => dimension.field === selectedDimension)
      ?? result?.dimensions.find((dimension) => !dimension.error)
      ?? null,
    [result, selectedDimension],
  );

  const current = result?.currentMonth ?? null;
  const progressPct = progress.total ? Math.min(100, progress.completed / progress.total * 100) : 0;

  return <section className="live-public-demo" aria-label="Live multi-million-row public finance demonstration">
    <header className="live-demo-head">
      <div>
        <span className="eyebrow">LIVE LARGE PUBLIC DATA DEMO</span>
        <h2>City of Los Angeles procurement payments</h2>
        <p>Run exact server-side aggregate queries against a public finance source with more than three million records, 61 source columns, and ten modeled FP&A dimensions. Raw transactions stay on the public data platform; only summarized evidence enters the browser.</p>
      </div>
      <div className="live-demo-actions">
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>{loading ? 'Querying live API…' : 'Refresh live data'}</button>
        {result && <a href={result.source.datasetUrl} target="_blank" rel="noreferrer">Open official dataset</a>}
      </div>
    </header>

    <div className="live-demo-controls">
      <label>Source scope<select value={scope} onChange={(event) => { setScope(event.target.value as LiveDemoScope); setFilter(null); }}><option value="all">All available records</option><option value="24m">Latest 24 months</option><option value="current_fy">Latest fiscal year</option></select></label>
      <label>Explore dimension<select value={selectedDimension} onChange={(event) => setSelectedDimension(event.target.value)}>{LIVE_PUBLIC_DIMENSIONS.map((dimension) => <option key={dimension.field} value={dimension.field}>{dimension.label}</option>)}</select></label>
      <div className="live-filter-scope"><span>Live drill scope</span><strong>{filter ? `${humanize(filter.field)} = ${filter.value}` : 'All categories'}</strong></div>
      {filter && <button type="button" className="quiet-button" onClick={() => setFilter(null)}>Clear live drill</button>}
      <details className="live-token-settings"><summary>Optional API token</summary><label>Socrata app token<input type="password" value={appToken} onChange={(event) => setAppToken(event.target.value)} placeholder="Not saved" autoComplete="off" /></label><small>Public access works without a token. A token can improve rate-limit reliability and remains only in page memory.</small></details>
    </div>

    {loading && <div className="live-loading"><div><span style={{ width: `${progressPct}%` }} /></div><strong>{progress.message}</strong><small>{progress.completed} of {progress.total} query steps completed</small></div>}
    {error && <div className="error live-demo-error"><strong>Live dataset query failed.</strong><span>{error}</span><small>The public API may be rate-limited or temporarily unavailable. Retry, add an optional Socrata app token, or return to the embedded demo.</small></div>}

    {result && <>
      <section className="live-source-grid">
        <LiveMetric label="Full public source" value={result.fullSource.rowCount.toLocaleString()} note="records queried at source" />
        <LiveMetric label="Selected scope" value={result.scopedSource.rowCount.toLocaleString()} note={result.scopeLabel} />
        <LiveMetric label="Source columns" value={result.source.columnCount.toLocaleString()} note={`${LIVE_PUBLIC_DIMENSIONS.length} modeled dimensions`} />
        <LiveMetric label="Total payments" value={money(result.scopedSource.totalAmount)} note="exact server-side sum" />
        <LiveMetric label="Analysis health" value={`${result.analysisHealth.toFixed(0)}/100`} note={`${result.dimensions.filter((dimension) => !dimension.error).length} dimensions completed`} />
        <LiveMetric label="Query runtime" value={`${(result.queryDurationMs / 1000).toFixed(1)}s`} note={`${result.requestCount} public API requests`} />
      </section>

      <section className="live-executive-strip">
        <article><span>Latest month</span><strong>{current?.label ?? '—'}</strong><small>{current ? `${money(current.actual)} spend · ${current.transactions.toLocaleString()} transactions${current.partialPeriod ? ' · partial month' : ''}` : 'No monthly history returned'}</small></article>
        <article className={current?.businessImpact && current.businessImpact < 0 ? 'unfavorable' : 'favorable'}><span>Latest-month impact</span><strong>{current ? `${current.businessImpact >= 0 ? '+' : '-'}${money(Math.abs(current.businessImpact))}` : '—'}</strong><small>{current ? `${current.businessImpact < 0 ? 'Unfavorable' : 'Favorable'} versus rolling benchmark · ${percent(current.variancePct)} raw variance` : result.benchmarkMethod}</small></article>
        <article><span>Trailing 12 months</span><strong>{money(result.trailing12Amount)}</strong><small>{`${money(Math.abs(result.trailing12Impact))} ${result.trailing12Impact < 0 ? 'unfavorable' : 'favorable'} benchmark impact`}</small></article>
        <article><span>Momentum</span><strong>{humanize(result.trend)}</strong><small>{result.biggestUnfavorableMonth ? `Largest unfavorable month: ${result.biggestUnfavorableMonth.label} (${money(Math.abs(result.biggestUnfavorableMonth.businessImpact))})` : 'No unfavorable month detected'}</small></article>
      </section>

      <section className="live-time-panel">
        <div className="live-section-head"><div><h3>Monthly procurement pulse</h3><p>Actual payment spend compared with a rolling six-period benchmark. For expense analysis, spend above benchmark is shown as unfavorable business impact.</p></div><span>{result.monthly.length} periods · latest 24 displayed</span></div>
        <EChart option={monthlyOption(result)} height={430} ariaLabel="Los Angeles procurement actual spend, rolling benchmark, and business impact by month" />
      </section>

      <div className="live-analysis-grid">
        <section className="live-dimension-panel">
          <div className="live-section-head"><div><h3>{selectedSummary?.label ?? 'Dimension'} concentration</h3><p>{selectedSummary?.description ?? 'Select a dimension to inspect the largest payment categories.'}</p></div><span>Exact top-eight source aggregation</span></div>
          {selectedSummary && !selectedSummary.error && selectedSummary.values.length ? <>
            <EChart option={dimensionOption(selectedSummary)} height={420} ariaLabel={`Largest procurement payment categories for ${selectedSummary.label}`} />
            <div className="live-dimension-table"><table><thead><tr><th>Category</th><th>Payments</th><th>Share</th><th>Transactions</th><th>Average</th><th /></tr></thead><tbody>{selectedSummary.values.map((value) => <tr key={value.value}><td><strong>{value.value}</strong></td><td>{money(value.amount)}</td><td>{percent(value.shareOfSpend)}</td><td>{value.transactions.toLocaleString()}</td><td>{money(value.averageTransaction)}</td><td><button type="button" className="quiet-button" onClick={() => setFilter({ field: selectedSummary.field, value: value.value })}>Focus</button></td></tr>)}</tbody></table></div>
          </> : <div className="live-empty"><strong>Dimension result unavailable</strong><p>{selectedSummary?.error ?? 'No categories were returned.'}</p></div>}
        </section>

        <aside className="live-dimension-directory">
          <div className="live-section-head"><div><h3>Ten-dimension live scan</h3><p>Each card is a separate exact aggregation over the selected multi-million-row scope.</p></div></div>
          <div className="live-dimension-cards">{result.dimensions.map((dimension) => <button type="button" key={dimension.field} className={dimension.field === selectedSummary?.field ? 'active' : ''} onClick={() => setSelectedDimension(dimension.field)}><span>{dimension.label}</span><strong>{dimension.values[0]?.value ?? 'Unavailable'}</strong><small>{dimension.values[0] ? `${money(dimension.values[0].amount)} · ${percent(dimension.values[0].shareOfSpend)}` : dimension.error?.slice(0, 90)}</small></button>)}</div>
        </aside>
      </div>

      <section className="live-query-governance">
        <div><span>Dataset</span><strong>{result.source.datasetId}</strong></div>
        <div><span>Owner</span><strong>{result.source.owner}</strong></div>
        <div><span>Updated</span><strong>{result.source.updatedAt ? result.source.updatedAt.slice(0, 10) : 'Live API'}</strong></div>
        <div><span>Coverage</span><strong>{result.scopedSource.minDate ? result.scopedSource.minDate.slice(0, 10) : '—'} → {result.scopedSource.maxDate ? result.scopedSource.maxDate.slice(0, 10) : '—'}</strong></div>
        <div><span>Benchmark</span><strong>{result.benchmarkMethod}</strong></div>
        <div><span>Delivery</span><strong>Server-side SoQL aggregates</strong></div>
      </section>

      <details className="live-methodology"><summary>Source notes, limitations, and live-query evidence</summary><div className="live-method-grid"><section><h4>Why this demonstrates scale</h4><p>The full source count is retrieved live from the City of Los Angeles API. Monthly and dimension results are calculated by the source platform across the selected scope, so the browser does not need to hold millions of raw payment records.</p><p>The source contains {result.source.columnCount} columns; this demo deliberately models ten finance dimensions that are useful for procurement and OpEx review.</p></section><section><h4>Important interpretation limits</h4>{result.warnings.map((warning) => <p key={warning}>{warning}</p>)}</section><section><h4>Source access</h4><p><a href={result.source.datasetUrl} target="_blank" rel="noreferrer">Official dataset page</a></p><p><a href={result.source.apiDocsUrl} target="_blank" rel="noreferrer">Socrata API documentation</a></p><p>License: {result.source.license}</p></section></div></details>
    </>}
  </section>;
}

function LiveMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="live-source-metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}
