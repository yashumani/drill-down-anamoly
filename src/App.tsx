import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createSampleData } from './data/sampleData';
import { investigate } from './lib/anomaly';
import { parseDataFile } from './lib/io';
import { profileFields } from './lib/profile';
import { ContributionBars, DimensionLandscape, DrillTree, InteractionList } from './components/Visuals';
import { ChatPanel } from './components/ChatPanel';
import { ThemePicker } from './components/ThemePicker';
import type { PaletteId } from './components/ThemePicker';
import type { ChatAction } from './lib/chatEngine';
import type { DataRow, DimensionScore, Predicate } from './types';

const format = (n: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
const percent = (n: number | null) => n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
const humanize = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function App() {
  const [rows, setRows] = useState<DataRow[]>(() => createSampleData());
  const profiles = useMemo(() => profileFields(rows), [rows]);
  const numeric = profiles.filter((p) => p.kind === 'numeric');
  const availableDimensions = profiles.filter((p) => ['categorical', 'date', 'boolean'].includes(p.kind) && p.distinctCount > 1 && p.distinctCount <= Math.max(80, rows.length * 0.2));
  const [actualKey, setActualKey] = useState('actual');
  const [expectedKey, setExpectedKey] = useState('target');
  const [predicates, setPredicates] = useState<Predicate[]>([]);
  const [selectedDimension, setSelectedDimension] = useState<string>('region');
  const [externalContext, setExternalContext] = useState('');
  const [palette, setPalette] = useState<PaletteId>(() => (localStorage.getItem('anomaly-palette') as PaletteId) || 'midnight');
  const [error, setError] = useState('');

  const dimensions = availableDimensions.map((p) => p.name);
  const dimensionKey = dimensions.join('|');
  const result = useMemo(() => investigate(rows, dimensions, actualKey, expectedKey || undefined, predicates), [rows, dimensionKey, actualKey, expectedKey, predicates]);
  const selectedScore = result.dimensionScores.find((d) => d.dimension === selectedDimension) ?? result.dimensionScores[0] ?? null;
  const topDriver = result.dimensionScores[0] ?? null;
  const direction = result.variance < 0 ? 'below' : 'above';
  const tone = result.variance < 0 ? 'bad' : 'good';

  const changePalette = (next: PaletteId) => { setPalette(next); localStorage.setItem('anomaly-palette', next); };
  const drill = (next: Predicate[]) => {
    const merged = [...predicates];
    for (const p of next) { const idx = merged.findIndex((x) => x.dimension === p.dimension); if (idx >= 0) merged[idx] = p; else merged.push(p); }
    setPredicates(merged); setSelectedDimension('');
  };
  const handleChatAction = (action: ChatAction) => {
    if (action.type === 'drill' && action.predicates?.length) drill(action.predicates);
    if (action.type === 'reset') { setPredicates([]); setSelectedDimension('region'); }
    if (action.type === 'back') setPredicates((prev) => prev.slice(0, -1));
    if (action.type === 'select-dimension' && action.dimension) setSelectedDimension(action.dimension);
  };

  async function loadFile(file: File | undefined) {
    if (!file) return;
    try {
      setError(''); const parsed = await parseDataFile(file); if (!parsed.length) throw new Error('No rows found in this file.');
      const p = profileFields(parsed); const nums = p.filter((x) => x.kind === 'numeric'); if (!nums.length) throw new Error('This file needs at least one numeric measure to analyze.');
      setRows(parsed); setActualKey(nums[0].name); setExpectedKey(nums[1]?.name ?? ''); setPredicates([]); setSelectedDimension('');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return <main data-theme={palette}>
    <header className="hero compact-hero">
      <div><span className="eyebrow">PERFORMANCE EXPLORER</span><h1>Understand the result. Find what matters.</h1><p>Start with the business outcome, then drill only when you need more detail.</p></div>
      <div className="header-tools"><ThemePicker value={palette} onChange={changePalette} /><label className="upload">Use my data<input type="file" accept=".csv,.json" onChange={(e) => loadFile(e.target.files?.[0])} /></label></div>
    </header>
    {error && <div className="error">{error}</div>}

    <section className="controls top-controls" aria-label="Analysis filters">
      <label>Measure<select value={actualKey} onChange={(e) => { setActualKey(e.target.value); setPredicates([]); }}>{numeric.map((p) => <option key={p.name}>{humanize(p.name)}</option>)}</select></label>
      <label>Compare with<select value={expectedKey} onChange={(e) => { setExpectedKey(e.target.value); setPredicates([]); }}><option value="">Typical value</option>{numeric.filter((p) => p.name !== actualKey).map((p) => <option key={p.name}>{humanize(p.name)}</option>)}</select></label>
      <div className="filter-scope"><span>Scope</span><strong>{predicates.length ? predicates.map((p) => `${humanize(p.dimension)}: ${p.value}`).join(' • ') : 'All data'}</strong></div>
      {predicates.length > 0 && <button className="quiet-button" onClick={() => setPredicates([])}>Clear</button>}
      <button className="quiet-button" onClick={() => { setRows(createSampleData()); setActualKey('actual'); setExpectedKey('target'); setPredicates([]); setSelectedDimension('region'); setExternalContext(''); }}>Reset demo</button>
    </section>

    <section className="executive-metrics">
      <Metric label="Result" value={format(result.actual)} helper={humanize(actualKey)} />
      <Metric label={expectedKey ? 'Expected' : 'Typical'} value={format(result.expected)} helper={expectedKey ? humanize(expectedKey) : 'Current baseline'} />
      <Metric label="Difference" value={`${result.variance >= 0 ? '+' : ''}${format(result.variance)}`} helper={`${percent(result.variancePct)} vs expected`} tone={tone} />
      <Metric label="Signal" value={plainAnomaly(result.anomalyScore)} helper="Strength of unusual movement" tone={result.anomalyScore >= 2 ? 'warn' : undefined} />
    </section>

    <section className="guided-layout">
      <div className="guided-main">
        <section className={`story-banner ${tone}`}><div className="story-kicker">BOTTOM LINE</div><h2>The result is <span>{format(Math.abs(result.variance))}</span> {direction} expectation.</h2><p>{plainSummary(result.variance, result.variancePct, result.anomalyScore)}</p>{topDriver?.topCategory && <div className="next-clue"><span>Strongest clue</span><strong>{humanize(topDriver.dimension)} → {topDriver.topCategory.value}</strong><button onClick={() => setSelectedDimension(topDriver.dimension)}>Explore</button></div>}</section>
        <Panel title="What is contributing most?" subtitle="Select a factor, then a group. Every drill automatically re-checks the other available factors."><div className="driver-split"><DimensionLandscape scores={result.dimensionScores} onSelect={(d: DimensionScore) => setSelectedDimension(d.dimension)} /><ContributionBars score={selectedScore} onDrill={(p) => drill([p])} /></div></Panel>
      </div>
      <ChatPanel rows={rows} dimensions={dimensions} actualKey={actualKey} expectedKey={expectedKey || undefined} predicates={predicates} result={result} externalContext={externalContext} onExternalContext={setExternalContext} onAction={handleChatAction} />
    </section>

    <details className="more-analysis"><summary>More analysis</summary><div className="grid two"><Panel title="Combined patterns" subtitle="Groups where several characteristics appear together."><InteractionList interactions={result.interactions} onDrill={drill} /></Panel><Panel title="Investigation trail" subtitle="The path you have taken so far."><DrillTree predicates={predicates} /></Panel></div><div className="breadcrumbs"><button onClick={() => setPredicates([])}>All data</button>{predicates.map((p, i) => <button key={`${p.dimension}-${p.value}`} onClick={() => setPredicates(predicates.slice(0, i + 1))}>→ {humanize(p.dimension)}: {p.value}</button>)}</div></details>

    <details className="analyst-details"><summary>Analyst evidence</summary><section className="technical-strip"><span><strong>{result.rowCount.toLocaleString()}</strong> records</span><span><strong>{result.dimensionsScanned}</strong> factors reviewed</span><span><strong>{result.anomalyScore.toFixed(2)}σ</strong> deviation</span></section><section className="table-panel"><h2>Factor audit</h2><p>Detailed evidence for every factor reviewed.</p><div className="table-wrap"><table><thead><tr><th>#</th><th>Factor</th><th>Score</th><th>Leading group</th><th>Difference</th><th>Groups</th><th>Impact</th></tr></thead><tbody>{result.dimensionScores.map((d, i) => <tr key={d.dimension} onClick={() => setSelectedDimension(d.dimension)}><td>{i + 1}</td><td>{humanize(d.dimension)}</td><td>{d.score.toFixed(1)}</td><td>{d.topCategory?.value}</td><td className={Number(d.topCategory?.variance) < 0 ? 'bad' : 'good'}>{format(d.topCategory?.variance ?? 0)}</td><td>{d.distinctCount}</td><td>{(d.impact * 100).toFixed(1)}%</td></tr>)}</tbody></table></div></section></details>
  </main>;
}

function Metric({ label, value, helper, tone }: { label: string; value: string; helper?: string; tone?: string }) { return <div className="metric friendly-metric"><span>{label}</span><strong className={tone}>{value}</strong>{helper && <small>{helper}</small>}</div>; }
function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) { return <section className="panel"><div className="panel-head"><h2>{title}</h2><p>{subtitle}</p></div>{children}</section>; }
function plainAnomaly(score: number) { if (score >= 3) return 'Very unusual'; if (score >= 2) return 'Unusual'; if (score >= 1) return 'Worth watching'; return 'Normal range'; }
function plainSummary(variance: number, variancePct: number | null, anomalyScore: number) { const direction = variance < 0 ? 'under' : 'over'; const pctText = variancePct == null ? '' : ` (${Math.abs(variancePct).toFixed(1)}% ${direction})`; const unusual = anomalyScore >= 2 ? ' The movement stands out from normal variation.' : ' The movement is within a range that can occur through normal variation.'; return `Performance is ${direction} by ${format(Math.abs(variance))}${pctText}.${unusual}`; }
