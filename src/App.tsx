import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createSampleData } from './data/sampleData';
import { createQualityDemoData } from './data/qualityDemo';
import { investigate } from './lib/anomaly';
import { analyzeDataQuality } from './lib/dataQuality';
import { parseDataFile } from './lib/io';
import { profileFields } from './lib/profile';
import { ContributionBars, DimensionLandscape, DrillTree, InteractionList } from './components/Visuals';
import { ChatPanel } from './components/ChatPanel';
import { DataQualityPanel } from './components/DataQualityPanel';
import { NewsIntelPanel } from './components/NewsIntelPanel';
import { ThemePicker } from './components/ThemePicker';
import type { PaletteId } from './components/ThemePicker';
import type { ChatAction } from './lib/chatEngine';
import type { DataRow, DimensionScore, Predicate } from './types';

const format = (value: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
const percent = (value: number | null) => value == null ? '—' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
const humanize = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

type Workspace = 'insights' | 'quality';

export default function App() {
  const [rows, setRows] = useState<DataRow[]>(() => createSampleData());
  const [workspace, setWorkspace] = useState<Workspace>('insights');
  const [actualKey, setActualKey] = useState('actual');
  const [expectedKey, setExpectedKey] = useState('target');
  const [predicates, setPredicates] = useState<Predicate[]>([]);
  const [selectedDimension, setSelectedDimension] = useState<string>('region');
  const [manualContext, setManualContext] = useState('');
  const [newsContext, setNewsContext] = useState('');
  const [palette, setPalette] = useState<PaletteId>(() => {
    const saved = localStorage.getItem('anomaly-palette');
    return saved === 'slate' || saved === 'warm' || saved === 'light' ? saved : 'midnight';
  });
  const [error, setError] = useState('');

  const profiles = useMemo(() => profileFields(rows), [rows]);
  const qualityReport = useMemo(() => analyzeDataQuality(rows), [rows]);
  const qualityByName = useMemo(() => new Map(qualityReport.columns.map((column) => [column.name, column])), [qualityReport.columns]);
  const numeric = profiles.filter((profile) => profile.kind === 'numeric' && qualityByName.get(profile.name)?.analysisRole === 'measure');
  const availableDimensions = profiles.filter((profile) => qualityByName.get(profile.name)?.analysisRole === 'dimension');
  const dimensions = availableDimensions.map((profile) => profile.name);
  const dimensionKey = dimensions.join('|');
  const externalContext = [manualContext, newsContext].filter(Boolean).join('\n\n');
  const result = useMemo(
    () => investigate(rows, dimensions, actualKey, expectedKey || undefined, predicates),
    [rows, dimensionKey, actualKey, expectedKey, predicates],
  );
  const selectedScore = result.dimensionScores.find((dimension) => dimension.dimension === selectedDimension) ?? result.dimensionScores[0] ?? null;
  const topDriver = result.dimensionScores[0] ?? null;
  const direction = result.variance < 0 ? 'below' : 'above';
  const tone = result.variance < 0 ? 'bad' : 'good';

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
    setRows(nextRows);
    setActualKey(candidateActual);
    setExpectedKey(candidateExpected);
    setPredicates([]);
    setSelectedDimension(nextQuality.dimensionCandidates[0] ?? '');
    setManualContext('');
    setNewsContext('');
  }

  function loadCleanDemo() {
    applyDataset(createSampleData(), 'actual', 'target');
  }

  function loadQualityDemo() {
    applyDataset(createQualityDemoData(), 'actual', 'target');
    setWorkspace('quality');
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
      setSelectedDimension(qualityReport.dimensionCandidates[0] ?? '');
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
      setWorkspace('quality');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }

  return <main data-theme={palette}>
    <header className="hero compact-hero">
      <div><span className="eyebrow">PERFORMANCE EXPLORER</span><h1>Understand the result. Trust the data.</h1><p>Explore data quality first, then investigate the business factors and external context behind unusual performance.</p></div>
      <div className="header-tools"><ThemePicker value={palette} onChange={changePalette} /><label className="upload">Use my data<input type="file" accept=".csv,.json" onChange={(event) => loadFile(event.target.files?.[0])} /></label></div>
    </header>

    {error && <div className="error">{error}</div>}

    <nav className="workspace-tabs" aria-label="Workspace">
      <button type="button" className={workspace === 'insights' ? 'active' : ''} onClick={() => setWorkspace('insights')}>Insights</button>
      <button type="button" className={workspace === 'quality' ? 'active' : ''} onClick={() => setWorkspace('quality')}>Data quality <span>{qualityReport.overallScore.toFixed(0)}</span></button>
    </nav>

    <section className="controls top-controls" aria-label="Analysis filters">
      {workspace === 'insights' && <>
        <label>Measure<select value={actualKey} onChange={(event) => { setActualKey(event.target.value); setPredicates([]); }}>{numeric.map((profile) => <option key={profile.name} value={profile.name}>{humanize(profile.name)}</option>)}</select></label>
        <label>Compare with<select value={expectedKey} onChange={(event) => { setExpectedKey(event.target.value); setPredicates([]); }}><option value="">Robust typical value</option>{numeric.filter((profile) => profile.name !== actualKey).map((profile) => <option key={profile.name} value={profile.name}>{humanize(profile.name)}</option>)}</select></label>
        <div className="filter-scope"><span>Scope</span><strong>{predicates.length ? predicates.map((predicate) => `${humanize(predicate.dimension)}: ${predicate.value}`).join(' • ') : 'All data'}</strong></div>
        {predicates.length > 0 && <button className="quiet-button" onClick={() => setPredicates([])}>Clear</button>}
      </>}
      {workspace === 'quality' && <div className="filter-scope"><span>Dataset</span><strong>{qualityReport.rowCount.toLocaleString()} rows · {qualityReport.columnCount.toLocaleString()} columns · {qualityReport.status}</strong></div>}
      <button className="quiet-button" onClick={loadCleanDemo}>Reset clean demo</button>
      <button className="quiet-button" onClick={loadQualityDemo}>Load quality demo</button>
    </section>

    {workspace === 'quality' ? <DataQualityPanel rows={rows} report={qualityReport} onLoadCleanDemo={loadCleanDemo} onLoadQualityDemo={loadQualityDemo} /> : <>
      {(qualityReport.blockers > 0 || qualityReport.warnings > 0) && <button type="button" className={`analysis-quality-warning ${qualityReport.blockers ? 'critical' : ''}`} onClick={() => setWorkspace('quality')}>
        <strong>Data quality: {qualityReport.overallScore.toFixed(0)}/100</strong>
        <span>{qualityReport.blockers ? `${qualityReport.blockers} blocker(s) can change or invalidate the analysis.` : `${qualityReport.warnings} warning(s) should be reviewed.`} Open the Data Quality Explorer.</span>
      </button>}

      <section className="executive-metrics">
        <Metric label="Result" value={format(result.actual)} helper={`${humanize(actualKey)} · ${result.validRowCount.toLocaleString()} valid rows`} />
        <Metric label={expectedKey ? 'Expected' : 'Typical'} value={format(result.expected)} helper={expectedKey ? humanize(expectedKey) : 'Robust median baseline'} />
        <Metric label="Difference" value={`${result.variance >= 0 ? '+' : ''}${format(result.variance)}`} helper={`${percent(result.variancePct)} vs expected`} tone={tone} />
        <Metric label="Signal" value={plainAnomaly(result.anomalyScore)} helper="Standardized movement strength" tone={result.anomalyScore >= 2 ? 'warn' : undefined} />
      </section>

      <section className="guided-layout">
        <div className="guided-main">
          <section className={`story-banner ${tone}`}><div className="story-kicker">BOTTOM LINE</div><h2>The result is <span>{format(Math.abs(result.variance))}</span> {direction} expectation.</h2><p>{plainSummary(result.variance, result.variancePct, result.anomalyScore)}</p>{topDriver?.topCategory && <div className="next-clue"><span>Strongest clue</span><strong>{humanize(topDriver.dimension)} → {topDriver.topCategory.value}</strong><button onClick={() => setSelectedDimension(topDriver.dimension)}>Explore</button></div>}{result.warnings.length > 0 && <div className="analysis-warnings">{result.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}</section>
          <Panel title="What is contributing most?" subtitle="Select a factor, then a group. Every drill automatically re-checks the other quality-approved factors."><div className="driver-split"><DimensionLandscape scores={result.dimensionScores} onSelect={(dimension: DimensionScore) => setSelectedDimension(dimension.dimension)} /><ContributionBars score={selectedScore} onDrill={(predicate) => drill([predicate])} /></div></Panel>
        </div>
        <div className="insight-sidebar">
          <NewsIntelPanel onContextReady={setNewsContext} />
          <ChatPanel rows={rows} dimensions={dimensions} actualKey={actualKey} expectedKey={expectedKey || undefined} predicates={predicates} result={result} dataQuality={qualityReport} externalContext={externalContext} manualContext={manualContext} onExternalContext={setManualContext} onAction={handleChatAction} />
        </div>
      </section>

      <details className="more-analysis"><summary>More analysis</summary><div className="grid two"><Panel title="Combined patterns" subtitle="Groups where several characteristics appear together."><InteractionList interactions={result.interactions} onDrill={drill} /></Panel><Panel title="Investigation trail" subtitle="The path you have taken so far."><DrillTree predicates={predicates} /></Panel></div><div className="breadcrumbs"><button onClick={() => setPredicates([])}>All data</button>{predicates.map((predicate, index) => <button key={`${predicate.dimension}-${predicate.value}`} onClick={() => setPredicates(predicates.slice(0, index + 1))}>→ {humanize(predicate.dimension)}: {predicate.value}</button>)}</div></details>

      <details className="analyst-details"><summary>Analyst evidence</summary><section className="technical-strip"><span><strong>{result.validRowCount.toLocaleString()}</strong> valid measure rows</span><span><strong>{result.excludedMeasureRows.toLocaleString()}</strong> excluded measure rows</span><span><strong>{result.dimensionsScanned}</strong> quality-approved factors</span><span><strong>{result.anomalyScore.toFixed(2)}</strong> standardized deviation</span></section><section className="table-panel"><h2>Factor audit</h2><p>Detailed evidence for every factor reviewed.</p><div className="table-wrap"><table><thead><tr><th>#</th><th>Factor</th><th>Score</th><th>Leading group</th><th>Difference</th><th>Support</th><th>Impact</th></tr></thead><tbody>{result.dimensionScores.map((dimension, index) => <tr key={dimension.dimension} onClick={() => setSelectedDimension(dimension.dimension)}><td>{index + 1}</td><td>{humanize(dimension.dimension)}</td><td>{dimension.score.toFixed(1)}</td><td>{dimension.topCategory?.value}</td><td className={Number(dimension.topCategory?.variance) < 0 ? 'bad' : 'good'}>{format(dimension.topCategory?.variance ?? 0)}</td><td>{dimension.topCategory ? `${(dimension.topCategory.support * 100).toFixed(1)}%` : '—'}</td><td>{(dimension.impact * 100).toFixed(1)}%</td></tr>)}</tbody></table></div></section></details>
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

function plainSummary(variance: number, variancePct: number | null, anomalyScore: number) {
  const direction = variance < 0 ? 'under' : 'over';
  const percentageText = variancePct == null ? '' : ` (${Math.abs(variancePct * 100).toFixed(1)}% ${direction})`;
  const unusual = anomalyScore >= 2 ? ' The movement stands out from normal variation.' : ' The movement is within a range that can occur through normal variation.';
  return `Performance is ${direction} by ${format(Math.abs(variance))}${percentageText}.${unusual}`;
}
