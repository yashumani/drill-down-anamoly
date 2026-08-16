import { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { EChart } from './EChart';
import { LiveDimensionVisualLab } from './LiveDimensionVisualLab';
import { LivePublicAiPanel } from './LivePublicAiPanel';
import { downloadFinanceDataTemplate } from '../lib/financeDataContract';
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
import {
  liveDemoSlideIndex,
  liveDemoSlides,
  nextLiveDemoSlide,
  previousLiveDemoSlide,
} from '../lib/presentationFlow';
import type { LiveDemoSlideId } from '../lib/presentationFlow';

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
    animationDuration: 220,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params as Array<{ dataIndex?: number }> : [];
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
    grid: { left: 76, right: 76, top: 50, bottom: points.length > 16 ? 64 : 40 },
    xAxis: { type: 'category', data: points.map((point) => point.label), axisLabel: { hideOverlap: true } },
    yAxis: [
      { type: 'value', name: 'Spend', axisLabel: { formatter: (value: number) => number(value) } },
      { type: 'value', name: 'Impact', axisLabel: { formatter: (value: number) => number(value) } },
    ],
    dataZoom: points.length > 16 ? [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 8 }] : undefined,
    series: [
      { name: 'Actual spend', type: 'line', data: points.map((point) => point.actual), showSymbol: points.length <= 24, emphasis: { focus: 'series' } },
      { name: 'Rolling benchmark', type: 'line', data: points.map((point) => point.expected), showSymbol: points.length <= 24, emphasis: { focus: 'series' } },
      { name: 'Business impact', type: 'bar', yAxisIndex: 1, data: points.map((point) => point.businessImpact), barMaxWidth: 22, markLine: { symbol: 'none', data: [{ yAxis: 0 }] } },
    ],
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
  const [slide, setSlide] = useState<LiveDemoSlideId>('overview');
  const filterKey = filter ? `${filter.field}:${filter.value}` : '';
  const slideIndex = liveDemoSlideIndex(slide);

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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, select, textarea, button, a, summary')) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        setSlide(nextLiveDemoSlide(slide));
      }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        setSlide(previousLiveDemoSlide(slide));
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [slide]);

  const selectedSummary = useMemo(
    () => result?.dimensions.find((dimension) => dimension.field === selectedDimension)
      ?? result?.dimensions.find((dimension) => !dimension.error)
      ?? null,
    [result, selectedDimension],
  );

  const current = result?.currentMonth ?? null;
  const progressPct = progress.total ? Math.min(100, progress.completed / progress.total * 100) : 0;

  return <section className="live-public-demo live-presentation" aria-label="Live multi-million-row public finance presentation">
    <header className="live-demo-head live-presentation-head">
      <div><span className="eyebrow">LIVE 3.8M-ROW FINANCE DECK</span><h2>City of Los Angeles procurement payments</h2><p>Navigate page by page. Every KPI, trend, driver, waterfall, and heatmap is recalculated for the selected source scope and drill cohort.</p></div>
      <div className="live-demo-actions"><button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>{loading ? 'Querying live API…' : 'Refresh live data'}</button>{result && <a href={result.source.datasetUrl} target="_blank" rel="noreferrer">Official dataset</a>}</div>
    </header>

    <nav className="live-slide-nav" aria-label="Live demo pages">{liveDemoSlides.map((item, index) => <button type="button" key={item.id} className={slide === item.id ? 'active' : index < slideIndex ? 'complete' : ''} onClick={() => setSlide(item.id)} aria-current={slide === item.id ? 'step' : undefined}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.label}</strong></button>)}</nav>

    <div className="live-demo-controls live-presentation-controls">
      <label className="live-control-scope">Source scope<select value={scope} onChange={(event) => { setScope(event.target.value as LiveDemoScope); setFilter(null); }}><option value="all">All records</option><option value="24m">Latest 24 months</option><option value="current_fy">Latest fiscal year</option></select></label>
      <label className="live-control-dimension">Dimension<select value={selectedDimension} onChange={(event) => setSelectedDimension(event.target.value)}>{LIVE_PUBLIC_DIMENSIONS.map((dimension) => <option key={dimension.field} value={dimension.field}>{dimension.label}</option>)}</select></label>
      <div className="live-filter-scope"><span>Current cohort</span><strong>{filter ? `${humanize(filter.field)} = ${filter.value}` : 'All categories'}</strong></div>
      {filter && <button type="button" className="quiet-button" onClick={() => setFilter(null)}>Clear drill</button>}
      <details className="live-token-settings"><summary>API token</summary><label>Socrata token<input type="password" value={appToken} onChange={(event) => setAppToken(event.target.value)} placeholder="Not saved" autoComplete="off" /></label><small>Click Refresh after entering a token. It remains only in page memory.</small></details>
    </div>

    <div className="live-stage">
      {loading && <div className="live-loading live-stage-loading"><div><span style={{ width: `${progressPct}%` }} /></div><strong>{progress.message}</strong><small>{progress.completed} of {progress.total} query steps completed</small></div>}
      {error && <div className="error live-demo-error"><strong>Live dataset query failed.</strong><span>{error}</span><small>The public API may be rate-limited or temporarily unavailable. Retry, add an optional Socrata app token, or return later.</small></div>}

      {result && !loading && slide === 'overview' && <section className="live-slide-page live-overview-page">
        <div className="live-source-grid">
          <LiveMetric label="Full public source" value={result.fullSource.rowCount.toLocaleString()} note="records queried at source" />
          <LiveMetric label="Selected scope" value={result.scopedSource.rowCount.toLocaleString()} note={result.scopeLabel} />
          <LiveMetric label="Source columns" value={result.source.columnCount.toLocaleString()} note={`${LIVE_PUBLIC_DIMENSIONS.length} modeled dimensions`} />
          <LiveMetric label="Total payments" value={money(result.scopedSource.totalAmount)} note="exact server-side sum" />
          <LiveMetric label="Analysis health" value={`${result.analysisHealth.toFixed(0)}/100`} note={`${result.dimensions.filter((dimension) => !dimension.error).length} dimensions completed`} />
          <LiveMetric label="Query runtime" value={`${(result.queryDurationMs / 1000).toFixed(1)}s`} note={`${result.requestCount} public API requests`} />
        </div>
        <section className="live-executive-strip">
          <article><span>Latest month</span><strong>{current?.label ?? '—'}</strong><small>{current ? `${money(current.actual)} spend · ${current.transactions.toLocaleString()} transactions${current.partialPeriod ? ' · partial month' : ''}` : 'No monthly history returned'}</small></article>
          <article className={current?.businessImpact && current.businessImpact < 0 ? 'unfavorable' : 'favorable'}><span>Latest-month impact</span><strong>{current ? `${current.businessImpact >= 0 ? '+' : '-'}${money(Math.abs(current.businessImpact))}` : '—'}</strong><small>{current ? `${current.businessImpact < 0 ? 'Unfavorable' : 'Favorable'} versus rolling benchmark · ${percent(current.variancePct)} raw variance` : result.benchmarkMethod}</small></article>
          <article><span>Trailing 12 months</span><strong>{money(result.trailing12Amount)}</strong><small>{`${money(Math.abs(result.trailing12Impact))} ${result.trailing12Impact < 0 ? 'unfavorable' : 'favorable'} benchmark impact`}</small></article>
          <article><span>Momentum</span><strong>{humanize(result.trend)}</strong><small>{result.biggestUnfavorableMonth ? `Largest unfavorable month: ${result.biggestUnfavorableMonth.label} (${money(Math.abs(result.biggestUnfavorableMonth.businessImpact))})` : 'No unfavorable month detected'}</small></article>
        </section>
        <div className="live-overview-narrative"><div><span>Executive interpretation</span><h3>{current ? `${current.label} is ${money(Math.abs(current.businessImpact))} ${current.businessImpact < 0 ? 'unfavorable' : 'favorable'} versus the rolling historical benchmark.` : 'Monthly evidence is unavailable.'}</h3><p>This public adapter uses procurement-specific fields. Your own data can populate the same analytical engine through Finance Data Contract v1: period_date, actual_value, plan_value, and any number of dim_* columns.</p></div><button type="button" onClick={downloadFinanceDataTemplate}>Download standard CSV template</button></div>
      </section>}

      {result && !loading && slide === 'trend' && <section className="live-slide-page live-trend-page"><div className="live-section-head"><div><span className="deck-kicker">MONTHLY PULSE</span><h3>Actual spend versus rolling benchmark</h3><p>For expense analysis, spend above the benchmark is shown as unfavorable business impact.</p></div><strong>{result.monthly.length} periods · latest 24 displayed</strong></div><div className="live-chart-frame"><EChart option={monthlyOption(result)} height={390} ariaLabel="Los Angeles procurement actual spend, rolling benchmark, and business impact by month" /></div><div className="live-alert-row">{result.monthly.filter((point) => point.alertSeverity !== 'normal').slice(-4).map((point) => <article key={point.key} className={point.alertSeverity}><span>{point.alertSeverity}</span><strong>{point.label}</strong><small>{money(Math.abs(point.businessImpact))} {point.businessImpact < 0 ? 'unfavorable' : 'favorable'} · anomaly {point.anomalyScore.toFixed(1)}</small></article>)}</div></section>}

      {result && !loading && slide === 'drivers' && <section className="live-slide-page live-drivers-page"><div className="live-analysis-grid"><section className="live-dimension-panel"><div className="live-section-head"><div><span className="deck-kicker">DIMENSION DETAIL</span><h3>{selectedSummary?.label ?? 'Dimension'} analysis</h3><p>{selectedSummary?.description ?? 'Select a dimension to inspect the largest payment categories.'}</p></div><strong>Concentration · waterfall · zoom heatmap</strong></div>{selectedSummary && !selectedSummary.error && selectedSummary.values.length ? <LiveDimensionVisualLab result={result} summary={selectedSummary} appToken={appToken} onFocus={setFilter} /> : <div className="live-empty"><strong>Dimension result unavailable</strong><p>{selectedSummary?.error ?? 'No categories were returned.'}</p></div>}</section><aside className="live-dimension-directory"><div className="live-section-head"><div><span className="deck-kicker">10-DIMENSION SCAN</span><h3>Choose the next branch</h3><p>Each selection updates the chart lab and the latest-period category evidence.</p></div></div><div className="live-dimension-cards">{result.dimensions.map((dimension) => <button type="button" key={dimension.field} className={dimension.field === selectedSummary?.field ? 'active' : ''} onClick={() => setSelectedDimension(dimension.field)}><span>{dimension.label}</span><strong>{dimension.values[0]?.value ?? 'Unavailable'}</strong><small>{dimension.values[0] ? `${money(dimension.values[0].amount)} · ${percent(dimension.values[0].shareOfSpend)}` : dimension.error?.slice(0, 90)}</small></button>)}</div></aside></div></section>}

      {result && !loading && slide === 'ai' && <section className="live-slide-page live-ai-page"><LivePublicAiPanel result={result} /></section>}

      {result && !loading && slide === 'method' && <section className="live-slide-page live-method-page">
        <section className="live-query-governance"><div><span>Dataset</span><strong>{result.source.datasetId}</strong></div><div><span>Owner</span><strong>{result.source.owner}</strong></div><div><span>Updated</span><strong>{result.source.updatedAt ? result.source.updatedAt.slice(0, 10) : 'Live API'}</strong></div><div><span>Coverage</span><strong>{result.scopedSource.minDate ? result.scopedSource.minDate.slice(0, 10) : '—'} → {result.scopedSource.maxDate ? result.scopedSource.maxDate.slice(0, 10) : '—'}</strong></div><div><span>Benchmark</span><strong>{result.benchmarkMethod}</strong></div><div><span>Delivery</span><strong>Server-side SoQL aggregates</strong></div></section>
        <div className="live-method-grid"><section><h4>Why this demonstrates scale</h4><p>The full source count is retrieved live. Monthly, dimension, category-month, waterfall, and heatmap results are calculated from small server-side aggregates, so the browser does not hold millions of raw payment records.</p><p>The source contains {result.source.columnCount} columns; this presentation models ten finance dimensions useful for procurement and OpEx review.</p></section><section><h4>Interpretation limits</h4>{result.warnings.map((warning) => <p key={warning}>{warning}</p>)}</section><section><h4>Bring your own data</h4><p>Use one metric per file with period_date, actual_value, optional plan_value/forecast_value, metric metadata, and dim_* business dimensions. The importer normalizes those fields to the same Actual, Plan, time, and driver engine.</p><button type="button" className="quiet-button" onClick={downloadFinanceDataTemplate}>Download Contract v1 template</button><p><a href={result.source.datasetUrl} target="_blank" rel="noreferrer">Open the official dataset</a></p><p><a href={result.source.apiDocsUrl} target="_blank" rel="noreferrer">Open Socrata API documentation</a></p></section></div>
      </section>}
    </div>

    <footer className="live-slide-footer"><button type="button" onClick={() => setSlide(previousLiveDemoSlide(slide))} disabled={slideIndex === 0}>← Previous</button><div><strong>{liveDemoSlides[slideIndex].label}</strong><span>Page {slideIndex + 1} of {liveDemoSlides.length} · use ← and → keys</span></div><button type="button" onClick={() => setSlide(nextLiveDemoSlide(slide))} disabled={slideIndex === liveDemoSlides.length - 1}>Next →</button></footer>
  </section>;
}

function LiveMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="live-source-metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}
