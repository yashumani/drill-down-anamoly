import { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { planningLenses } from '../lib/fpaInsights';
import type { PlanningLens } from '../lib/fpaInsights';
import type { DataQualityReport } from '../lib/dataQuality';
import type { FinanceTimeSeriesResult, TimeWindow } from '../lib/timeIntelligence';
import type { InvestigationResult, MetricPolarity } from '../types';
import { EChart } from './EChart';

type GuidedQuestion = 'variance' | 'pace' | 'trend' | 'drivers';

interface Props {
  numericFields: string[];
  planningLens: PlanningLens;
  actualKey: string;
  expectedKey: string;
  metricPolarity: MetricPolarity;
  timeWindow: TimeWindow;
  result: InvestigationResult;
  timeSeries: FinanceTimeSeriesResult | null;
  dataQuality: DataQualityReport;
  onPlanningLens: (value: PlanningLens) => void;
  onActualKey: (value: string) => void;
  onExpectedKey: (value: string) => void;
  onMetricPolarity: (value: MetricPolarity) => void;
  onTimeWindow: (value: TimeWindow) => void;
  onLoadSample: () => void;
  onUploadFile: (file: File | undefined) => void | Promise<void>;
  onOpenAdvanced: (dimension?: string) => void;
  onOpenPublic: () => void;
  onOpenQuality: () => void;
}

const questions: Array<{
  id: GuidedQuestion;
  title: string;
  description: string;
  window: TimeWindow;
}> = [
  { id: 'variance', title: 'Why are we off plan?', description: 'See the size, direction, and clearest concentration of the variance.', window: '15m' },
  { id: 'pace', title: 'Are we on track?', description: 'Review current pace, YTD impact, and month-end risk when daily data exists.', window: 'ytd' },
  { id: 'trend', title: 'What changed over time?', description: 'Separate a recent movement from a persistent or seasonal pattern.', window: '24m' },
  { id: 'drivers', title: 'What is driving the result?', description: 'Find the business dimension and category contributing the most.', window: '15m' },
];

const compact = (value: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const percent = (value: number | null) => value === null ? '—' : `${Math.abs(value * 100).toFixed(1)}%`;
const humanize = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_.-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function windowLabel(window: TimeWindow) {
  const labels: Record<TimeWindow, string> = {
    '90d': 'Last 90 days',
    '8w': 'Last 8 weeks',
    '13w': 'Last 13 weeks',
    '15m': 'Last 15 months',
    '24m': 'Last 24 months',
    mtd: 'Month to date',
    qtd: 'Quarter to date',
    ytd: 'Year to date',
    all: 'All available periods',
  };
  return labels[window];
}

function chartOption(timeSeries: FinanceTimeSeriesResult | null): EChartsOption {
  const points = timeSeries?.points.slice(-12) ?? [];
  return {
    animationDuration: 220,
    tooltip: { trigger: 'axis' },
    legend: { data: ['Actual', 'Plan / expected', 'Business impact'] },
    grid: { left: 64, right: 64, top: 44, bottom: 42 },
    xAxis: { type: 'category', data: points.map((point) => point.label), axisLabel: { hideOverlap: true } },
    yAxis: [
      { type: 'value', axisLabel: { formatter: (value: number) => compact(value) } },
      { type: 'value', axisLabel: { formatter: (value: number) => compact(value) } },
    ],
    series: [
      { name: 'Actual', type: 'line', data: points.map((point) => point.actual), showSymbol: points.length <= 12 },
      { name: 'Plan / expected', type: 'line', data: points.map((point) => point.expected), showSymbol: points.length <= 12 },
      { name: 'Business impact', type: 'bar', yAxisIndex: 1, data: points.map((point) => point.businessImpact), barMaxWidth: 22 },
    ],
  };
}

export function GuidedExperience({
  numericFields,
  planningLens,
  actualKey,
  expectedKey,
  metricPolarity,
  timeWindow,
  result,
  timeSeries,
  dataQuality,
  onPlanningLens,
  onActualKey,
  onExpectedKey,
  onMetricPolarity,
  onTimeWindow,
  onLoadSample,
  onUploadFile,
  onOpenAdvanced,
  onOpenPublic,
  onOpenQuality,
}: Props) {
  const [question, setQuestion] = useState<GuidedQuestion>('variance');
  const option = useMemo(() => chartOption(timeSeries), [timeSeries]);
  const current = timeSeries?.currentPeriod;
  const topDriver = result.dimensionScores[0]?.topCategory ? result.dimensionScores[0] : null;
  const runRateImpact = timeSeries?.runRate?.projectedBusinessImpact;
  const baseImpact = current?.businessImpact ?? result.businessImpact;
  const displayedImpact = question === 'pace' && runRateImpact !== undefined ? runRateImpact : baseImpact;
  const impactDirection = displayedImpact < 0 ? 'unfavorable' : displayedImpact > 0 ? 'favorable' : 'neutral';
  const actual = current?.actual ?? result.actual;
  const expected = current?.expected ?? result.expected;
  const variancePct = current?.variancePct ?? result.variancePct;
  const analysisHealth = timeSeries?.modelHealth.score ?? 70;
  const trustScore = Math.round(Math.min(dataQuality.overallScore, analysisHealth));
  const selectedQuestion = questions.find((item) => item.id === question) ?? questions[0];

  const headline = question === 'pace' && timeSeries?.runRate
    ? `Current pace points to ${compact(Math.abs(displayedImpact))} ${impactDirection} at month end.`
    : question === 'trend'
      ? `Performance is ${timeSeries?.trend.direction ?? 'not yet established'}, with ${compact(Math.abs(baseImpact))} ${baseImpact < 0 ? 'unfavorable' : baseImpact > 0 ? 'favorable' : 'neutral'} impact in the latest period.`
      : question === 'drivers' && topDriver?.topCategory
        ? `${humanize(topDriver.dimension)} → ${topDriver.topCategory.value} is the clearest concentration of the result.`
        : `The current result is ${compact(Math.abs(baseImpact))} ${baseImpact < 0 ? 'unfavorable' : baseImpact > 0 ? 'favorable' : 'neutral'}.`;

  const whatChanged = `${humanize(actualKey)} is ${compact(actual)} versus ${compact(expected)} ${expectedKey ? `for ${humanize(expectedKey)}` : 'for the rolling historical benchmark'}. Raw variance is ${percent(variancePct)} ${result.variance < 0 ? 'below' : result.variance > 0 ? 'above' : 'at'} expectation.`;
  const whereItLives = topDriver?.topCategory
    ? `${humanize(topDriver.dimension)} = ${topDriver.topCategory.value} has ${compact(Math.abs(topDriver.topCategory.businessImpact))} ${topDriver.topCategory.impactDirection} impact and represents ${(topDriver.topCategory.support * 100).toFixed(1)}% of valid rows.`
    : 'No stable single-factor concentration passed the current support threshold. Review measure selection and data readiness before drawing a conclusion.';
  const trendText = timeSeries
    ? `${timeSeries.trend.description} The time analysis uses ${timeSeries.allPoints.length} periods and has an analysis-health score of ${timeSeries.modelHealth.score.toFixed(0)}/100.`
    : 'No usable time field was detected, so the current answer is a cross-sectional variance view rather than a time-series conclusion.';
  const nextAction = topDriver?.topCategory
    ? `Open the evidence focused on ${humanize(topDriver.dimension)} and compare ${topDriver.topCategory.value} with unaffected categories before turning this into a management action or external-cause claim.`
    : 'Open Data quality and confirm the metric, comparison, time field, and eligible business dimensions.';

  return <section className="guided-wrapper" aria-label="Guided FP&A analysis">
    <section className="guided-intro">
      <div>
        <span className="eyebrow">QUICK ANSWER MODE</span>
        <h2>One question. One answer. Evidence when you need it.</h2>
        <p>This guided path uses the same analytics engine as the advanced workspace, but hides specialist controls until they are useful.</p>
      </div>
      <div className="guided-depth-switch">
        <span>Need every control?</span>
        <button type="button" onClick={() => onOpenAdvanced()}>Open advanced analysis →</button>
      </div>
    </section>

    <section className="guided-step">
      <div className="guided-step-label"><span>01</span><div><h3>Choose your data</h3><p>Start immediately, upload your file, or prove the large-data workflow.</p></div></div>
      <div className="guided-source-grid">
        <button type="button" className="guided-source-card active" onClick={onLoadSample}>
          <span>FASTEST</span><strong>Use finance sample</strong><small>{dataQuality.rowCount.toLocaleString()} rows are ready now</small>
        </button>
        <label className="guided-source-card guided-upload-card">
          <span>YOUR DATA</span><strong>Upload CSV or JSON</strong><small>We will profile it and choose safe defaults</small>
          <input type="file" accept=".csv,.json" onChange={(event) => onUploadFile(event.target.files?.[0])} />
        </label>
        <button type="button" className="guided-source-card" onClick={onOpenPublic}>
          <span>LIVE SCALE</span><strong>Try 3.8M public rows</strong><small>Server-side aggregation across 10 dimensions</small>
        </button>
      </div>
    </section>

    <section className="guided-step">
      <div className="guided-step-label"><span>02</span><div><h3>Ask the business question</h3><p>You do not need to know which chart or statistical method to choose.</p></div></div>
      <div className="guided-question-grid">
        {questions.map((item) => <button
          key={item.id}
          type="button"
          className={question === item.id ? 'active' : ''}
          onClick={() => { setQuestion(item.id); onTimeWindow(item.window); }}
        >
          <strong>{item.title}</strong><span>{item.description}</span>
        </button>)}
      </div>
    </section>

    <section className="guided-step">
      <div className="guided-step-label"><span>03</span><div><h3>Confirm four essentials</h3><p>The remaining assumptions stay available, but they no longer block the first answer.</p></div></div>
      <div className="guided-setup-grid">
        <label>Finance use case<select value={planningLens} onChange={(event) => onPlanningLens(event.target.value as PlanningLens)}>{planningLenses.map((lens) => <option key={lens.id} value={lens.id}>{lens.label}</option>)}</select></label>
        <label>What happened?<select value={actualKey} onChange={(event) => onActualKey(event.target.value)}>{numericFields.map((field) => <option key={field} value={field}>{humanize(field)}</option>)}</select></label>
        <label>Compared with<select value={expectedKey} onChange={(event) => onExpectedKey(event.target.value)}><option value="">Rolling typical value</option>{numericFields.filter((field) => field !== actualKey).map((field) => <option key={field} value={field}>{humanize(field)}</option>)}</select></label>
        <label>Period<select value={timeWindow} onChange={(event) => onTimeWindow(event.target.value as TimeWindow)}><option value="90d">Last 90 days</option><option value="13w">Last 13 weeks</option><option value="15m">Last 15 months</option><option value="24m">Last 24 months</option><option value="mtd">Month to date</option><option value="qtd">Quarter to date</option><option value="ytd">Year to date</option><option value="all">All available periods</option></select></label>
      </div>
      <details className="guided-assumptions">
        <summary>Review the assumptions used</summary>
        <div>
          <label>Business direction<select value={metricPolarity} onChange={(event) => onMetricPolarity(event.target.value as MetricPolarity)}><option value="higher_is_better">Higher is better</option><option value="lower_is_better">Lower is better</option></select></label>
          <p><strong>Time field:</strong> {timeSeries?.timeField ? humanize(timeSeries.timeField) : 'Not detected'} · <strong>Aggregation:</strong> {timeSeries?.aggregation ? humanize(timeSeries.aggregation) : 'Cross-sectional'} · <strong>Fiscal year starts:</strong> month {timeSeries?.fiscalYearStartMonth ?? 1} · <strong>Materiality:</strong> {timeSeries ? `${(timeSeries.materialityPercent * 100).toFixed(0)}% of plan` : 'Not configured'}.</p>
          <button type="button" className="quiet-button" onClick={() => onOpenAdvanced()}>Change advanced assumptions</button>
        </div>
      </details>
    </section>

    <section className="guided-answer">
      <div className="guided-answer-head">
        <div><span className="eyebrow">YOUR ANSWER</span><h2>{headline}</h2><p>{selectedQuestion.description}</p></div>
        <div className={`guided-one-number ${impactDirection}`}><span>{question === 'pace' && timeSeries?.runRate ? 'Projected impact' : 'Business impact'}</span><strong>{displayedImpact >= 0 ? '+' : '-'}{compact(Math.abs(displayedImpact))}</strong><small>{impactDirection} · {windowLabel(timeWindow)}</small></div>
      </div>

      <div className="guided-answer-grid">
        <article><span>What happened</span><p>{whatChanged}</p></article>
        <article><span>Where it lives</span><p>{whereItLives}</p></article>
        <article><span>Is it persistent?</span><p>{trendText}</p></article>
        <article><span>What to do next</span><p>{nextAction}</p></article>
      </div>

      {timeSeries?.points.length ? <div className="guided-chart-panel"><div><h3>Only the trend you need</h3><p>Actual, plan, and business impact for the latest displayed periods.</p></div><EChart option={option} height={320} ariaLabel="Simplified actual, plan, and business impact trend" /></div> : null}

      <div className="guided-trust-strip">
        <div><span>Answer trust</span><strong>{trustScore}/100</strong><small>Lower of data quality and analysis health</small></div>
        <div><span>Data readiness</span><strong>{dataQuality.analysisReady ? 'Ready' : 'Review'}</strong><small>{dataQuality.blockers} blockers · {dataQuality.warnings} warnings</small></div>
        <div><span>Evidence depth</span><strong>{result.dimensionsScanned} factors</strong><small>{result.validRowCount.toLocaleString()} valid rows in the current scope</small></div>
        <div className="guided-answer-actions"><button type="button" onClick={() => onOpenAdvanced(topDriver?.dimension)}>Investigate the evidence →</button><button type="button" className="quiet-button" onClick={onOpenQuality}>Check data quality</button></div>
      </div>
    </section>
  </section>;
}
