import type { EChartsOption } from 'echarts';
import type { DimensionScore, InteractionSegment, Predicate } from '../types';
import { EChart } from './EChart';

const compact = (value: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const humanize = (value: string) => value
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

export function DimensionLandscape({ scores, onSelect }: { scores: DimensionScore[]; onSelect: (dimension: DimensionScore) => void }) {
  const top = scores.slice(0, 18);
  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const point = Array.isArray(params) ? params[0] as { dataIndex?: number } : params as { dataIndex?: number };
        const row = top[point?.dataIndex ?? 0];
        return row ? `${humanize(row.dimension)}<br/>Explanation strength: ${row.score.toFixed(1)}/100<br/>Share of movement: ${(row.impact * 100).toFixed(1)}%<br/>How distinctive: ${(row.surprise * 100).toFixed(1)}%` : '';
      },
    },
    grid: { left: 170, right: 35, top: 20, bottom: 30 },
    xAxis: { type: 'value', max: 100, name: 'Explanation strength' },
    yAxis: { type: 'category', inverse: true, data: top.map((dimension) => humanize(dimension.dimension)) },
    series: [{ type: 'bar', data: top.map((dimension) => Number(dimension.score.toFixed(1))), barMaxWidth: 20 }],
  };
  return <EChart option={option} height={460} ariaLabel="Ranked business factors by explanation strength" onClick={(params) => { const dimension = top[params.dataIndex]; if (dimension) onSelect(dimension); }} />;
}

export function ContributionBars({ score, onDrill }: { score: DimensionScore | null; onDrill: (predicate: Predicate) => void }) {
  if (!score) return <div className="empty">Choose a business factor to see which groups are helping or hurting the result.</div>;
  const rows = score.categories.slice(0, 12);
  const option: EChartsOption = {
    tooltip: {
      formatter: (params: unknown) => {
        const point = params as { dataIndex?: number };
        const row = rows[point?.dataIndex ?? 0];
        if (!row) return '';
        const direction = row.impactDirection === 'favorable' ? 'Favorable business impact' : row.impactDirection === 'unfavorable' ? 'Unfavorable business impact' : 'Neutral business impact';
        return `${row.value}<br/>${direction}: ${compact(Math.abs(row.businessImpact))}<br/>Raw actual-vs-expected difference: ${compact(row.variance)}<br/>Records in group: ${row.count.toLocaleString()}`;
      },
    },
    grid: { left: 130, right: 40, top: 20, bottom: 30 },
    xAxis: { type: 'value', name: 'Business impact' },
    yAxis: { type: 'category', inverse: true, data: rows.map((row) => row.value) },
    series: [{
      type: 'bar',
      data: rows.map((row) => row.businessImpact),
      barMaxWidth: 22,
      markLine: { symbol: 'none', data: [{ xAxis: 0 }] },
    }],
  };
  return <EChart option={option} height={390} ariaLabel={`Category business impact inside ${humanize(score.dimension)}`} onClick={(params) => { const row = rows[params.dataIndex]; if (row) onDrill({ dimension: score.dimension, value: row.value }); }} />;
}

export function InteractionList({ interactions, onDrill }: { interactions: InteractionSegment[]; onDrill: (predicates: Predicate[]) => void }) {
  return <div className="interaction-list">
    {interactions.slice(0, 8).map((interaction, index) => <button key={index} className="interaction" onClick={() => onDrill(interaction.predicates)}>
      <span className="interaction-title">{interaction.predicates.map((predicate) => `${humanize(predicate.dimension)}: ${predicate.value}`).join(' + ')}</span>
      <span className={interaction.businessImpact < 0 ? 'bad' : 'good'}>{interaction.businessImpact < 0 ? '−' : '+'}{compact(Math.abs(interaction.businessImpact))}</span>
      <small>{interaction.count.toLocaleString()} records share this pattern · {interaction.lift.toFixed(1)}× more concentrated than average</small>
    </button>)}
  </div>;
}

export function DrillTree({ predicates }: { predicates: Predicate[] }) {
  const data: { name: string; children: Array<{ name: string; children: unknown[] }> } = { name: 'All data', children: [] };
  let cursor = data as { children: Array<{ name: string; children: unknown[] }> };
  for (const predicate of predicates) {
    const node = { name: `${humanize(predicate.dimension)}: ${predicate.value}`, children: [] };
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
  return <EChart option={option} height={280} ariaLabel="Current investigation drill path" />;
}
