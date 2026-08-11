import { useMemo, useState } from 'react';
import { createSampleData } from './data/sampleData';
import { investigate } from './lib/anomaly';
import { parseDataFile } from './lib/io';
import { profileFields } from './lib/profile';
import { ContributionBars, DimensionLandscape, DrillTree, InteractionList } from './components/Visuals';
import type { DataRow, DimensionScore, Predicate } from './types';

const format = (n: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);

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
      if (!parsed.length) throw new Error('No rows found.');
      const p = profileFields(parsed);
      const nums = p.filter((x) => x.kind === 'numeric');
      if (!nums.length) throw new Error('At least one numeric measure is required.');
      setRows(parsed);
      setActualKey(nums[0].name);
      setExpectedKey(nums[1]?.name ?? '');
      setPredicates([]);
      setSelectedDimension('');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return <main>
    <header className="hero">
      <div><span className="eyebrow">MULTIDIMENSIONAL RCA PROTOTYPE</span><h1>Drill-down Anomaly Lab</h1><p>Every drill creates a cohort, then re-scores every remaining eligible dimension and searches cross-dimensional interactions.</p></div>
      <label className="upload">Load CSV / JSON<input type="file" accept=".csv,.json" onChange={(e) => loadFile(e.target.files?.[0])} /></label>
    </header>

    {error && <div className="error">{error}</div>}

    <section className="controls">
      <label>Actual measure<select value={actualKey} onChange={(e) => { setActualKey(e.target.value); setPredicates([]); }}>{numeric.map((p) => <option key={p.name}>{p.name}</option>)}</select></label>
      <label>Expected / target<select value={expectedKey} onChange={(e) => { setExpectedKey(e.target.value); setPredicates([]); }}><option value="">No target — compare to cohort mean</option>{numeric.filter((p) => p.name !== actualKey).map((p) => <option key={p.name}>{p.name}</option>)}</select></label>
      <button onClick={() => { setRows(createSampleData()); setActualKey('actual'); setExpectedKey('target'); setPredicates([]); setSelectedDimension('region'); }}>Reset demo</button>
    </section>

    <section className="breadcrumbs"><strong>Cohort:</strong><button onClick={() => setPredicates([])}>All data</button>{predicates.map((p, i) => <button key={`${p.dimension}-${p.value}`} onClick={() => setPredicates(predicates.slice(0, i + 1))}>→ {p.dimension} = {p.value}</button>)}</section>

    <section className="metrics">
      <Metric label="Rows" value={result.rowCount.toLocaleString()} />
      <Metric label="Actual" value={format(result.actual)} />
      <Metric label={expectedKey ? 'Expected' : 'Baseline'} value={format(result.expected)} />
      <Metric label="Variance" value={format(result.variance)} tone={result.variance < 0 ? 'bad' : 'good'} />
      <Metric label="Anomaly score" value={`${result.anomalyScore.toFixed(2)}σ`} />
      <Metric label="Dimensions rescanned" value={String(result.dimensionsScanned)} />
    </section>

    <section className="insight-banner">
      <strong>Automated insight:</strong> {buildInsight(result.dimensionScores, result.interactions, result.variance)}
    </section>

    <section className="grid two">
      <Panel title="Dynamic investigation path" subtitle="The tree records the cohort path; it is not a fixed hierarchy."><DrillTree predicates={predicates} /></Panel>
      <Panel title="Top cross-dimensional segments" subtitle="Beam-style search across values from the strongest dimensions."><InteractionList interactions={result.interactions} onDrill={drill} /></Panel>
    </section>

    <section className="grid two wide-left">
      <Panel title="All-dimension landscape" subtitle={`${result.dimensionsScanned} eligible dimensions analyzed for the current cohort. Click any bar.`}><DimensionLandscape scores={result.dimensionScores} onSelect={(d: DimensionScore) => setSelectedDimension(d.dimension)} /></Panel>
      <Panel title={selectedScore ? `${selectedScore.dimension} contribution` : 'Category contribution'} subtitle="Click a category to create the next cohort and trigger a full re-scan."><ContributionBars score={selectedScore} onDrill={(p) => drill([p])} /></Panel>
    </section>

    <section className="table-panel">
      <h2>Dimension audit table</h2><p>Exhaustive evidence alongside the compact visual ranking.</p>
      <div className="table-wrap"><table><thead><tr><th>#</th><th>Dimension</th><th>Score</th><th>Top category</th><th>Top variance</th><th>Distinct</th><th>Impact</th><th>Surprise</th></tr></thead><tbody>{result.dimensionScores.map((d, i) => <tr key={d.dimension} onClick={() => setSelectedDimension(d.dimension)}><td>{i + 1}</td><td>{d.dimension}</td><td>{d.score.toFixed(1)}</td><td>{d.topCategory?.value}</td><td className={Number(d.topCategory?.variance) < 0 ? 'bad' : 'good'}>{format(d.topCategory?.variance ?? 0)}</td><td>{d.distinctCount}</td><td>{(d.impact * 100).toFixed(1)}%</td><td>{(d.surprise * 100).toFixed(1)}%</td></tr>)}</tbody></table></div>
    </section>
  </main>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) { return <div className="metric"><span>{label}</span><strong className={tone}>{value}</strong></div>; }
function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <section className="panel"><div className="panel-head"><h2>{title}</h2><p>{subtitle}</p></div>{children}</section>; }
function buildInsight(scores: DimensionScore[], interactions: any[], variance: number) {
  const top = scores[0]; const inter = interactions[0];
  if (!top) return 'No eligible dimensions remain in this cohort.';
  const direction = variance < 0 ? 'unfavorable' : 'favorable';
  return `${direction} movement is most strongly associated with ${top.dimension}${top.topCategory ? `, led by ${top.topCategory.value}` : ''}. ${inter ? `The strongest detected interaction is ${inter.predicates.map((p: Predicate) => `${p.dimension}=${p.value}`).join(' + ')}, covering ${inter.count.toLocaleString()} rows.` : 'No stable multi-dimensional segment passed the support threshold.'}`;
}
