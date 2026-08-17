import type { EChartsOption } from 'echarts';
import { EChart } from './EChart';
import { backtestBaselineForecasts } from '../lib/forecastBacktest';
import type {
  AggregationMethod,
  FinancePeriodSummary,
  FinanceTimeSeriesResult,
  TimeFieldCandidate,
  TimeGrain,
  TimeWindow,
} from '../lib/timeIntelligence';

const compact = (value: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
const humanize = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_.-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

interface Props {
  result: FinanceTimeSeriesResult | null;
  candidates: TimeFieldCandidate[];
  timeField: string;
  grain: TimeGrain;
  window: TimeWindow;
  aggregation: AggregationMethod;
  fiscalYearStartMonth: number;
  materialityPercent: number;
  onTimeField: (value: string) => void;
  onGrain: (value: TimeGrain) => void;
  onWindow: (value: TimeWindow) => void;
  onAggregation: (value: AggregationMethod) => void;
  onFiscalYearStartMonth: (value: number) => void;
  onMaterialityPercent: (value: number) => void;
}

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function downloadSnapshot(result: FinanceTimeSeriesResult) {
  const payload = {
    exportedAt: new Date().toISOString(),
    calculationVersion: result.calculationVersion,
    runId: result.runId,
    configuration: {
      timeField: result.timeField,
      grain: result.grain,
      window: result.window,
      aggregation: result.aggregation,
      fiscalYearStartMonth: result.fiscalYearStartMonth,
      materialityPercent: result.materialityPercent,
      absoluteMateriality: result.absoluteMateriality,
      baselineMethod: result.baselineMethod,
    },
    executiveSummary: {
      currentPeriod: result.currentPeriod,
      mtd: result.mtd,
      qtd: result.qtd,
      ytd: result.ytd,
      trailing: result.trailing,
      runRate: result.runRate,
      trend: result.trend,
      forecastBias: result.forecastBias,
      volatility: result.volatility,
    },
    modelHealth: result.modelHealth,
    forecastBacktest: backtestBaselineForecasts(result.allPoints.map((point) => ({ key: point.key, label: point.label, actual: point.actual }))),
    coverage: result.coverage,
    warnings: result.warnings,
    points: result.allPoints,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `fpa-time-analysis-${result.runId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildOption(result: FinanceTimeSeriesResult): EChartsOption {
  const points = result.points;
  return {
    animationDuration: 250,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      valueFormatter: (value) => typeof value === 'number' ? compact(value) : String(value ?? ''),
    },
    legend: { data: ['Actual', 'Plan / expected', 'Business impact'] },
    grid: { left: 76, right: 72, top: 54, bottom: points.length > 16 ? 72 : 44 },
    xAxis: {
      type: 'category',
      data: points.map((point) => point.label),
      axisLabel: { hideOverlap: true },
    },
    yAxis: [
      { type: 'value', name: 'Actual / plan', axisLabel: { formatter: (value: number) => compact(value) } },
      { type: 'value', name: 'Business impact', axisLabel: { formatter: (value: number) => compact(value) } },
    ],
    dataZoom: points.length > 16 ? [{ type: 'inside' }, { type: 'slider', height: 20, bottom: 12 }] : undefined,
    series: [
      {
        name: 'Actual',
        type: 'line',
        data: points.map((point) => point.actual),
        showSymbol: points.length <= 24,
        smooth: false,
        emphasis: { focus: 'series' },
      },
      {
        name: 'Plan / expected',
        type: 'line',
        data: points.map((point) => point.expected),
        showSymbol: points.length <= 24,
        smooth: false,
        emphasis: { focus: 'series' },
      },
      {
        name: 'Business impact',
        type: 'bar',
        yAxisIndex: 1,
        data: points.map((point) => ({
          value: point.businessImpact,
          alertSeverity: point.alertSeverity,
          anomalyScore: point.anomalyScore,
          material: point.material,
        })),
        barMaxWidth: 24,
        markLine: { symbol: 'none', data: [{ yAxis: 0 }] },
        emphasis: { focus: 'series' },
      },
    ],
  };
}

export function TimeSeriesCockpit({
  result,
  candidates,
  timeField,
  grain,
  window,
  aggregation,
  fiscalYearStartMonth,
  materialityPercent,
  onTimeField,
  onGrain,
  onWindow,
  onAggregation,
  onFiscalYearStartMonth,
  onMaterialityPercent,
}: Props) {
  if (!result) {
    return <section className="time-cockpit empty-time-cockpit">
      <div><span className="eyebrow">CFO PULSE & TIME INTELLIGENCE</span><h2>No usable time field was detected</h2><p>Add a date, week, month, fiscal period, or quarter field to enable daily, weekly, monthly, MTD, QTD, YTD, rolling-window, and run-rate analysis.</p></div>
    </section>;
  }

  const option = buildOption(result);
  const forecastBacktest = backtestBaselineForecasts(result.allPoints.map((point) => ({
    key: point.key,
    label: point.label,
    actual: point.actual,
  })));
  const forecastChampion = forecastBacktest.scores.find((score) => score.model === forecastBacktest.champion) ?? null;
  const alerts = [...result.allPoints]
    .filter((point) => point.alertSeverity !== 'normal')
    .sort((left, right) => {
      const priority = { critical: 0, watch: 1, favorable: 2, normal: 3 } as const;
      return priority[left.alertSeverity] - priority[right.alertSeverity] || right.periodStart.localeCompare(left.periodStart);
    })
    .slice(0, 6);

  return <section className="time-cockpit" aria-label="CFO pulse and finance time intelligence">
    <div className="time-cockpit-head">
      <div>
        <span className="eyebrow">CFO PULSE & TIME INTELLIGENCE</span>
        <h2>Actual versus plan across time</h2>
        <p>Aggregate daily, weekly, monthly, and quarterly finance data; monitor MTD/QTD/YTD performance, materiality, momentum, forecast bias, and calculation health.</p>
      </div>
      <button type="button" className="quiet-button" onClick={() => downloadSnapshot(result)}>Export analysis snapshot</button>
    </div>

    <div className="time-controls" aria-label="Time intelligence controls">
      <label>Time field<select value={timeField} onChange={(event) => onTimeField(event.target.value)}>{candidates.map((candidate) => <option key={candidate.field} value={candidate.field}>{humanize(candidate.field)} · {(candidate.parseRate * 100).toFixed(0)}% parsed</option>)}</select></label>
      <label>Period grain<select value={grain} onChange={(event) => onGrain(event.target.value as TimeGrain)}><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option><option value="quarter">Quarterly</option></select></label>
      <label>Window<select value={window} onChange={(event) => onWindow(event.target.value as TimeWindow)}><option value="90d">Last 90 days</option><option value="8w">Last 8 weeks</option><option value="13w">Last 13 weeks</option><option value="15m">Last 15 months</option><option value="24m">Last 24 months</option><option value="mtd">MTD</option><option value="qtd">QTD</option><option value="ytd">YTD</option><option value="all">All available periods</option></select></label>
      <label>Aggregation<select value={aggregation} onChange={(event) => onAggregation(event.target.value as AggregationMethod)}><option value="sum">Sum · flow metric</option><option value="average">Average · rate / average</option><option value="period_end">Period end · balance / headcount</option></select></label>
      <label>Fiscal year starts<select value={fiscalYearStartMonth} onChange={(event) => onFiscalYearStartMonth(Number(event.target.value))}>{monthNames.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label>
      <label>Materiality<select value={materialityPercent} onChange={(event) => onMaterialityPercent(Number(event.target.value))}><option value={0.01}>1% of plan</option><option value={0.03}>3% of plan</option><option value={0.05}>5% of plan</option><option value={0.1}>10% of plan</option></select></label>
    </div>

    <div className="time-summary-grid">
      <TimeMetric title={result.currentPeriod?.label ?? 'Current period'} summary={result.currentPeriod ? {
        label: result.currentPeriod.label,
        start: result.currentPeriod.periodStart,
        end: result.currentPeriod.periodEnd,
        actual: result.currentPeriod.actual,
        expected: result.currentPeriod.expected,
        variance: result.currentPeriod.variance,
        businessImpact: result.currentPeriod.businessImpact,
        impactDirection: result.currentPeriod.impactDirection,
        variancePct: result.currentPeriod.variancePct,
        pace: result.currentPeriod.expected === 0 ? null : result.currentPeriod.actual / result.currentPeriod.expected,
        periodCount: 1,
      } : null} />
      <TimeMetric title="Quarter to date" summary={result.qtd} />
      <TimeMetric title="Year to date" summary={result.ytd} />
      <TimeMetric title={result.trailing?.label ?? 'Trailing view'} summary={result.trailing} />
      <article className={`time-metric trend-${result.trend.direction}`}><span>Momentum</span><strong>{humanize(result.trend.direction)}</strong><small>{result.trend.description}</small></article>
      <article className={`time-metric health-${result.modelHealth.status}`}><span>Analysis health</span><strong>{result.modelHealth.score.toFixed(0)}/100</strong><small>{humanize(result.modelHealth.status)} · {result.modelHealth.periodCount} periods</small></article>
      <article className={`time-metric health-${forecastBacktest.status === 'ready' ? 'healthy' : forecastBacktest.status}`}><span>Forecast backtest</span><strong>{forecastBacktest.champion ? humanize(forecastBacktest.champion) : 'Not ready'}</strong><small>{forecastChampion?.wape == null ? `${forecastBacktest.historyPeriods} history periods` : `WAPE ${(forecastChampion.wape * 100).toFixed(1)}% · bias ${forecastChampion.bias == null ? '—' : `${(forecastChampion.bias * 100).toFixed(1)}%`}`}</small></article>
    </div>

    {result.runRate && <div className={`run-rate-banner ${result.runRate.impactDirection}`}>
      <div><span>MONTH-END RUN-RATE PROJECTION</span><strong>{compact(result.runRate.projectedActual)} projected actual</strong></div>
      <p>Projected plan / expected: {compact(result.runRate.projectedExpected)} · projected business impact: {compact(Math.abs(result.runRate.projectedBusinessImpact))} {result.runRate.impactDirection} · {result.runRate.confidence} confidence from {result.runRate.elapsedDays} of {result.runRate.totalDays} days.</p>
    </div>}

    <div className="time-chart-grid">
      <section className="time-chart-panel">
        <div className="time-section-head"><div><h3>Variance pulse</h3><p>Actual and plan use the left axis. Business impact uses the right axis; favorable impact is positive and unfavorable impact is negative.</p></div><span>{result.points.length} displayed periods</span></div>
        <EChart option={option} height={430} ariaLabel="Actual, plan, and business impact over the selected finance time window" />
      </section>

      <aside className="time-alerts">
        <div className="time-section-head"><div><h3>Executive alerts</h3><p>Material or statistically unusual periods, ranked for management attention.</p></div></div>
        {alerts.length ? <div className="time-alert-list">{alerts.map((point) => <article key={point.key} className={`time-alert ${point.alertSeverity}`}>
          <div><strong>{point.label}</strong><span>{humanize(point.alertSeverity)}</span></div>
          <p>{compact(Math.abs(point.businessImpact))} {point.impactDirection} impact · {percent(point.variancePct)} raw variance</p>
          <small>Anomaly {point.anomalyScore.toFixed(1)} · threshold {compact(point.materialityThreshold)} · {point.validRowCount.toLocaleString()} valid rows</small>
        </article>)}</div> : <div className="time-empty"><strong>No material time alerts</strong><p>No displayed period crossed the selected materiality or anomaly thresholds.</p></div>}
      </aside>
    </div>

    <div className="model-governance-strip">
      <div><span>Run ID</span><strong>{result.runId}</strong></div>
      <div><span>Calculation</span><strong>{result.calculationVersion}</strong></div>
      <div><span>Baseline</span><strong>{result.baselineMethod === 'plan' ? 'Plan / expected' : 'Rolling median'}</strong></div>
      <div><span>Forecast bias</span><strong>{percent(result.forecastBias)}</strong></div>
      <div><span>Volatility</span><strong>{percent(result.volatility)}</strong></div>
      <div><span>Time coverage</span><strong>{(result.modelHealth.parseRate * 100).toFixed(1)}%</strong></div>
      <div><span>Forecast status</span><strong>{humanize(forecastBacktest.status)}</strong></div>
    </div>

    <details className="time-governance-details">
      <summary>Calculation assumptions and MLOps monitoring</summary>
      <div className="time-governance-grid">
        <section><h4>Model / calculation health</h4>{result.modelHealth.reasons.map((reason) => <p key={reason}>{reason}</p>)}</section>
        <section><h4>Coverage</h4><p>{result.coverage.parsedRows.toLocaleString()} of {result.coverage.scopedRows.toLocaleString()} scoped rows were assigned to time.</p><p>{result.coverage.validMeasureRows.toLocaleString()} rows entered the calculation; {result.coverage.excludedMeasureRows.toLocaleString()} were excluded.</p><p>Range: {result.coverage.minDate ? result.coverage.minDate.slice(0, 10) : '—'} to {result.coverage.maxDate ? result.coverage.maxDate.slice(0, 10) : '—'}.</p></section>
        <section><h4>Warnings</h4>{result.warnings.length ? result.warnings.map((warning) => <p key={warning}>{warning}</p>) : <p>No automatic warnings.</p>}</section>
        <section><h4>Forecast backtest</h4><p>Champion: {forecastBacktest.champion ? humanize(forecastBacktest.champion) : 'none'} · folds: {forecastBacktest.evaluatedPeriods} · status: {humanize(forecastBacktest.status)}.</p>{forecastBacktest.predictionInterval80 && <p>Next baseline estimate: {compact(forecastBacktest.nextForecast ?? 0)} · 80% empirical interval {compact(forecastBacktest.predictionInterval80.lower)} to {compact(forecastBacktest.predictionInterval80.upper)}.</p>}{forecastBacktest.warnings.map((warning) => <p key={warning}>{warning}</p>)}</section>
      </div>
    </details>

    <details className="time-table-details">
      <summary>Period evidence table</summary>
      <div className="time-table-wrap"><table><thead><tr><th>Period</th><th>Actual</th><th>Plan</th><th>Raw variance</th><th>Business impact</th><th>Variance %</th><th>Anomaly</th><th>Status</th></tr></thead><tbody>{result.points.map((point) => <tr key={point.key}><td>{point.label}</td><td>{compact(point.actual)}</td><td>{compact(point.expected)}</td><td>{compact(point.variance)}</td><td className={point.businessImpact < 0 ? 'bad' : 'good'}>{compact(point.businessImpact)}</td><td>{percent(point.variancePct)}</td><td>{point.anomalyScore.toFixed(2)}</td><td>{humanize(point.alertSeverity)}</td></tr>)}</tbody></table></div>
    </details>
  </section>;
}

function TimeMetric({ title, summary }: { title: string; summary: FinancePeriodSummary | null }) {
  if (!summary) return <article className="time-metric"><span>{title}</span><strong>—</strong><small>Not enough time coverage</small></article>;
  return <article className={`time-metric ${summary.impactDirection}`}><span>{title}</span><strong>{summary.businessImpact >= 0 ? '+' : '-'}{compact(Math.abs(summary.businessImpact))}</strong><small>{summary.impactDirection} · pace {percent(summary.pace)}</small></article>;
}
