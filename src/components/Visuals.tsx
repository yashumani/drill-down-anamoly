import type { EChartsOption } from 'echarts';
import type { DimensionScore, InteractionSegment, Predicate } from '../types';
import { EChart } from './EChart';

const compact = (v: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
const humanize = (value: string) => value
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (c) => c.toUpperCase());

export function DimensionLandscape({ scores, onSelect }: { scores: DimensionScore[]; onSelect: (d: DimensionScore) => void }) {
  const top = scores.slice(0, 18);
  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const row = top[p?.dataIndex ?? 0];
        return row ? `${humanize(row.dimension)}<br/>Explanation strength: ${row.score.toFixed(1)}/100<br/>Share of movement: ${(row.impact * 100).toFixed(1)}%<br/>How distinctive: ${(row.surprise * 100).toFixed(1)}%` : '';
      },
    },
    grid: { left: 170, right: 35, top: 20, bottom: 30 },
    xAxis: { type: 'value', max: 100, name: 'Explanation strength' },
    yAxis: { type: 'category', inverse: true, data: top.map((d) => humanize(d.dimension)) },
    series: [{ type: 'bar', data: top.map((d) => Number(d.score.toFixed(1))), barMaxWidth: 20 }],
  };
  return <EChart option={option} height={460} onClick={(p) => { const d = top[p.dataIndex]; if (d) onSelect(d); }} />;
}

export function ContributionBars({ score, onDrill }: { score: DimensionScore | null; onDrill: (p: Predicate) => void }) {
  if (!score) return <div className="empty">Choose a business factor to see which groups are helping or hurting the result.</div>;
  const rows = score.categories.slice(0, 12);
  const option: EChartsOption = {
    tooltip: {
      formatter: (p: any) => {
        const row = rows[p?.dataIndex ?? 0];
        if (!row) return '';
        const direction = row.variance < 0 ? 'Below expectation' : 'Above expectation';
        return `${row.value}<br/>${direction}: ${compact(Math.abs(row.variance))}<br/>Records in group: ${row.count.toLocaleString()}`;
      },
    },
    grid: { left: 130, right: 40, top: 20, bottom: 30 },
    xAxis: { type: 'value', name: 'Difference from expectation' },
    yAxis: { type: 'category', inverse: true, data: rows.map((r) => r.value) },
    series: [{
      type: 'bar',
      data: rows.map((r) => r.variance),
      barMaxWidth: 22,
      markLine: { symbol: 'none', data: [{ xAxis: 0 }] },
    }],
  };
  return <EChart option={option} height={390} onClick={(p) => { const row = rows[p.dataIndex]; if (row) onDrill({ dimension: score.dimension, value: row.value }); }} />;
}

export function InteractionList({ interactions, onDrill }: { interactions: InteractionSegment[]; onDrill: (p: Predicate[]) => void }) {
  return <div className="interaction-list">
    {interactions.slice(0, 8).map((x, i) => <button key={i} className="interaction" onClick={() => onDrill(x.predicates)}>
      <span className="interaction-title">{x.predicates.map((p) => `${humanize(p.dimension)}: ${p.value}`).join(' + ')}</span>
      <span className={x.variance < 0 ? 'bad' : 'good'}>{x.variance < 0 ? '−' : '+'}{compact(Math.abs(x.variance))}</span>
      <small>{x.count.toLocaleString()} records share this pattern · {x.lift.toFixed(1)}× more concentrated than average</small>
    </button>)}
  </div>;
}

export function DrillTree({ predicates }: { predicates: Predicate[] }) {
  const data: any = { name: 'All data', children: [] as any[] };
  let cursor = data;
  for (const p of predicates) {
    const node = { name: `${humanize(p.dimension)}: ${p.value}`, children: [] as any[] };
    cursor.children.push(node);
    cursor = node;
  }
  const option: EChartsOption = {
    tooltip: { trigger: 'item' },
    series: [{
      type: 'tree',
      data: [data],
      top: '8%',
      left: '8%',
      bottom: '8%',
      right: '22%',
      symbolSize: 10,
      orient: 'LR',
      label: { position: 'left', verticalAlign: 'middle', align: 'right' },
      leaves: { label: { position: 'right', align: 'left' } },
      expandAndCollapse: false,
      animationDuration: 250,
    }],
  };
  return <EChart option={option} height={280} />;
}
