import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { EChartsOption } from 'echarts';
import { planningLenses } from '../lib/fpaInsights';
import type { PlanningLens } from '../lib/fpaInsights';
import type { DataQualityReport } from '../lib/dataQuality';
import type { MetricDefinition } from '../lib/metricSemantics';
import {
  guidedSlideIndex,
  guidedSlides,
  nextGuidedSlide,
  previousGuidedSlide,
} from '../lib/presentationFlow';
import type { GuidedSlideId } from '../lib/presentationFlow';
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
  metricDefinition: MetricDefinition;
  aiPanel: ReactNode;
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
  onOpenPresentation: () => void;
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
    animationDuration: 180,
    tooltip: { trigger: 'axis' },
    legend: { data: ['Actual', 'Plan / expected', 'Business impact'] },
    grid: { left: 58, right: 58, top: 42, bottom: 38 },
    xAxis: { type: 'category', data: points.map((point) => point.label), axisLabel: { hideOverlap: true } },
    yAxis: [
      { type: 'value', axisLabel: { formatter: (value: number) => compact(value) } },
      { type: 'value', axisLabel: { formatter: (value: number) => compact(value) } },
    ],
    series: [
      { name: 'Actual', type: 'line', data: points.map((point) => point.actual), showSymbol: points.length <= 12 },
      { name: 'Plan / expected', type: 'line', data: points.map((point) => point.expected), showSymbol: points.length <= 12 },
      { name: 'Business impact', type: 'bar', yAxisIndex: 1, data: points.map((point) => point.businessImpact), barMaxWidth: 20 },
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
  metricDefinition,
  aiPanel,
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
  onOpenPresentation,
}: Props) {
  const [question, setQuestion] = useState<GuidedQuestion>('variance');
  const [slide, setSlide] = useState<GuidedSlideId>('source');
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
  const slideIndex = guidedSlideIndex(slide);

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
    ? `Compare ${topDriver.topCategory.value} with unaffected categories, then use the AI analyst to test business context and external hypotheses before turning the pattern into a management action.`
    : 'Open Data quality and confirm the metric, comparison, time field, and eligible business dimensions.';

  function goTo(next: GuidedSlideId) {
    setSlide(next);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, select, textarea, button, a, summary')) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        goTo(nextGuidedSlide(slide));
      }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        goTo(previousGuidedSlide(slide));
      }
      if (event.key === 'Home') goTo('source');
      if (event.key === 'End') goTo('ai');
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [slide]);

  async function uploadAndContinue(file: File | undefined) {
    if (!file) return;
    await onUploadFile(file);
    goTo('question');
  }

  const sourceSlide = <section className="deck-page deck-source-page" aria-labelledby="deck-source-title">
    <div className="deck-copy"><span className="deck-kicker">01 · DATA</span><h2 id="deck-source-title">Choose where the answer comes from.</h2><p>Start with the embedded finance scenario, use your own file, or open the multi-million-row public demonstration.</p></div>
    <div className="deck-choice-grid deck-choice-grid-three">
      <button type="button" className="deck-choice-card primary" onClick={() => { onLoadSample(); goTo('question'); }}><span>FASTEST</span><strong>Finance sample</strong><small>{dataQuality.rowCount.toLocaleString()} rows are ready now</small><b>Continue →</b></button>
      <label className="deck-choice-card upload-card"><span>YOUR DATA</span><strong>Upload CSV or JSON</strong><small>Automatic profiling chooses safe starting fields</small><b>Select a file →</b><input type="file" accept=".csv,.json" onChange={(event) => uploadAndContinue(event.target.files?.[0])} /></label>
      <button type="button" className="deck-choice-card public" onClick={onOpenPublic}><span>LIVE SCALE</span><strong>3.8M public rows</strong><small>Server-side aggregation across ten finance dimensions</small><b>Open live deck →</b></button>
    </div>
  </section>;

  const questionSlide = <section className="deck-page" aria-labelledby="deck-question-title">
    <div className="deck-copy"><span className="deck-kicker">02 · QUESTION</span><h2 id="deck-question-title">What decision are you trying to make?</h2><p>Choose the business question. The application selects the appropriate first view and reporting window.</p></div>
    <div className="deck-choice-grid deck-question-grid">{questions.map((item) => <button
      key={item.id}
      type="button"
      className={question === item.id ? 'deck-choice-card active' : 'deck-choice-card'}
      onClick={() => { setQuestion(item.id); onTimeWindow(item.window); goTo('setup'); }}
    ><span>{item.id.toUpperCase()}</span><strong>{item.title}</strong><small>{item.description}</small><b>Choose →</b></button>)}</div>
  </section>;

  const setupSlide = <section className="deck-page" aria-labelledby="deck-setup-title">
    <div className="deck-copy"><span className="deck-kicker">03 · SETUP</span><h2 id="deck-setup-title">Confirm four finance essentials.</h2><p>The statistical and calendar assumptions remain available, but they do not block the first answer.</p></div>
    <div className="deck-setup-grid">
      <label><span>Finance use case</span><select value={planningLens} onChange={(event) => onPlanningLens(event.target.value as PlanningLens)}>{planningLenses.map((lens) => <option key={lens.id} value={lens.id}>{lens.label}</option>)}</select><small>Changes the management framing and recommended validation.</small></label>
      <label><span>What happened?</span><select value={actualKey} onChange={(event) => onActualKey(event.target.value)}>{numericFields.map((field) => <option key={field} value={field}>{humanize(field)}</option>)}</select><small>The Actual or observed financial measure.</small></label>
      <label><span>Compared with</span><select value={expectedKey} onChange={(event) => onExpectedKey(event.target.value)}><option value="">Rolling typical value</option>{numericFields.filter((field) => field !== actualKey).map((field) => <option key={field} value={field}>{humanize(field)}</option>)}</select><small>Budget, forecast, target, or historical benchmark.</small></label>
      <label><span>Reporting period</span><select value={timeWindow} onChange={(event) => onTimeWindow(event.target.value as TimeWindow)}><option value="90d">Last 90 days</option><option value="8w">Last 8 weeks</option><option value="13w">Last 13 weeks</option><option value="15m">Last 15 months</option><option value="24m">Last 24 months</option><option value="mtd">Month to date</option><option value="qtd">Quarter to date</option><option value="ytd">Year to date</option><option value="all">All available periods</option></select><small>Controls both the trend and the driver population.</small></label>
    </div>
    <div className="deck-assumption-row">
      <label>Business direction<select value={metricPolarity} onChange={(event) => onMetricPolarity(event.target.value as MetricPolarity)}><option value="higher_is_better">Higher is better</option><option value="lower_is_better">Lower is better</option></select></label>
      <div><span>Automatic assumptions</span><strong>{metricDefinition.name} · {timeSeries?.timeField ? humanize(timeSeries.timeField) : 'No time field'} · {timeSeries?.aggregation ? humanize(timeSeries.aggregation) : humanize(metricDefinition.aggregation)} · FY month {timeSeries?.fiscalYearStartMonth ?? metricDefinition.fiscalYearStartMonth}</strong><small>{metricDefinition.missingSemantics.length ? `Still requires ${metricDefinition.missingSemantics.join(', ')}. ` : 'Metric semantics are sufficiently declared for this prototype. '}Open Advanced Analysis for the full contract and calculation evidence.</small></div>
      <button type="button" onClick={() => goTo('answer')}>Run the analysis →</button>
    </div>
  </section>;

  const answerSlide = <section className="deck-page deck-answer-page" aria-labelledby="deck-answer-title">
    <div className="deck-answer-hero">
      <div><span className="deck-kicker">04 · ANSWER</span><h2 id="deck-answer-title">{headline}</h2><p>{selectedQuestion.description}</p></div>
      <div className={`deck-one-number ${impactDirection}`}><span>{question === 'pace' && timeSeries?.runRate ? 'Projected impact' : 'Business impact'}</span><strong>{displayedImpact >= 0 ? '+' : '-'}{compact(Math.abs(displayedImpact))}</strong><small>{impactDirection} · {windowLabel(timeWindow)}</small></div>
    </div>
    <div className="deck-answer-body">
      <div className="deck-answer-cards">
        <article><span>What happened</span><p>{whatChanged}</p></article>
        <article><span>Where it lives</span><p>{whereItLives}</p></article>
        <article><span>Is it persistent?</span><p>{trendText}</p></article>
        <article><span>What to do next</span><p>{nextAction}</p></article>
      </div>
      {timeSeries?.points.length ? <div className="deck-mini-chart"><EChart option={option} height={250} ariaLabel="Simplified actual, plan, and business impact trend" /></div> : <div className="deck-no-chart"><strong>No time series available</strong><span>The answer is based on cross-sectional variance and driver evidence.</span></div>}
    </div>
    <div className="deck-answer-actions"><button type="button" onClick={onOpenPresentation}>Create presentation slide</button><button type="button" onClick={() => goTo('drivers')}>Review the drivers →</button><button type="button" onClick={() => goTo('ai')}>Ask the AI analyst →</button><button type="button" className="quiet-button" onClick={() => onOpenAdvanced(topDriver?.dimension)}>Open all evidence</button></div>
  </section>;

  const driversSlide = <section className="deck-page" aria-labelledby="deck-drivers-title">
    <div className="deck-copy"><span className="deck-kicker">05 · DRIVERS</span><h2 id="deck-drivers-title">The strongest places to investigate.</h2><p>Every card comes from the same time-aligned all-dimension scan. Select a card to open its detailed category evidence.</p></div>
    <div className="deck-driver-layout">
      <div className="deck-driver-grid">{result.dimensionScores.slice(0, 6).map((driver, index) => <button type="button" key={driver.dimension} onClick={() => onOpenAdvanced(driver.dimension)}>
        <span>#{index + 1} · score {driver.score.toFixed(0)}</span><strong>{humanize(driver.dimension)}</strong><b>{driver.topCategory?.value ?? 'No stable category'}</b><small>{driver.topCategory ? `${compact(Math.abs(driver.topCategory.businessImpact))} ${driver.topCategory.impactDirection} · ${(driver.topCategory.support * 100).toFixed(1)}% support` : 'Open advanced evidence for details'}</small>
      </button>)}</div>
      <aside className="deck-driver-summary">
        <span>Strongest combined pattern</span>
        <strong>{result.interactions[0] ? result.interactions[0].predicates.map((predicate) => `${humanize(predicate.dimension)} = ${predicate.value}`).join(' + ') : 'No supported interaction'}</strong>
        <p>{result.interactions[0] ? `${compact(Math.abs(result.interactions[0].businessImpact))} ${result.interactions[0].impactDirection} impact across ${(result.interactions[0].support * 100).toFixed(1)}% of the current population.` : 'The current population did not produce a stable multidimensional interaction above the support threshold.'}</p>
        <div><button type="button" onClick={onOpenPresentation}>Create driver slide</button><button type="button" onClick={() => goTo('ai')}>Ask AI about these drivers →</button><button type="button" className="quiet-button" onClick={() => onOpenAdvanced(topDriver?.dimension)}>Open advanced evidence</button></div>
      </aside>
    </div>
  </section>;

  const aiSlide = <section className="deck-page deck-ai-page" aria-labelledby="deck-ai-title">
    <div className="deck-copy deck-ai-copy"><span className="deck-kicker">06 · AI ANALYST</span><h2 id="deck-ai-title">Talk to the same verified finance evidence.</h2><p>The deterministic finance guide works immediately. Open the visible LLM settings to connect an OpenAI-compatible endpoint, model, and in-memory API key.</p></div>
    <div className="deck-ai-panel">{aiPanel}</div>
  </section>;

  const pages: Record<GuidedSlideId, ReactNode> = {
    source: sourceSlide,
    question: questionSlide,
    setup: setupSlide,
    answer: answerSlide,
    drivers: driversSlide,
    ai: aiSlide,
  };

  return <section className="presentation-deck" aria-label="FP&A slideshow workflow">
    <nav className="deck-progress" aria-label="Presentation pages">
      {guidedSlides.map((item, index) => <button key={item.id} type="button" className={slide === item.id ? 'active' : index < slideIndex ? 'complete' : ''} onClick={() => goTo(item.id)} aria-current={slide === item.id ? 'step' : undefined}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.label}</strong></button>)}
    </nav>
    <div className="deck-stage" aria-live="polite">{pages[slide]}</div>
    <footer className="deck-footer">
      <button type="button" onClick={() => goTo(previousGuidedSlide(slide))} disabled={slideIndex === 0}>← Previous</button>
      <div><strong>{guidedSlides[slideIndex].shortLabel}</strong><span>Page {slideIndex + 1} of {guidedSlides.length} · use ← and → keys</span></div>
      <button type="button" onClick={() => goTo(nextGuidedSlide(slide))} disabled={slideIndex === guidedSlides.length - 1}>Next →</button>
    </footer>
  </section>;
}
