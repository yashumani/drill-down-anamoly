import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createSampleData } from './data/sampleData';
import { createQualityDemoData } from './data/qualityDemo';
import { investigate } from './lib/anomaly';
import { analyzeDataQuality } from './lib/dataQuality';
import type { PlanningLens } from './lib/fpaInsights';
import { planningLenses } from './lib/fpaInsights';
import { parseDataFile } from './lib/io';
import type { NewsAnalysisResult } from './lib/newsIntel';
import { profileFields } from './lib/profile';
import { buildFinanceTimeSeries, detectTimeFields } from './lib/timeIntelligence';
import type { AggregationMethod, TimeGrain, TimeWindow } from './lib/timeIntelligence';
import { filterRowsByTimeWindow } from './lib/timeWindow';
import { ContributionBars, DimensionLandscape, DrillTree, InteractionList } from './components/Visuals';
import { ChatPanel } from './components/ChatPanel';
import { DataQualityPanel } from './components/DataQualityPanel';
import { FpaInsightPanel } from './components/FpaInsightPanel';
import { NewsIntelPanel } from './components/NewsIntelPanel';
import { ThemePicker } from './components/ThemePicker';
import type { PaletteId } from './components/ThemePicker';
import { TimeSeriesCockpit } from './components/TimeSeriesCockpit';
import type { ChatAction } from './lib/chatEngine';
import type { DataRow, DimensionScore, MetricPolarity, Predicate } from './types';

const format = (value: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
const humanize = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

type Workspace = 'insights' | 'quality';

function defaultWindow(grain: TimeGrain): TimeWindow {
  if (grain === 'day') return '90d';
  if (grain === 'week') return '13w';
  if (grain === 'quarter') return '24m';
  return '15m';
}

function windowLabel(window: TimeWindow) {
  const labels: Record<TimeWindow, string> = {
    '90d': 'Last 90 days',
    '8w': 'Last 8 weeks',
    '13w': 'Last 13 weeks',
    '15m': 'Last 15 months',
    '24m': 'Last 24 months',
    mtd: 'MTD',
    qtd: 'QTD',
    ytd: 'YTD',
    all: 'All periods',
  };
  return labels[window];
}

export default function App() {
  const [rows, setRows] = useState<DataRow[]>(() => createSampleData());
  const [workspace, setWorkspace] = useState<Workspace>('insights');
  const [actualKey, setActualKey] = useState('actual');
  const [expectedKey, setExpectedKey] = useState('target');
  const [metricPolarity, setMetricPolarity] = useState<MetricPolarity>('higher_is_better');
  const [planningLens, setPlanningLens] = useState<PlanningLens>('revenue');
  const [predicates, setPredicates] = useState<Predicate[]>([]);
  const [selectedDimension, setSelectedDimension] = useState<string>('region');
  const [timeField, setTimeField] = useState('month');
  const [timeGrain, setTimeGrain] = useState<TimeGrain>('month');
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('15m');
  const [aggregation, setAggregation] = useState<AggregationMethod>('sum');
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState(1);
  const [materialityPercent, setMaterialityPercent] = useState(0.03);
  const [manualContext, setManualContext] = useState('');
  const [newsContext, setNewsContext] = useState('');
  const [newsAnalysis, setNewsAnalysis] = useState<NewsAnalysisResult | null>(null);
  const [palette, setPalette] = useState<PaletteId>(() => {
    const saved = localStorage.getItem('anomaly-palette');
    return saved === 'slate' || saved === 'warm' || saved === 'light' ? saved : 'midnight';
  });
  const [error, setError] = useState('');

  const profiles = useMemo(() => profileFields(rows), [rows]);
  const qualityReport = useMemo(() => analyzeDataQuality(rows), [rows]);
  const qualityByName = useMemo(() => new Map(qualityReport.columns.map((column) => [column.name, column])), [qualityReport.columns]);
  const numeric = profiles.filter((profile) => profile.kind === 'numeric' && qualityByName.get(profile.name)?.analysisRole === 'measure');
  const timeCandidates = useMemo(() => detectTimeFields(rows), [rows]);
  const activeTimeField = timeCandidates.some((candidate) => candidate.field === timeField) ? timeField : timeCandidates[0]?.field ?? '';
  const timeFields = useMemo(() => new Set(timeCandidates.map((candidate) => candidate.field)), [timeCandidates]);
  const availableDimensions = profiles.filter((profile) => qualityByName.get(profile.name)?.analysisRole === 'dimension' && !timeFields.has(profile.name));
  const dimensions = availableDimensions.map((profile) => profile.name);
  const dimensionKey = dimensions.join('|');
  const analysisRows = useMemo(
    () => activeTimeField ? filterRowsByTimeWindow(rows, activeTimeField, timeWindow, fiscalYearStartMonth) : rows,
    [rows, activeTimeField, timeWindow, fiscalYearStartMonth],
  );
  const externalContext = [manualContext, newsContext].filter(Boolean).join('\n\n');
  const result = useMemo(
    () => investigate(analysisRows, dimensions, actualKey, expectedKey || undefined, predicates, metricPolarity),
    [analysisRows, dimensionKey, actualKey, expectedKey, predicates, metricPolarity],
  );
  const timeSeries = useMemo(
    () => activeTimeField ? buildFinanceTimeSeries({
      rows,
      predicates,
      actualKey,
      expectedKey: expectedKey || undefined,
      timeField: activeTimeField,
      grain: timeGrain,
      window: timeWindow,
      aggregation,
      metricPolarity,
      fiscalYearStartMonth,
      materialityPercent,
    }) : null,
    [rows, predicates, actualKey, expectedKey, activeTimeField, timeGrain, timeWindow, aggregation, metricPolarity, fiscalYearStartMonth, materialityPercent],
  );
  const selectedScore = result.dimensionScores.find((dimension) => dimension.dimension === selectedDimension) ?? result.dimensionScores[0] ?? null;
  const topDriver = result.dimensionScores[0] ?? null;
  const selectedTone = result.businessImpact < 0 ? 'bad' : result.businessImpact > 0 ? 'good' : undefined;
  const currentPoint = timeSeries?.currentPeriod;
  const executiveImpact = currentPoint?.businessImpact ?? result.businessImpact;
  const executiveTone = executiveImpact < 0 ? 'bad' : executiveImpact > 0 ? 'good' : undefined;

  function changePalette(next: PaletteId) {
    setPalette(next);
    localStorage.setItem('anomaly-palette', next);
  }

  function applyDataset(nextRows: DataRow[], preferredActual?: string, preferredExpected?: string) {
    const nextQuality = analyzeDataQuality(nextRows);
    const nextProfiles = profileFields(nextRows);
    const candidateActual = preferredActual && nextQuality.measureCandidates.includes(preferredActual)
      ? preferredActual
      : nextQuality.measureCandidates[0] ?? nextProfiles.find((profile) => profile.kind === 'numeric')?.name ?? '';
    const candidateExpected = preferredExpected && nextQuality.measureCandidates.includes(preferredExpected) && preferredExpected !== candidateActual
      ? preferredExpected
      : nextQuality.measureCandidates.find((name) => name !== candidateActual) ?? '';
    const candidateTime = detectTimeFields(nextRows)[0];
    setRows(nextRows);
    setActualKey(candidateActual);
    setExpectedKey(candidateExpected);
    setMetricPolarity('higher_is_better');
    setPlanningLens('revenue');
    setPredicates([]);
    setSelectedDimension(nextQuality.dimensionCandidates[0] ?? '');
    setTimeField(candidateTime?.field ?? '');
    setTimeGrain(candidateTime?.suggestedGrain ?? 'month');
    setTimeWindow(defaultWindow(candidateTime?.suggestedGrain ?? 'month'));
    setAggregation('sum');
    setFiscalYearStartMonth(1);
    setMaterialityPercent(0.03);
    setManualContext('');
    setNewsContext('');
    setNewsAnalysis(null);
  }

  function loadCleanDemo() {
    applyDataset(createSampleData(), 'actual', 'target');
    setWorkspace('insights');
  }

  function loadQualityDemo() {
    applyDataset(createQualityDemoData(), 'actual', 'target');
    setWorkspace('quality');
  }

  function changeTimeField(next: string) {
    const candidate = timeCandidates.find((item) => item.field === next);
    setTimeField(next);
    if (candidate) {
      setTimeGrain(candidate.suggestedGrain);
      setTimeWindow(defaultWindow(candidate.suggestedGrain));
    }
    setPredicates([]);
  }

  function changeTimeGrain(next: TimeGrain) {
    setTimeGrain(next);
    setTimeWindow(defaultWindow(next));
    setPredicates([]);
  }

  function drill(next: Predicate[]) {
    const merged = [...predicates];
    for (const predicate of next) {
      const index = merged.findIndex((current) => current.dimension === predicate.dimension);
      if (index >= 0) merged[index] = predicate;
      else merged.push(predicate);
    }
    setPredicates(merged);
    setSelectedDimension('');
  }

  function handleChatAction(action: ChatAction) {
    if (action.type === 'drill' && action.predicates?.length) drill(action.predicates);
    if (action.type === 'reset') {
      setPredicates([]);
      setSelectedDimension(qualityReport.dimensionCandidates.find((dimension) => !timeFields.has(dimension)) ?? '');
    }
    if (action.type === 'back') setPredicates((previous) => previous.slice(0, -1));
    if (action.type === 'select-dimension' && action.dimension) setSelectedDimension(action.dimension);
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    try {
      setError('');
      const parsed = await parseDataFile(file);
      if (!parsed.length) throw new Error('No rows found in this file.');
      const nextQuality = analyzeDataQuality(parsed);
      if (!nextQuality.measureCandidates.length) throw new Error('No reliable numeric measure was detected. Open Data quality to review mixed types or missing values.');
      applyDataset(parsed);
      setWorkspace(nextQuality.analysisReady ? 'insights' : 'quality');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }

  return <main data-theme={palette}>
    <header className="hero compact-hero">
      <div><span className="eyebrow">FP&A PERFORMANCE EXPLORER</span><h1>Explain variance. Find the why. Act faster.</h1><p>Built for CFO and SVP operating reviews: monitor plan performance across time, identify material business drivers, test external hypotheses, and preserve a reproducible analytical trail.</p></div>
      <div className="header-tools"><ThemePicker value={palette} onChange={changePalette} /><label className="upload">Use my data<input type="file" accept=".csv,.json" onChange={(event) => loadFile(event.target.files?.[0])} /></label></div>
    </header>

    {error && <div className="error">{error}</div>}

    <nav className="workspace-tabs" aria-label="Workspace">
      <button type="button" className={workspace === 'insights' ? 'active' : ''} onClick={() => setWorkspace('insights')}>Insights</button>
      <button type="button" className={workspace === 'quality' ? 'active' : ''} onClick={() => setWorkspace('quality')}>Data quality <span>{qualityReport.overallScore.toFixed(0)}</span></button>
    </nav>

    <section className="controls top-controls" aria-label="Analysis filters">
      {workspace === 'insights' && <>
        <label>FP&A lens<select value={planningLens} onChange={(event) => setPlanningLens(event.target.value as PlanningLens)}>{planningLenses.map((lens) => <option key={lens.id} value={lens.id}>{lens.label}</option>)}</select></label>
        <label>Measure<select value={actualKey} onChange={(event) => { setActualKey(event.target.value); setPredicates([]); }}>{numeric.map((profile) => <option key={profile.name} value={profile.name}>{humanize(profile.name)}</option>)}</select></label>
        <label>Compare with<select value={expectedKey} onChange={(event) => { setExpectedKey(event.target.value); setPredicates([]); }}><option value="">Rolling typical value</option>{numeric.filter((profile) => profile.name !== actualKey).map((profile) => <option key={profile.name} value={profile.name}>{humanize(profile.name)}</option>)}</select></label>
        <label>Business direction<select value={metricPolarity} onChange={(event) => { setMetricPolarity(event.target.value as MetricPolarity); setPredicates([]); }}><option value="higher_is_better">Higher is better</option><option value="lower_is_better">Lower is better</option></select></label>
        <div className="filter-scope"><span>Analysis scope</span><strong>{windowLabel(timeWindow)}{predicates.length ? ` • ${predicates.map((predicate) => `${humanize(predicate.dimension)}: ${predicate.value}`).join(' • ')}` : ' • All business dimensions'}</strong></div>
        {predicates.length > 0 && <button className="quiet-button" onClick={() => setPredicates([])}>Clear drill</button>}
      </>}
      {workspace === 'quality' && <div className="filter-scope"><span>Dataset</span><strong>{qualityReport.rowCount.toLocaleString()} rows · {qualityReport.columnCount.toLocaleString()} columns · {qualityReport.status}</strong></div>}
      <button className="quiet-button" onClick={loadCleanDemo}>Reset clean demo</button>
      <button className="quiet-button" onClick={loadQualityDemo}>Load quality demo</button>
    </section>

    {workspace === 'quality' ? <DataQualityPanel rows={rows} report={qualityReport} onLoadCleanDemo={loadCleanDemo} onLoadQualityDemo={loadQualityDemo} /> : <>
      {(qualityReport.blockers > 0 || qualityReport.warnings > 0) && <button type="button" className={`analysis-quality-warning ${qualityReport.blockers ? 'critical' : ''}`} onClick={() => setWorkspace('quality')}>
        <strong>Data quality: {qualityReport.overallScore.toFixed(0)}/100</strong>
        <span>{qualityReport.blockers ? `${qualityReport.blockers} blocker(s) can change or invalidate the analysis.` : `${qualityReport.warnings} warning(s) should be reviewed.`} Open the supporting Data Quality Explorer.</span>
      </button>}

      <section className="executive-metrics">
        <Metric label={currentPoint ? `${currentPoint.label} actual` : 'Selected-scope actual'} value={format(currentPoint?.actual ?? result.actual)} helper={`${humanize(actualKey)} · ${timeSeries?.coverage.validMeasureRows.toLocaleString() ?? result.validRowCount.toLocaleString()} valid rows`} />
        <Metric label={expectedKey ? 'Plan / expected' : 'Rolling typical'} value={format(currentPoint?.expected ?? result.expected)} helper={expectedKey ? humanize(expectedKey) : 'Rolling median baseline'} />
        <Metric label="Current-period impact" value={`${executiveImpact >= 0 ? '+' : ''}${format(executiveImpact)}`} helper={`${currentPoint?.impactDirection ?? result.impactDirection} · ${windowLabel(timeWindow)} driver scope`} tone={executiveTone} />
        <Metric label="Analysis health" value={timeSeries ? `${timeSeries.modelHealth.score.toFixed(0)}/100` : plainAnomaly(result.anomalyScore)} helper={timeSeries ? `${humanize(timeSeries.modelHealth.status)} · run ${timeSeries.runId}` : 'Standardized movement strength'} tone={timeSeries?.modelHealth.status === 'healthy' ? undefined : 'warn'} />
      </section>

      <TimeSeriesCockpit
        result={timeSeries}
        candidates={timeCandidates}
        timeField={activeTimeField}
        grain={timeGrain}
        window={timeWindow}
        aggregation={aggregation}
        fiscalYearStartMonth={fiscalYearStartMonth}
        materialityPercent={materialityPercent}
        onTimeField={changeTimeField}
        onGrain={changeTimeGrain}
        onWindow={(next) => { setTimeWindow(next); setPredicates([]); }}
        onAggregation={(next) => { setAggregation(next); setPredicates([]); }}
        onFiscalYearStartMonth={(next) => { setFiscalYearStartMonth(next); setPredicates([]); }}
        onMaterialityPercent={setMaterialityPercent}
      />

      <FpaInsightPanel rows={analysisRows} predicates={predicates} result={result} dataQuality={qualityReport} planningLens={planningLens} newsAnalysis={newsAnalysis} timeSeries={timeSeries} />

      <section className="guided-layout">
        <div className="guided-main">
          <section className={`story-banner ${selectedTone ?? ''}`}><div className="story-kicker">SELECTED-WINDOW BOTTOM LINE</div><h2>The business impact is <span>{format(Math.abs(result.businessImpact))}</span> {result.impactDirection} across {windowLabel(timeWindow).toLowerCase()}.</h2><p>{plainSummary(result.businessImpact, result.variance, result.variancePct, result.anomalyScore, metricPolarity)}</p>{topDriver?.topCategory && <div className="next-clue"><span>Strongest clue</span><strong>{humanize(topDriver.dimension)} → {topDriver.topCategory.value}</strong><button onClick={() => setSelectedDimension(topDriver.dimension)}>Explore</button></div>}{result.warnings.length > 0 && <div className="analysis-warnings">{result.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}</section>
          <Panel title="What is contributing most?" subtitle={`Driver rankings are aligned to ${windowLabel(timeWindow).toLowerCase()} and automatically re-check every remaining quality-approved business factor after each drill.`}><div className="driver-split"><DimensionLandscape scores={result.dimensionScores} onSelect={(dimension: DimensionScore) => setSelectedDimension(dimension.dimension)} /><ContributionBars score={selectedScore} onDrill={(predicate) => drill([predicate])} /></div></Panel>
        </div>
        <div className="insight-sidebar">
          <NewsIntelPanel onContextReady={setNewsContext} onAnalysisReady={setNewsAnalysis} />
          <ChatPanel rows={analysisRows} dimensions={dimensions} actualKey={actualKey} expectedKey={expectedKey || undefined} metricPolarity={metricPolarity} predicates={predicates} result={result} dataQuality={qualityReport} timeSeries={timeSeries} externalContext={externalContext} manualContext={manualContext} onExternalContext={setManualContext} onAction={handleChatAction} />
        </div>
      </section>

      <details className="more-analysis"><summary>More analysis</summary><div className="grid two"><Panel title="Combined patterns" subtitle="Groups where several characteristics appear together inside the selected finance window."><InteractionList interactions={result.interactions} onDrill={drill} /></Panel><Panel title="Investigation trail" subtitle="The path you have taken so far."><DrillTree predicates={predicates} /></Panel></div><div className="breadcrumbs"><button onClick={() => setPredicates([])}>All business dimensions</button>{predicates.map((predicate, index) => <button key={`${predicate.dimension}-${predicate.value}`} onClick={() => setPredicates(predicates.slice(0, index + 1))}>→ {humanize(predicate.dimension)}: {predicate.value}</button>)}</div></details>

      <details className="analyst-details"><summary>Analyst evidence</summary><section className="technical-strip"><span><strong>{result.validRowCount.toLocaleString()}</strong> valid measure rows</span><span><strong>{result.excludedMeasureRows.toLocaleString()}</strong> excluded measure rows</span><span><strong>{result.dimensionsScanned}</strong> business factors</span><span><strong>{result.anomalyScore.toFixed(2)}</strong> standardized deviation</span><span><strong>{metricPolarity === 'higher_is_better' ? 'Higher' : 'Lower'}</strong> is better</span><span><strong>{windowLabel(timeWindow)}</strong> selected window</span></section><section className="table-panel"><h2>Factor audit</h2><p>Detailed evidence for every business factor reviewed after excluding time fields and quality-ineligible columns.</p><div className="table-wrap"><table><thead><tr><th>#</th><th>Factor</th><th>Score</th><th>Leading group</th><th>Business impact</th><th>Support</th><th>Impact</th></tr></thead><tbody>{result.dimensionScores.map((dimension, index) => <tr key={dimension.dimension} onClick={() => setSelectedDimension(dimension.dimension)}><td>{index + 1}</td><td>{humanize(dimension.dimension)}</td><td>{dimension.score.toFixed(1)}</td><td>{dimension.topCategory?.value}</td><td className={Number(dimension.topCategory?.businessImpact) < 0 ? 'bad' : 'good'}>{format(dimension.topCategory?.businessImpact ?? 0)}</td><td>{dimension.topCategory ? `${(dimension.topCategory.support * 100).toFixed(1)}%` : '—'}</td><td>{(dimension.impact * 100).toFixed(1)}%</td></tr>)}</tbody></table></div></section></details>
    </>}
  </main>;
}

function Metric({ label, value, helper, tone }: { label: string; value: string; helper?: string; tone?: string }) {
  return <div className="metric friendly-metric"><span>{label}</span><strong className={tone}>{value}</strong>{helper && <small>{helper}</small>}</div>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <section className="panel"><div className="panel-head"><h2>{title}</h2><p>{subtitle}</p></div>{children}</section>;
}

function plainAnomaly(score: number) {
  if (score >= 3) return 'Very unusual';
  if (score >= 2) return 'Unusual';
  if (score >= 1) return 'Worth watching';
  return 'Normal range';
}

function plainSummary(businessImpact: number, rawVariance: number, variancePct: number | null, anomalyScore: number, metricPolarity: MetricPolarity) {
  const direction = businessImpact < 0 ? 'unfavorable' : businessImpact > 0 ? 'favorable' : 'neutral';
  const percentageText = variancePct == null ? '' : ` Raw actual-versus-plan variance is ${rawVariance >= 0 ? 'above' : 'below'} expectation by ${Math.abs(variancePct * 100).toFixed(1)}%.`;
  const polarityText = metricPolarity === 'higher_is_better' ? 'Higher values are configured as better.' : 'Lower values are configured as better, so positive raw variance is unfavorable.';
  const unusual = anomalyScore >= 2 ? ' The movement stands out from normal row-level variation.' : ' The movement is within a range that can occur through normal row-level variation.';
  return `The current drill scope shows ${direction} business impact of ${format(Math.abs(businessImpact))}.${percentageText} ${polarityText}${unusual}`;
}
