import { useMemo, useState } from 'react';
import type { EChartsOption, ECElementEvent } from 'echarts';
import type { InteractionSegment, Predicate } from '../types';
import { EChart } from './EChart';
import { InfoTip } from './InfoTip';

const compact = (value: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const humanize = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
function pathLabel(interaction: InteractionSegment) { return interaction.predicates.map((predicate) => `${humanize(predicate.dimension)} = ${predicate.value}`).join(' → '); }
function combinationExplanation(interaction: InteractionSegment) {
  const direction = interaction.businessImpact < 0 ? 'unfavorable' : interaction.businessImpact > 0 ? 'favorable' : 'neutral';
  return `${pathLabel(interaction)} contributes ${compact(Math.abs(interaction.businessImpact))} ${direction} business impact. The group appears ${interaction.lift.toFixed(1)}× more concentrated than a typical group and contains ${interaction.count.toLocaleString()} records.`;
}

export function CombinationExplorer({ interactions, onDrill }: { interactions: InteractionSegment[]; onDrill: (predicates: Predicate[]) => void }) {
  const rows = interactions.slice(0, 10);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = rows[selectedIndex] ?? null;
  const maxSupport = Math.max(1, ...rows.map((row) => row.count));
  const option: EChartsOption = useMemo(() => ({
    animationDuration: 450,
    animationDurationUpdate: 550,
    tooltip: {
      confine: true,
      formatter: (params: unknown) => {
        const point = params as { dataIndex?: number };
        const row = rows[point.dataIndex ?? 0];
        if (!row) return '';
        return [`<strong>Combination ${Number(point.dataIndex ?? 0) + 1}</strong>`, pathLabel(row), `Business impact: ${compact(row.businessImpact)}`, `Concentration lift: ${row.lift.toFixed(1)}×`, `Support: ${row.count.toLocaleString()} records (${(row.support * 100).toFixed(1)}%)`].join('<br/>');
      },
    },
    grid: { left: 64, right: 28, top: 34, bottom: 54 },
    xAxis: { type: 'value', name: 'How unusually concentrated?', min: 0, axisLabel: { formatter: (value: number) => `${value.toFixed(1)}×` }, splitLine: { lineStyle: { type: 'dashed', opacity: 0.35 } } },
    yAxis: { type: 'value', name: 'Business impact', axisLabel: { formatter: (value: number) => compact(value) }, splitLine: { lineStyle: { type: 'dashed', opacity: 0.35 } } },
    series: [{
      type: 'scatter',
      data: rows.map((row, index) => ({
        value: [row.lift, row.businessImpact, row.count],
        name: `C${index + 1}`,
        symbolSize: 20 + Math.sqrt(row.count / maxSupport) * 42,
        itemStyle: { borderColor: '#111111', borderWidth: selectedIndex === index ? 5 : 2, opacity: selectedIndex === index ? 1 : 0.78 },
        label: { show: true, formatter: `C${index + 1}`, fontWeight: 800 },
      })),
      markLine: { symbol: 'none', data: [{ yAxis: 0 }], lineStyle: { width: 2 } },
      emphasis: { focus: 'self', scale: 1.12 },
      universalTransition: true,
    }],
  }), [rows, selectedIndex, maxSupport]);

  function selectPoint(params: ECElementEvent) { const index = Number(params.dataIndex ?? 0); if (rows[index]) setSelectedIndex(index); }
  if (!rows.length) return <div className="combination-empty"><strong>No supported combined driver is available.</strong><p>Broaden the reporting period or remove a drill filter so the engine has enough records to compare multi-dimensional groups.</p></div>;

  return <section className="combination-explorer" id="combined-drivers" aria-label="Combined driver analysis">
    <div className="combination-explorer-head"><div><span className="deck-kicker">COMBINED DRIVERS <InfoTip text="A combined driver is a supported group of dimension values that appears together. It identifies concentration, not causality." label="About combined drivers" /></span><h3>Which values become important only when they occur together?</h3><p>Each bubble is one supported group. Higher lift means the pattern is more concentrated than normal. Above zero is favorable; below zero is unfavorable. Bubble size represents record support.</p></div><div className="combination-legend"><span>Horizontal = concentration <InfoTip text="Concentration lift compares how frequently this combination appears with how frequently a typical combination would appear." label="Concentration lift" side="left" /></span><span>Vertical = business impact <InfoTip text="Business impact applies the selected metric direction, so favorable and unfavorable remain correct for revenue and cost metrics." label="Business impact" side="left" /></span><span>Size = support <InfoTip text="Support is the number of records in the combination. Larger bubbles have more underlying observations." label="Record support" side="left" /></span></div></div>
    <div className="combination-explorer-layout">
      <div className="combination-chart-frame"><EChart option={option} height={410} onClick={selectPoint} ariaLabel="Combined driver bubble chart showing concentration, business impact, and support" /></div>
      <aside className="combination-detail">{selected && <><span className="deck-kicker">SELECTED COMBINATION C{selectedIndex + 1}</span><div className="combination-path">{selected.predicates.map((predicate, index) => <div key={`${predicate.dimension}-${predicate.value}`}><span>{index + 1}</span><strong>{humanize(predicate.dimension)}</strong><em>{predicate.value}</em></div>)}</div><p>{combinationExplanation(selected)}</p><dl><div><dt>Business impact</dt><dd className={selected.businessImpact < 0 ? 'bad' : 'good'}>{compact(selected.businessImpact)}</dd></div><div><dt>Concentration</dt><dd>{selected.lift.toFixed(1)}×</dd></div><div><dt>Support</dt><dd>{selected.count.toLocaleString()} records</dd></div><div><dt>Share of population</dt><dd>{(selected.support * 100).toFixed(1)}%</dd></div></dl><button type="button" title="Filter the analytical population to every value in this selected combination." onClick={() => onDrill(selected.predicates)}>Drill into this combination →</button><small>This is a descriptive interaction pattern. It identifies where the movement is concentrated; it does not prove that the attributes caused the result.</small></>}</aside>
    </div>
    <div className="combination-ranking">{rows.map((row, index) => <button type="button" key={pathLabel(row)} className={selectedIndex === index ? 'active' : ''} onClick={() => setSelectedIndex(index)}><span>C{index + 1}</span><strong>{row.predicates.map((predicate) => predicate.value).join(' + ')}</strong><small>{compact(Math.abs(row.businessImpact))} {row.businessImpact < 0 ? 'unfavorable' : 'favorable'} · {row.lift.toFixed(1)}× lift</small></button>)}</div>
  </section>;
}
