import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createSampleData } from './data/sampleData';
import { createQualityDemoData } from './data/qualityDemo';
import { investigate } from './lib/anomaly';
import { analyzeDataQuality } from './lib/dataQuality';
import { inferDatasetDefaults } from './lib/datasetDefaults';
import { createDatasetSession } from './lib/datasetSession';
import { buildEvidenceLedger } from './lib/evidenceLedger';
import { createInvestigationSnapshot, downloadInvestigationSnapshot } from './lib/investigationSnapshot';
import type { DatasetSource } from './lib/datasetSession';
import type { FinanceDataContractReport } from './lib/financeDataContract';
import type { PlanningLens } from './lib/fpaInsights';
import { planningLenses } from './lib/fpaInsights';
import { parseDataFileWithMetadata } from './lib/io';
import type { NewsAnalysisResult } from './lib/newsIntel';
import { profileFields } from './lib/profile';
import { buildFinanceTimeSeries, detectTimeFields } from './lib/timeIntelligence';
import type { AggregationMethod, TimeGrain, TimeWindow } from './lib/timeIntelligence';
import { filterRowsByTimeWindow } from './lib/timeWindow';
import { layoutModeForWidth } from './lib/responsiveLayout';
import type { LayoutMode } from './lib/responsiveLayout';
import { workspaceFromHash, writeWorkspaceHash } from './lib/workspaceRouting';
import { ContributionBars, DimensionLandscape, DrillTree } from './components/Visuals';
import { CombinationExplorer } from './components/CombinationExplorer';
import { ExplorationControlBar } from './components/ExplorationControlBar';
import type { ExplorerMode } from './components/ExplorationControlBar';
import { HierarchyDataExplorer } from './components/HierarchyDataExplorer';
import { ChatPanel } from './components/ChatPanel';
import { DataQualityPanel } from './components/DataQualityPanel';
import { FpaInsightPanel } from './components/FpaInsightPanel';
import { ExternalFactorValidationPanel } from './components/ExternalFactorValidationPanel';
import { GuidedExperience } from './components/GuidedExperience';
import { LivePublicFinanceDemo } from './components/LivePublicFinanceDemo';
import { NewsIntelPanel } from './components/NewsIntelPanel';
import { isPaletteId } from './components/ThemePicker';
import type { PaletteId } from './components/ThemePicker';
import { TimeSeriesCockpit } from './components/TimeSeriesCockpit';
import { PresentationStudio } from './components/PresentationStudio';
import { OpenWebShell } from './components/OpenWebShell';
import { AdvancedJourneyNav, AdvancedStageFooter } from './components/AdvancedJourneyNav';
import type { AdvancedStage } from './components/AdvancedJourneyNav';
import type { ChatAction } from './lib/chatEngine';
import type { DataRow, DimensionScore, MetricPolarity, Predicate } from './types';

const format = (value: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
const humanize = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

type Workspace = 'guided' | 'advanced' | 'public-demo' | 'quality';

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

export default function AppShell() {
  const [rows, setRows] = useState<DataRow[]>(() => createSampleData());
  const [contractReport, setContractReport] = useState<FinanceDataContractReport | undefined>();
  const [datasetSource, setDatasetSource] = useState<DatasetSource>({ kind: 'embedded', name: 'Finance sample' });
  const [workspace, setWorkspace] = useState<Workspace>(() => workspaceFromHash());
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => layoutModeForWidth(typeof window === 'undefined' ? 1280 : window.innerWidth));
  const [actualKey, setActualKey] = useState('actual');
  const [expectedKey, setExpectedKey] = useState('target');
  const [metricPolarity, setMetricPolarity] = useState<MetricPolarity>('higher_is_better');
  const [planningLens, setPlanningLens] = useState<PlanningLens>('revenue');
  const [predicates, setPredicates] = useState<Predicate[]>([]);
  const [selectedDimension, setSelectedDimension] = useState<string>('region');
  const [selectedCategoryValue, setSelectedCategoryValue] = useState('');
  const [explorerMode, setExplorerMode] = useState<ExplorerMode>('basic');
  const [advancedStage, setAdvancedStage] = useState<AdvancedStage>('scope');
  const [explainView, setExplainView] = useState<'drivers' | 'combinations' | 'hierarchy'>('drivers');
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
    return isPaletteId(saved) ? saved : 'slate';
  });
  const [error, setError] = useState('');
  const [presentationOpen, setPresentationOpen] = useState(false);

  const profiles = useMemo(() => profileFields(rows), [rows]);
  const datasetSession = useMemo(() => createDatasetSession({ rows, source: datasetSource, contractReport }), [rows, datasetSource, contractReport]);
  const qualityReport = datasetSession.qualityReport;
  const metricDefinition = datasetSession.metricDefinition;
  const qualityByName = useMemo(() => new Map(qualityReport.columns.map((column) => [column.name, column])), [qualityReport.columns]);
  const numeric = profiles.filter((profile) => profile.kind === 'numeric' && qualityByName.get(profile.name)?.analysisRole === 'measure');
  const timeCandidates = datasetSession.timeCandidates;
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
    () => investigate(analysisRows, dimensions, actualKey, expectedKey || undefined, predicates, metricPolarity, { aggregationMethod: aggregation, timeField: activeTimeField || undefined }),
    [analysisRows, dimensionKey, actualKey, expectedKey, predicates, metricPolarity, aggregation, activeTimeField],
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
  const evidenceLedger = useMemo(() => buildEvidenceLedger({
    result,
    predicates,
    metricDefinition,
    dataQuality: qualityReport,
    timeSeries,
    datasetSession,
    externalContext,
  }), [result, predicates, metricDefinition, qualityReport, timeSeries, datasetSession, externalContext]);
  const selectedScore = result.dimensionScores.find((dimension) => dimension.dimension === selectedDimension) ?? result.dimensionScores[0] ?? null;
  const topDriver = result.dimensionScores[0] ?? null;
  const selectedTone = result.businessImpact < 0 ? 'bad' : result.businessImpact > 0 ? 'good' : undefined;
  const currentPoint = timeSeries?.currentPeriod;
  const executiveImpact = currentPoint?.businessImpact ?? result.businessImpact;
  const executiveTone = executiveImpact < 0 ? 'bad' : executiveImpact > 0 ? 'good' : undefined;
  const presentationWorkspace = workspace === 'guided' || workspace === 'public-demo';

  useEffect(() => {
    const onRouteChange = () => setWorkspace(workspaceFromHash());
    window.addEventListener('hashchange', onRouteChange);
    window.addEventListener('popstate', onRouteChange);
    return () => {
      window.removeEventListener('hashchange', onRouteChange);
      window.removeEventListener('popstate', onRouteChange);
    };
  }, []);

  useEffect(() => {
    writeWorkspaceHash(workspace);
  }, [workspace]);

  useEffect(() => {
    const updateLayoutMode = () => setLayoutMode(layoutModeForWidth(window.innerWidth));
    updateLayoutMode();
    window.addEventListener('resize', updateLayoutMode);
    window.addEventListener('orientationchange', updateLayoutMode);
    return () => {
      window.removeEventListener('resize', updateLayoutMode);
      window.removeEventListener('orientationchange', updateLayoutMode);
    };
  }, []);

  useEffect(() => {
    const categories = selectedScore?.categories ?? [];
    if (!categories.some((category) => category.value === selectedCategoryValue)) setSelectedCategoryValue(categories[0]?.value ?? '');
  }, [selectedScore?.dimension, selectedScore?.categories, selectedCategoryValue]);

  function changePalette(next: PaletteId) {
    setPalette(next);
    localStorage.setItem('anomaly-palette', next);
  }

  function applyDataset(
    nextRows: DataRow[],
    preferredActual?: string,
    preferredExpected?: string,
    metadata?: { contractReport?: FinanceDataContractReport; source?: DatasetSource },
  ) {
    const nextQuality = analyzeDataQuality(nextRows);
    const nextProfiles = profileFields(nextRows);
    const defaults = inferDatasetDefaults(nextRows, nextQuality.measureCandidates);
    const candidateActual = preferredActual && nextQuality.measureCandidates.includes(preferredActual)
      ? preferredActual
      : defaults.actualKey || nextQuality.measureCandidates[0] || nextProfiles.find((profile) => profile.kind === 'numeric')?.name || '';
    const candidateExpected = preferredExpected && nextQuality.measureCandidates.includes(preferredExpected) && preferredExpected !== candidateActual
      ? preferredExpected
      : defaults.expectedKey && defaults.expectedKey !== candidateActual
        ? defaults.expectedKey
        : nextQuality.measureCandidates.find((name) => name !== candidateActual) ?? '';
    const candidateTime = detectTimeFields(nextRows)[0];
    setRows(nextRows);
    setContractReport(metadata?.contractReport);
    setDatasetSource(metadata?.source ?? { kind: 'unknown', name: defaults.datasetLabel });
    setActualKey(candidateActual);
    setExpectedKey(candidateExpected);
    setMetricPolarity(defaults.metricPolarity);
    setPlanningLens(defaults.planningLens);
    setPredicates([]);
    setSelectedDimension(nextQuality.dimensionCandidates[0] ?? '');
    setSelectedCategoryValue('');
    setTimeField(candidateTime?.field ?? '');
    setTimeGrain(candidateTime?.suggestedGrain ?? 'month');
    setTimeWindow(defaultWindow(candidateTime?.suggestedGrain ?? 'month'));
    setAggregation(defaults.aggregation);
    setFiscalYearStartMonth(defaults.fiscalYearStartMonth);
    setMaterialityPercent(0.03);
    setManualContext('');
    setNewsContext('');
    setNewsAnalysis(null);
  }

  function loadCleanDemo() {
    applyDataset(createSampleData(), 'actual', 'target', { source: { kind: 'embedded', name: 'Finance sample' } });
    setAdvancedStage('scope');
    setExplainView('drivers');
    setWorkspace('guided');
  }

  function loadQualityDemo() {
    applyDataset(createQualityDemoData(), 'actual', 'target', { source: { kind: 'embedded', name: 'Data quality demonstration' } });
    setAdvancedStage('scope');
    setExplainView('drivers');
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
      const parsed = await parseDataFileWithMetadata(file);
      if (!parsed.rows.length) throw new Error('No rows found in this file.');
      const nextSession = createDatasetSession({
        rows: parsed.rows,
        source: { kind: 'upload', name: file.name, fileName: file.name },
        contractReport: parsed.contractReport,
      });
      if (!nextSession.qualityReport.measureCandidates.length) throw new Error('No reliable numeric measure was detected. Open Data quality to review mixed types or missing values.');
      applyDataset(parsed.rows, undefined, undefined, {
        contractReport: parsed.contractReport,
        source: { kind: 'upload', name: file.name, fileName: file.name },
      });
      setWorkspace(nextSession.qualityReport.analysisReady ? 'guided' : 'quality');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }

  function exportInvestigation() {
    const snapshot = createInvestigationSnapshot({
      datasetSession,
      metricDefinition,
      actualKey,
      expectedKey: expectedKey || undefined,
      metricPolarity,
      aggregation,
      timeField: activeTimeField || undefined,
      timeGrain,
      timeWindow,
      fiscalYearStartMonth,
      materialityPercent,
      predicates,
      investigation: result,
      timeSeries,
      evidenceLedger,
    });
    downloadInvestigationSnapshot(snapshot);
  }

  function openAdvanced(dimension?: string) {
    if (dimension) {
      setSelectedDimension(dimension);
      setExplainView('drivers');
      setAdvancedStage('explain');
    } else {
      setAdvancedStage('scope');
    }
    setWorkspace('advanced');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function changeWorkspace(next: Workspace) {
    if (next === 'advanced' && workspace !== 'advanced') setAdvancedStage('scope');
    setWorkspace(next);
  }


  const guidedAiPanel = <ChatPanel
    rows={analysisRows}
    dimensions={dimensions}
    actualKey={actualKey}
    expectedKey={expectedKey || undefined}
    metricPolarity={metricPolarity}
    predicates={predicates}
    result={result}
    dataQuality={qualityReport}
    datasetSession={datasetSession}
    metricDefinition={metricDefinition}
    timeSeries={timeSeries}
    externalContext={externalContext}
    manualContext={manualContext}
    onExternalContext={setManualContext}
    onAction={handleChatAction}
    defaultSettingsOpen
    displayMode="presentation"
  />;

  return <OpenWebShell
    workspace={workspace}
    layoutMode={layoutMode}
    palette={palette}
    presentationMode={presentationWorkspace}
    datasetName={datasetSession.source.name}
    datasetSessionId={datasetSession.sessionId}
    rowCount={datasetSession.rows.length}
    metricName={metricDefinition.name}
    actualLabel={humanize(actualKey)}
    comparisonLabel={expectedKey ? humanize(expectedKey) : 'Rolling baseline'}
    periodLabel={windowLabel(timeWindow)}
    qualityScore={qualityReport.overallScore}
    analysisHealthy={qualityReport.analysisReady && (!timeSeries || timeSeries.modelHealth.status !== 'insufficient')}
    onWorkspace={changeWorkspace}
    onPalette={changePalette}
    onNewAnalysis={loadCleanDemo}
    onOpenPresentation={() => setPresentationOpen(true)}
    onUploadFile={loadFile}
  >
    <main data-theme={palette} data-workspace={workspace} data-layout={layoutMode} data-explorer-mode={explorerMode} data-dataset-session={datasetSession.sessionId}>
      {error && <div className="error">{error}</div>}
      {workspace === 'quality' && <section className="ow-workspace-intro">
        <div><span>Data quality</span><h1>Understand what can be trusted before the result is shared.</h1><p>Profile fields, review blockers, and see how data readiness changes the confidence of the analysis.</p></div>
        <div className="ow-workspace-intro-meta"><span>{qualityReport.overallScore.toFixed(0)}/100</span><span>{qualityReport.blockers} blockers</span><span>{qualityReport.warnings} warnings</span></div>
      </section>}

    {workspace === 'quality' && <section className="dataset-contract-banner" aria-label="Dataset and metric contract">
      <div><span>Dataset session</span><strong>{datasetSession.source.name}</strong><small>{datasetSession.rows.length.toLocaleString()} rows · hash {datasetSession.contentHash}</small></div>
      <div><span>Finance contract</span><strong>{datasetSession.contractReport.detected ? `v${datasetSession.contractReport.version} · ${datasetSession.contractReport.mode}` : 'Automatic profiling'}</strong><small>{datasetSession.contractReport.detected ? `${datasetSession.contractReport.normalizedDimensionFields.length} declared dimensions` : 'Use the standard contract for deterministic field mapping'}</small></div>
      <div><span>Metric semantics</span><strong>{metricDefinition.name}</strong><small>{metricDefinition.aggregation.replace('_', ' ')} · {metricDefinition.semanticCompleteness}/100 complete · {metricDefinition.certificationStatus}</small></div>
      <div><span>Driver attribution</span><strong>{result.attributionReconciles ? 'Reconciled' : 'Review required'}</strong><small>{result.aggregationMethod.replace('_', ' ')} · run {result.runId}</small></div>
    </section>}

    {workspace === 'quality' && <section className="controls top-controls" aria-label="Data quality controls">
      <div className="filter-scope"><span>Dataset</span><strong>{qualityReport.rowCount.toLocaleString()} rows · {qualityReport.columnCount.toLocaleString()} columns · {qualityReport.status}</strong></div>
      <button className="quiet-button" onClick={loadCleanDemo}>Reset clean demo</button>
      <button className="quiet-button" onClick={loadQualityDemo}>Load quality demo</button>
    </section>}

    {workspace === 'guided' ? <GuidedExperience
      numericFields={numeric.map((profile) => profile.name)}
      planningLens={planningLens}
      actualKey={actualKey}
      expectedKey={expectedKey}
      metricPolarity={metricPolarity}
      timeWindow={timeWindow}
      result={result}
      timeSeries={timeSeries}
      dataQuality={qualityReport}
      metricDefinition={metricDefinition}
      aiPanel={guidedAiPanel}
      onPlanningLens={setPlanningLens}
      onActualKey={(next) => { setActualKey(next); setPredicates([]); }}
      onExpectedKey={(next) => { setExpectedKey(next); setPredicates([]); }}
      onMetricPolarity={(next) => { setMetricPolarity(next); setPredicates([]); }}
      onTimeWindow={(next) => { setTimeWindow(next); setPredicates([]); }}
      onLoadSample={loadCleanDemo}
      onUploadFile={loadFile}
      onOpenAdvanced={openAdvanced}
      onOpenPublic={() => changeWorkspace('public-demo')}
      onOpenQuality={() => changeWorkspace('quality')}
      onOpenPresentation={() => setPresentationOpen(true)}
    /> : workspace === 'public-demo' ? <LivePublicFinanceDemo /> : workspace === 'quality' ? <DataQualityPanel rows={rows} report={qualityReport} onLoadCleanDemo={loadCleanDemo} onLoadQualityDemo={loadQualityDemo} /> : <>
      <AdvancedJourneyNav
        stage={advancedStage}
        predicates={predicates}
        periodLabel={windowLabel(timeWindow)}
        metricName={metricDefinition.name}
        onStage={setAdvancedStage}
      />

      <section className={`analysis-stage-page stage-${advancedStage}`} aria-label={`${advancedStage} stage`}>
        {advancedStage === 'scope' && <>
          <header className="analysis-stage-header">
            <div><span>01 · Scope</span><h1>Define the population once.</h1><p>Choose the metric, period, dimension, and category. Preview first; drill only when you intend to change every downstream calculation.</p></div>
            <button type="button" className="quiet-button" onClick={() => changeWorkspace('guided')}>Use Quick Answer</button>
          </header>

          <ExplorationControlBar
            mode={explorerMode}
            planningLens={planningLens}
            planningOptions={planningLenses.map((lens) => ({ id: lens.id, label: lens.label }))}
            numericFields={numeric.map((profile) => profile.name)}
            actualKey={actualKey}
            expectedKey={expectedKey}
            metricPolarity={metricPolarity}
            timeWindow={timeWindow}
            dimensions={result.dimensionScores.map((dimension) => dimension.dimension)}
            selectedDimension={selectedScore?.dimension ?? selectedDimension}
            categoryValues={selectedScore?.categories.map((category) => category.value) ?? []}
            selectedCategory={selectedCategoryValue}
            predicates={predicates}
            onMode={setExplorerMode}
            onPlanningLens={(next) => setPlanningLens(next as PlanningLens)}
            onActual={(next) => { setActualKey(next); setPredicates([]); }}
            onExpected={(next) => { setExpectedKey(next); setPredicates([]); }}
            onPolarity={(next) => { setMetricPolarity(next); setPredicates([]); }}
            onWindow={(next) => { setTimeWindow(next); setPredicates([]); }}
            onDimension={(next) => { setSelectedDimension(next); setSelectedCategoryValue(''); }}
            onCategory={setSelectedCategoryValue}
            onFocus={() => { setExplainView('drivers'); setAdvancedStage('explain'); }}
            onDrill={() => selectedScore && selectedCategoryValue && drill([{ dimension: selectedScore.dimension, value: selectedCategoryValue }])}
            onCombinations={() => { setExplainView('combinations'); setAdvancedStage('explain'); }}
            onHierarchy={() => { setExplainView('hierarchy'); setAdvancedStage('explain'); }}
            onReset={() => { setPredicates([]); setSelectedCategoryValue(''); }}
          />

          {(qualityReport.blockers > 0 || qualityReport.warnings > 0) && <button type="button" className={`analysis-quality-warning ${qualityReport.blockers ? 'critical' : ''}`} onClick={() => changeWorkspace('quality')}>
            <strong>Data quality: {qualityReport.overallScore.toFixed(0)}/100</strong>
            <span>{qualityReport.blockers ? `${qualityReport.blockers} blocker(s) can change or invalidate the analysis.` : `${qualityReport.warnings} warning(s) should be reviewed.`} Open Data Quality for details.</span>
          </button>}

          <section className="executive-metrics">
            <Metric label={currentPoint ? `${currentPoint.label} actual` : 'Selected-scope actual'} value={format(currentPoint?.actual ?? result.actual)} helper={`${humanize(actualKey)} · ${timeSeries?.coverage.validMeasureRows.toLocaleString() ?? result.validRowCount.toLocaleString()} valid rows`} />
            <Metric label={expectedKey ? 'Plan / expected' : 'Rolling typical'} value={format(currentPoint?.expected ?? result.expected)} helper={expectedKey ? humanize(expectedKey) : 'Rolling median baseline'} />
            <Metric label="Current-period impact" value={`${executiveImpact >= 0 ? '+' : ''}${format(executiveImpact)}`} helper={`${currentPoint?.impactDirection ?? result.impactDirection} · ${windowLabel(timeWindow)} scope`} tone={executiveTone} />
            <Metric label="Analysis health" value={timeSeries ? `${timeSeries.modelHealth.score.toFixed(0)}/100` : plainAnomaly(result.anomalyScore)} helper={timeSeries ? `${humanize(timeSeries.modelHealth.status)} · run ${timeSeries.runId}` : 'Standardized movement strength'} tone={timeSeries?.modelHealth.status === 'healthy' ? undefined : 'warn'} />
          </section>

          <details className="analysis-context-details">
            <summary>Data and calculation context</summary>
            <section className="dataset-contract-banner" aria-label="Dataset and metric contract">
              <div><span>Dataset session</span><strong>{datasetSession.source.name}</strong><small>{datasetSession.rows.length.toLocaleString()} rows · hash {datasetSession.contentHash}</small></div>
              <div><span>Finance contract</span><strong>{datasetSession.contractReport.detected ? `v${datasetSession.contractReport.version} · ${datasetSession.contractReport.mode}` : 'Automatic profiling'}</strong><small>{datasetSession.contractReport.detected ? `${datasetSession.contractReport.normalizedDimensionFields.length} declared dimensions` : 'Use Contract v1 for deterministic field mapping'}</small></div>
              <div><span>Metric semantics</span><strong>{metricDefinition.name}</strong><small>{metricDefinition.aggregation.replace('_', ' ')} · {metricDefinition.semanticCompleteness}/100 complete · {metricDefinition.certificationStatus}</small></div>
              <div><span>Driver attribution</span><strong>{result.attributionReconciles ? 'Reconciled' : 'Review required'}</strong><small>{result.aggregationMethod.replace('_', ' ')} · run {result.runId}</small></div>
            </section>
          </details>
          <AdvancedStageFooter stage={advancedStage} onStage={setAdvancedStage} />
        </>}

        {advancedStage === 'detect' && <>
          <header className="analysis-stage-header">
            <div><span>02 · Detect</span><h1>Find the material movement before looking for a cause.</h1><p>Review the trend, pace, materiality, and unusual periods using the same population defined in Scope.</p></div>
            <button type="button" className="quiet-button" onClick={() => setAdvancedStage('scope')}>Change scope</button>
          </header>

          <section className="executive-metrics compact-metrics">
            <Metric label="Actual" value={format(currentPoint?.actual ?? result.actual)} helper={currentPoint?.label ?? windowLabel(timeWindow)} />
            <Metric label="Plan / expected" value={format(currentPoint?.expected ?? result.expected)} helper={expectedKey ? humanize(expectedKey) : 'Rolling median baseline'} />
            <Metric label="Business impact" value={`${executiveImpact >= 0 ? '+' : ''}${format(executiveImpact)}`} helper={currentPoint?.impactDirection ?? result.impactDirection} tone={executiveTone} />
            <Metric label="Anomaly status" value={plainAnomaly(currentPoint?.anomalyScore ?? result.anomalyScore)} helper={`score ${(currentPoint?.anomalyScore ?? result.anomalyScore).toFixed(2)}`} tone={(currentPoint?.anomalyScore ?? result.anomalyScore) >= 2 ? 'warn' : undefined} />
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

          <section className={`story-banner ${selectedTone ?? ''}`}>
            <div className="story-kicker">DETECTION SUMMARY</div>
            <h2>The business impact is <span>{format(Math.abs(result.businessImpact))}</span> {result.impactDirection} across {windowLabel(timeWindow).toLowerCase()}.</h2>
            <p>{plainSummary(result.businessImpact, result.variance, result.variancePct, result.anomalyScore, metricPolarity)}</p>
            {result.warnings.length > 0 && <div className="analysis-warnings">{result.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}
          </section>
          <AdvancedStageFooter stage={advancedStage} onStage={setAdvancedStage} />
        </>}

        {advancedStage === 'explain' && <>
          <header className="analysis-stage-header">
            <div><span>03 · Explain</span><h1>Move from the variance to the strongest supported drivers.</h1><p>Start with single dimensions, then use combinations or hierarchy only when the first view does not answer the business question.</p></div>
            <button type="button" className="quiet-button" onClick={() => setAdvancedStage('scope')}>Change scope</button>
          </header>

          <nav className="analysis-view-tabs" aria-label="Driver explanation views">
            <button type="button" className={explainView === 'drivers' ? 'active' : ''} onClick={() => setExplainView('drivers')}><strong>Single drivers</strong><span>Rank dimensions and categories</span></button>
            <button type="button" className={explainView === 'combinations' ? 'active' : ''} onClick={() => setExplainView('combinations')}><strong>Combined patterns</strong><span>Values that matter together</span></button>
            <button type="button" className={explainView === 'hierarchy' ? 'active' : ''} onClick={() => setExplainView('hierarchy')}><strong>Hierarchy</strong><span>Parent-child branch exploration</span></button>
          </nav>

          {explainView === 'drivers' && <section className="analysis-explain-grid">
            <section className={`story-banner ${selectedTone ?? ''}`}>
              <div className="story-kicker">STRONGEST CLUE</div>
              <h2>{topDriver?.topCategory ? `${humanize(topDriver.dimension)} → ${topDriver.topCategory.value}` : 'No stable leading category'}</h2>
              <p>{topDriver?.topCategory ? `${format(Math.abs(topDriver.topCategory.businessImpact))} ${topDriver.topCategory.impactDirection} impact across ${(topDriver.topCategory.support * 100).toFixed(1)}% of valid rows.` : 'Review the metric, comparison, and data-quality thresholds before attributing the movement.'}</p>
            </section>
            <Panel title="What is contributing most?" subtitle={`Rankings are aligned to ${windowLabel(timeWindow).toLowerCase()} and re-check every remaining quality-approved factor after each drill.`}><div className="driver-split"><DimensionLandscape scores={result.dimensionScores} onSelect={(dimension: DimensionScore) => setSelectedDimension(dimension.dimension)} /><ContributionBars score={selectedScore} onDrill={(predicate) => { setSelectedDimension(predicate.dimension); setSelectedCategoryValue(predicate.value); }} /></div></Panel>
          </section>}

          {explainView === 'combinations' && <section id="combined-drivers" className="analysis-combination-grid">
            <Panel title="Combined drivers" subtitle="Use this only after reviewing single dimensions. Position shows concentration and impact; bubble size shows support."><CombinationExplorer interactions={result.interactions} onDrill={drill} /></Panel>
            <Panel title="Investigation trail" subtitle="The current path applied to every calculation in this workspace."><DrillTree predicates={predicates} /></Panel>
            <div className="breadcrumbs"><button onClick={() => setPredicates([])}>All business dimensions</button>{predicates.map((predicate, index) => <button key={`${predicate.dimension}-${predicate.value}`} onClick={() => setPredicates(predicates.slice(0, index + 1))}>→ {humanize(predicate.dimension)}: {predicate.value}</button>)}</div>
          </section>}

          {explainView === 'hierarchy' && <section id="hierarchy-data-explorer" className="analysis-hierarchy-view"><HierarchyDataExplorer rows={analysisRows} /></section>}
          <AdvancedStageFooter stage={advancedStage} onStage={setAdvancedStage} />
        </>}

        {advancedStage === 'validate' && <>
          <header className="analysis-stage-header">
            <div><span>04 · Validate</span><h1>Separate observed drivers from possible explanations.</h1><p>Confirm data readiness, compare business context, and treat news or external events as hypotheses until the evidence supports them.</p></div>
            <button type="button" className="quiet-button" onClick={() => changeWorkspace('quality')}>Open Data Quality</button>
          </header>

          <section className="analysis-validation-strip">
            <article><span>Data quality</span><strong>{qualityReport.overallScore.toFixed(0)}/100</strong><small>{qualityReport.blockers ? `${qualityReport.blockers} blocker(s)` : `${qualityReport.warnings} warning(s)`}</small></article>
            <article><span>Analysis health</span><strong>{timeSeries ? `${timeSeries.modelHealth.score.toFixed(0)}/100` : 'No time model'}</strong><small>{timeSeries?.modelHealth.status ?? 'Cross-sectional analysis'}</small></article>
            <article><span>External context</span><strong>{newsAnalysis ? `${newsAnalysis.activeCount + newsAnalysis.passiveCount} articles` : 'Not scanned'}</strong><small>{newsAnalysis ? 'Hypothesis evidence available' : 'Optional validation input'}</small></article>
          </section>

          <FpaInsightPanel rows={analysisRows} predicates={predicates} result={result} dataQuality={qualityReport} planningLens={planningLens} newsAnalysis={newsAnalysis} timeSeries={timeSeries} />

          <section className="analysis-validation-grid">
            <NewsIntelPanel onContextReady={setNewsContext} onAnalysisReady={setNewsAnalysis} />
            <ExternalFactorValidationPanel
              rows={rows}
              result={result}
              predicates={predicates}
              actualKey={actualKey}
              expectedKey={expectedKey || undefined}
              metricPolarity={metricPolarity}
              timeField={activeTimeField}
              defaultEventDate={timeSeries?.currentPeriod?.periodStart}
            />
          </section>
          <AdvancedStageFooter stage={advancedStage} onStage={setAdvancedStage} />
        </>}

        {advancedStage === 'share' && <>
          <header className="analysis-stage-header">
            <div><span>05 · Share</span><h1>Communicate the result without changing the evidence.</h1><p>Create a deterministic slide, use the finance guide for follow-up questions, or export the full investigation record.</p></div>
            <button type="button" className="quiet-button" onClick={() => changeWorkspace('guided')}>Return to Quick Answer</button>
          </header>

          <section className="analysis-share-actions">
            <button type="button" onClick={() => setPresentationOpen(true)}><span>Presentation Studio</span><strong>Create a 16:9 executive infographic</strong><small>No AI is required; numbers remain locked to this run.</small></button>
            <button type="button" onClick={exportInvestigation}><span>Evidence export</span><strong>Download the investigation snapshot</strong><small>Includes the dataset session, calculation run, and evidence ledger.</small></button>
            <button type="button" onClick={() => changeWorkspace('quality')}><span>Trust review</span><strong>Open Data Quality</strong><small>{qualityReport.overallScore.toFixed(0)}/100 readiness · {qualityReport.blockers} blockers.</small></button>
          </section>

          <section className="analysis-share-layout">
            <ChatPanel rows={analysisRows} dimensions={dimensions} actualKey={actualKey} expectedKey={expectedKey || undefined} metricPolarity={metricPolarity} predicates={predicates} result={result} dataQuality={qualityReport} datasetSession={datasetSession} metricDefinition={metricDefinition} timeSeries={timeSeries} externalContext={externalContext} manualContext={manualContext} onExternalContext={setManualContext} onAction={handleChatAction} />
            <aside className="analysis-share-summary">
              <span className="deck-kicker">MANAGEMENT SUMMARY</span>
              <h2>{format(Math.abs(result.businessImpact))} {result.impactDirection}</h2>
              <p>{plainSummary(result.businessImpact, result.variance, result.variancePct, result.anomalyScore, metricPolarity)}</p>
              {topDriver?.topCategory && <div><span>Leading driver</span><strong>{humanize(topDriver.dimension)} → {topDriver.topCategory.value}</strong><small>{format(Math.abs(topDriver.topCategory.businessImpact))} {topDriver.topCategory.impactDirection} · {(topDriver.topCategory.support * 100).toFixed(1)}% support</small></div>}
              <button type="button" onClick={() => setPresentationOpen(true)}>Create the slide</button>
            </aside>
          </section>

          <details className="analyst-details"><summary>Analyst evidence and factor audit</summary><section className="technical-strip"><span><strong>{result.validRowCount.toLocaleString()}</strong> valid measure rows</span><span><strong>{result.excludedMeasureRows.toLocaleString()}</strong> excluded measure rows</span><span><strong>{result.dimensionsScanned}</strong> business factors</span><span><strong>{result.anomalyScore.toFixed(2)}</strong> standardized deviation</span><span><strong>{metricPolarity === 'higher_is_better' ? 'Higher' : 'Lower'}</strong> is better</span><span><strong>{windowLabel(timeWindow)}</strong> selected window</span><span><strong>{result.aggregationMethod.replace('_', ' ')}</strong> attribution</span><span><strong>{result.runId}</strong> calculation run</span></section><section className="table-panel"><h2>Factor audit</h2><p>Detailed evidence for every business factor reviewed after excluding time fields and quality-ineligible columns.</p><div className="table-wrap"><table><thead><tr><th>#</th><th>Factor</th><th>Score</th><th>Leading group</th><th>Business impact</th><th>Support</th><th>Impact</th></tr></thead><tbody>{result.dimensionScores.map((dimension, index) => <tr key={dimension.dimension} onClick={() => { setSelectedDimension(dimension.dimension); setExplainView('drivers'); setAdvancedStage('explain'); }}><td>{index + 1}</td><td>{humanize(dimension.dimension)}</td><td>{dimension.score.toFixed(1)}</td><td>{dimension.topCategory?.value}</td><td className={Number(dimension.topCategory?.businessImpact) < 0 ? 'bad' : 'good'}>{format(dimension.topCategory?.businessImpact ?? 0)}</td><td>{dimension.topCategory ? `${(dimension.topCategory.support * 100).toFixed(1)}%` : '—'}</td><td>{(dimension.impact * 100).toFixed(1)}%</td></tr>)}</tbody></table></div></section></details>
          <AdvancedStageFooter stage={advancedStage} onStage={setAdvancedStage} />
        </>}
      </section>
    </>}
    <PresentationStudio
      open={presentationOpen}
      onClose={() => setPresentationOpen(false)}
      result={result}
      timeSeries={timeSeries}
      dataQuality={qualityReport}
      metricDefinition={metricDefinition}
      datasetSession={datasetSession}
      predicates={predicates}
      planningLens={planningLens}
      actualKey={actualKey}
      expectedKey={expectedKey || undefined}
    />
    </main>
  </OpenWebShell>;
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
