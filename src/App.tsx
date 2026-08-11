import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createSampleData } from './data/sampleData';
import { investigate } from './lib/anomaly';
import { parseDataFile } from './lib/io';
import { profileFields } from './lib/profile';
import { ContributionBars, DimensionLandscape, DrillTree, InteractionList } from './components/Visuals';
import type { DataRow, DimensionScore, Predicate } from './types';

const format = (n: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
const percent = (n: number | null) => n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
const humanize = (value: string) => value
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (c) => c.toUpperCase());

export default function App() {
  const [rows, setRows] = useState<DataRow[]>(() => createSampleData());
  const profiles = useMemo(() => profileFields(rows), [rows]);
  const numeric = profiles.filter((p) => p.kind === 'numeric');
  const availableDimensions = profiles.filter((p) => ['categorical', 'date', 'boolean'].includes(p.kind) && p.distinctCount > 1 && p.distinctCount <= Math.max(80, rows.length * 0.2));
  const [actualKey, setActualKey] = useState('actual');
  const [expectedKey, setExpectedKey] = useState('target');
  const [predicates, setPredicates] = useState<Predicate[]>([]);
  const [selectedDimension, setSelectedDimension] = useState<string>('region');
  const [error, setError] = useState('');

  const dimensions = availableDimensions.map((p) => p.name);
  const dimensionKey = dimensions.join('|');
  const result = useMemo(() => investigate(rows, dimensions, actualKey, expectedKey || undefined, predicates), [rows, dimensionKey, actualKey, expectedKey, predicates]);
  const selectedScore = result.dimensionScores.find((d) => d.dimension === selectedDimension) ?? result.dimensionScores[0] ?? null;
  const topDriver = result.dimensionScores[0] ?? null;
  const topInteraction = result.interactions[0] ?? null;
  const direction = result.variance < 0 ? 'below' : 'above';
  const tone = result.variance < 0 ? 'bad' : 'good';

  const drill = (next: Predicate[]) => {
    const merged = [...predicates];
    for (const p of next) {
      const idx = merged.findIndex((x) => x.dimension === p.dimension);
      if (idx >= 0) merged[idx] = p; else merged.push(p);
    }
    setPredicates(merged);
    setSelectedDimension('');
  };

  async function loadFile(file: File | undefined) {
    if (!file) return;
    try {
      setError('');
      const parsed = await parseDataFile(file);
      if (!parsed.length) throw new Error('No rows found in this file.');
      const p = profileFields(parsed);
      const nums = p.filter((x) => x.kind === 'numeric');
      if (!nums.length) throw new Error('This file needs at least one numeric measure to analyze.');
      setRows(parsed);
      setActualKey(nums[0].name);
      setExpectedKey(nums[1]?.name ?? '');
      setPredicates([]);
      setSelectedDimension('');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return <main>
    <header className="hero friendly-hero">
      <div>
        <span className="eyebrow">PERFORMANCE EXPLORER</span>
        <h1>What is driving the result?</h1>
        <p>A guided view of what changed, where the biggest differences are coming from, and what to explore next. You do not need to know the dataset structure.</p>
      </div>
      <label className="upload">Use my own data<input type="file" accept=".csv,.json" onChange={(e) => loadFile(e.target.files?.[0])} /></label>
    </header>

    {error && <div className="error">{error}</div>}

    <section className="controls top-controls" aria-label="Analysis filters">
      <label>What result should be analyzed?
        <select value={actualKey} onChange={(e) => { setActualKey(e.target.value); setPredicates([]); }}>
          {numeric.map((p) => <option key={p.name}>{p.name}</option>)}
        </select>
      </label>
      <label>What should it be compared with?
        <select value={expectedKey} onChange={(e) => { setExpectedKey(e.target.value); setPredicates([]); }}>
          <option value="">Typical value in this group</option>
          {numeric.filter((p) => p.name !== actualKey).map((p) => <option key={p.name}>{p.name}</option>)}
        </select>
      </label>
      <button onClick={() => { setRows(createSampleData()); setActualKey('actual'); setExpectedKey('target'); setPredicates([]); setSelectedDimension('region'); }}>Reset sample data</button>
      {predicates.length > 0 && <button className="quiet-button" onClick={() => setPredicates([])}>Clear drill filters</button>}
    </section>

    <section className="scope-bar">
      <div>
        <span className="scope-label">You are looking at</span>
        <strong>{predicates.length ? predicates.map((p) => `${humanize(p.dimension)}: ${p.value}`).join('  •  ') : 'All available data'}</strong>
      </div>
      {predicates.length > 0 && <button className="quiet-button" onClick={() => setPredicates([])}>Clear filters</button>}
    </section>

    <section className="executive-metrics">
      <Metric label="Result" value={format(result.actual)} helper={`Measured as ${humanize(actualKey)}`} />
      <Metric label={expectedKey ? 'Expected' : 'Typical'} value={format(result.expected)} helper={expectedKey ? `Compared with ${humanize(expectedKey)}` : 'Compared with the current cohort baseline'} />
      <Metric label="Difference" value={`${result.variance >= 0 ? '+' : ''}${format(result.variance)}`} helper={`${percent(result.variancePct)} vs expected`} tone={tone} />
      <Metric label="How unusual?" value={plainAnomaly(result.anomalyScore)} helper="Compared with normal variation" tone={result.anomalyScore >= 2 ? 'warn' : undefined} />
    </section>

    <section className={`story-banner ${tone}`}>
      <div className="story-kicker">WHAT HAPPENED</div>
      <h2>The result is <span>{format(Math.abs(result.variance))}</span> {direction} expectation.</h2>
      <p>{plainSummary(result.variance, result.variancePct, result.anomalyScore)}</p>
    </section>

    <section className="story-grid">
      <StoryCard
        step="1"
        title="Biggest area to investigate"
        primary={topDriver ? humanize(topDriver.dimension) : 'No clear driver'}
        detail={topDriver?.topCategory ? `${topDriver.topCategory.value} stands out most within ${humanize(topDriver.dimension)} and accounts for ${format(Math.abs(topDriver.topCategory.variance))} of the difference.` : 'No single category stands out strongly in this view.'}
        action={topDriver ? <button onClick={() => setSelectedDimension(topDriver.dimension)}>Show me why</button> : null}
      />
      <StoryCard
        step="2"
        title="Most concentrated pattern"
        primary={topInteraction ? topInteraction.predicates.map((p) => p.value).join(' + ') : 'No strong combination found'}
        detail={topInteraction ? `${topInteraction.count.toLocaleString()} records share this pattern, with a combined difference of ${format(Math.abs(topInteraction.variance))}.` : 'The difference appears more broadly distributed rather than concentrated in one combination.'}
        action={topInteraction ? <button onClick={() => drill(topInteraction.predicates)}>Explore this group</button> : null}
      />
      <StoryCard
        step="3"
        title="Recommended next step"
        primary={topDriver?.topCategory ? `Look inside ${topDriver.topCategory.value}` : 'Compare another segment'}
        detail={topDriver?.topCategory ? `Narrowing to this group will re-check every other available factor automatically and show what becomes important next.` : 'Select a business factor below to continue the investigation.'}
        action={topDriver?.topCategory ? <button onClick={() => drill([{ dimension: topDriver.dimension, value: topDriver.topCategory!.value }])}>Drill into this group</button> : null}
      />
    </section>

    <section className="section-heading">
      <div><span className="section-number">01</span><div><h2>Where is the difference coming from?</h2><p>Business factors are ranked automatically. Longer bars mean a factor is more useful for explaining the current result.</p></div></div>
    </section>
    <section className="grid two wide-left friendly-grid">
      <Panel title="Most useful factors" subtitle="Click any factor to see which values inside it are helping or hurting the result."><DimensionLandscape scores={result.dimensionScores} onSelect={(d: DimensionScore) => setSelectedDimension(d.dimension)} /></Panel>
      <Panel title={selectedScore ? `Inside ${humanize(selectedScore.dimension)}` : 'Choose a factor'} subtitle="Bars on either side of zero show which groups are above or below expectation."><ContributionBars score={selectedScore} onDrill={(p) => drill([p])} /></Panel>
    </section>

    <section className="section-heading">
      <div><span className="section-number">02</span><div><h2>Are several factors combining together?</h2><p>These are groups where multiple characteristics appear together and create a stronger pattern than one factor alone.</p></div></div>
    </section>
    <section className="grid two friendly-grid">
      <Panel title="Important combinations" subtitle="Select any group to focus the whole page on that population."><InteractionList interactions={result.interactions} onDrill={drill} /></Panel>
      <Panel title="Your investigation trail" subtitle="This simply shows the groups you have chosen so far. You can always return to a broader view."><DrillTree predicates={predicates} /></Panel>
    </section>

    <section className="breadcrumb-panel">
      <div className="breadcrumb-copy"><strong>Current view</strong><span>Click any earlier step to go back.</span></div>
      <div className="breadcrumbs"><button onClick={() => setPredicates([])}>All data</button>{predicates.map((p, i) => <button key={`${p.dimension}-${p.value}`} onClick={() => setPredicates(predicates.slice(0, i + 1))}>→ {humanize(p.dimension)}: {p.value}</button>)}</div>
    </section>

    <details className="analyst-details">
      <summary>Analyst details</summary>
      <p className="details-intro">Use this section to validate how the story was generated and inspect the underlying factor scoring.</p>

      <section className="technical-strip">
        <span><strong>{result.rowCount.toLocaleString()}</strong> records included</span>
        <span><strong>{result.dimensionsScanned}</strong> factors reviewed</span>
        <span><strong>{result.anomalyScore.toFixed(2)}σ</strong> statistical deviation</span>
      </section>

      <section className="table-panel">
        <h2>Factor audit</h2><p>Detailed evidence for every factor reviewed by the analysis.</p>
        <div className="table-wrap"><table><thead><tr><th>#</th><th>Business factor</th><th>Explanation score</th><th>Leading group</th><th>Difference</th><th>Groups found</th><th>Impact</th><th>Distinctiveness</th></tr></thead><tbody>{result.dimensionScores.map((d, i) => <tr key={d.dimension} onClick={() => setSelectedDimension(d.dimension)}><td>{i + 1}</td><td>{humanize(d.dimension)}</td><td>{d.score.toFixed(1)}</td><td>{d.topCategory?.value}</td><td className={Number(d.topCategory?.variance) < 0 ? 'bad' : 'good'}>{format(d.topCategory?.variance ?? 0)}</td><td>{d.distinctCount}</td><td>{(d.impact * 100).toFixed(1)}%</td><td>{(d.surprise * 100).toFixed(1)}%</td></tr>)}</tbody></table></div>
      </section>
    </details>
  </main>;
}

function Metric({ label, value, helper, tone }: { label: string; value: string; helper?: string; tone?: string }) {
  return <div className="metric friendly-metric"><span>{label}</span><strong className={tone}>{value}</strong>{helper && <small>{helper}</small>}</div>;
}

function StoryCard({ step, title, primary, detail, action }: { step: string; title: string; primary: string; detail: string; action: ReactNode }) {
  return <article className="story-card"><div className="story-step">{step}</div><span className="story-label">{title}</span><h3>{primary}</h3><p>{detail}</p>{action && <div className="story-action">{action}</div>}</article>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <section className="panel"><div className="panel-head"><h2>{title}</h2><p>{subtitle}</p></div>{children}</section>;
}

function plainAnomaly(score: number) {
  if (score >= 3) return 'Very unusual';
  if (score >= 2) return 'Unusual';
  if (score >= 1) return 'Worth watching';
  return 'Within normal range';
}

function plainSummary(variance: number, variancePct: number | null, anomalyScore: number) {
  const direction = variance < 0 ? 'under' : 'over';
  const pctText = variancePct == null ? '' : ` (${Math.abs(variancePct).toFixed(1)}% ${direction})`;
  const unusual = anomalyScore >= 2 ? ' This movement is large enough to stand out from normal variation.' : ' This movement is still within a range that can occur through normal variation.';
  return `Compared with the selected expectation, performance is ${direction} by ${format(Math.abs(variance))}${pctText}.${unusual}`;
}
