import type { EChartsOption } from 'echarts';
import type { DimensionScore, InteractionSegment, Predicate } from '../types';
import { EChart } from './EChart';

const compact = (v: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

export function DimensionLandscape({ scores, onSelect }: { scores: DimensionScore[]; onSelect: (d: DimensionScore) => void }) {
  const top = scores.slice(0, 18);
  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const row = top[p?.dataIndex ?? 0];
        return row ? `${row.dimension}<br/>Driver score: ${row.score.toFixed(1)}<br/>Impact: ${(row.impact * 100).toFixed(1)}%<br/>Surprise: ${(row.surprise * 100).toFixed(1)}%` : '';
      },
    },
    grid: { left: 150, right: 35, top: 20, bottom: 25 },
    xAxis: { type: 'value', max: 100, name: 'Driver score' },
    yAxis: { type: 'category', inverse: true, data: top.map((d) => d.dimension) },
    series: [{ type: 'bar', data: top.map((d) => Number(d.score.toFixed(1))), barMaxWidth: 20 }],
  };
  return <EChart option={option} height={460} onClick={(p) => { const d = top[p.dataIndex]; if (d) onSelect(d); }} />;
}

export function ContributionBars({ score, onDrill }: { score: DimensionScore | null; onDrill: (p: Predicate) => void }) {
  if (!score) return <div className="empty">Select a dimension to inspect category contributions.</div>;
  const rows = score.categories.slice(0, 12);
  const option: EChartsOption = {
    tooltip: {
      formatter: (p: any) => {
        const row = rows[p?.dataIndex ?? 0];
        return row ? `${row.value}<br/>Variance: ${compact(row.variance)}<br/>Rows: ${row.count.toLocaleString()}` : '';
      },
    },
    grid: { left: 130, right: 40, top: 20, bottom: 25 },
    xAxis: { type: 'value' },
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
      <span className="interaction-title">{x.predicates.map((p) => `${p.dimension}=${p.value}`).join(' ∧ ')}</span>
      <span className={x.variance < 0 ? 'bad' : 'good'}>{compact(x.variance)}</span>
      <small>{x.count.toLocaleString()} rows · lift {x.lift.toFixed(1)}×</small>
    </button>)}
  </div>;
}

export function DrillTree({ predicates }: { predicates: Predicate[] }) {
  const data: any = { name: 'All data', children: [] as any[] };
  let cursor = data;
  for (const p of predicates) {
    const node = { name: `${p.dimension}: ${p.value}`, children: [] as any[] };
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
