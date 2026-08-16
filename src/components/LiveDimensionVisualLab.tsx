import { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { EChart } from './EChart';
import { loadLiveDimensionMatrix } from '../lib/liveDimensionMatrix';
import type { LiveDimensionMatrixResult } from '../lib/liveDimensionMatrix';
import type { LiveDemoFilter, LiveDimensionSummary, LivePublicFinanceResult } from '../lib/livePublicFinance';

const money = (value: number) => Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
}).format(value);
const compact = (value: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;

type ChartMode = 'concentration' | 'waterfall' | 'heatmap';
type HeatMetric = 'businessImpact' | 'variancePct' | 'actual';

function concentrationOption(summary: LiveDimensionSummary): EChartsOption {
  const values = summary.values.slice(0, 8);
  return {
    animationDuration: 220,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const item = Array.isArray(params) ? params[0] as { dataIndex?: number } : params as { dataIndex?: number };
        const value = values[item?.dataIndex ?? 0];
        return value ? `${value.value}<br/>Spend: ${money(value.amount)}<br/>Share: ${percent(value.shareOfSpend)}<br/>Transactions: ${value.transactions.toLocaleString()}<br/>Average transaction: ${money(value.averageTransaction)}` : '';
      },
    },
    grid: { left: 205, right: 30, top: 18, bottom: 32 },
    xAxis: { type: 'value', name: 'Payment amount', axisLabel: { formatter: (value: number) => compact(value) } },
    yAxis: { type: 'category', inverse: true, data: values.map((value) => value.value), axisLabel: { width: 185, overflow: 'truncate' } },
    series: [{ type: 'bar', data: values.map((value) => value.amount), barMaxWidth: 22 }],
  };
}

function waterfallOption(matrix: LiveDimensionMatrixResult): EChartsOption {
  const contributions = matrix.latestContributions;
  let running = 0;
  const base: number[] = [];
  const bars = contributions.map((contribution) => {
    const start = running;
    running += contribution.businessImpact;
    base.push(Math.min(start, running));
    return {
      value: Math.abs(contribution.businessImpact),
      signedValue: contribution.businessImpact,
      contribution,
      itemStyle: { color: contribution.businessImpact < 0 ? '#c9473f' : '#188451' },
    };
  });
  const netImpact = contributions.reduce((sum, item) => sum + item.businessImpact, 0);
  base.push(0);
  bars.push({
    value: Math.abs(netImpact),
    signedValue: netImpact,
    contribution: {
      category: 'Net selected-scope impact',
      actual: 0,
      expected: 0,
      businessImpact: netImpact,
      variancePct: null,
      transactions: 0,
    },
    itemStyle: { color: netImpact < 0 ? '#c9473f' : '#188451' },
  });
  const labels = [...contributions.map((item) => item.category), 'Net impact'];

  return {
    animationDuration: 260,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params as Array<{ dataIndex?: number }> : [];
        const item = bars[items[0]?.dataIndex ?? 0];
        if (!item) return '';
        const c = item.contribution;
        return `<strong>${c.category}</strong><br/>Business impact: ${money(c.businessImpact)} (${c.businessImpact < 0 ? 'unfavorable' : 'favorable'})${c.variancePct === null ? '' : `<br/>Variance: ${percent(c.variancePct)}`}<br/>Actual spend: ${money(c.actual)}<br/>Rolling benchmark: ${money(c.expected)}`;
      },
    },
    grid: { left: 66, right: 26, top: 24, bottom: 88 },
    xAxis: { type: 'category', data: labels, axisLabel: { rotate: labels.length > 6 ? 28 : 0, width: 105, overflow: 'truncate' } },
    yAxis: { type: 'value', name: 'Business impact', axisLabel: { formatter: (value: number) => compact(value) } },
    series: [
      { type: 'bar', stack: 'waterfall', silent: true, itemStyle: { color: 'transparent', borderColor: 'transparent' }, emphasis: { itemStyle: { color: 'transparent', borderColor: 'transparent' } }, data: base },
      {
        type: 'bar',
        stack: 'waterfall',
        barMaxWidth: 40,
        label: { show: true, position: 'top', formatter: (params: { data?: { signedValue?: number } }) => compact(params.data?.signedValue ?? 0) },
        data: bars,
        markLine: { symbol: 'none', lineStyle: { type: 'dashed' }, data: [{ yAxis: 0 }] },
      },
    ],
  };
}

function heatValue(cell: LiveDimensionMatrixResult['cells'][number], metric: HeatMetric) {
  if (metric === 'variancePct') return (cell.variancePct ?? 0) * 100;
  return cell[metric];
}

function heatmapOption(matrix: LiveDimensionMatrixResult, metric: HeatMetric): EChartsOption {
  const periods = matrix.periods;
  const categories = matrix.categories;
  const max = Math.max(1, ...matrix.cells.map((cell) => Math.abs(heatValue(cell, metric))));
  const sequential = metric === 'actual';
  const data = matrix.cells.map((cell) => {
    const x = periods.findIndex((period) => period.key === cell.periodKey);
    const y = categories.indexOf(cell.category);
    return {
      value: [x, y, heatValue(cell, metric)],
      cell,
    };
  }).filter((item) => item.value[0] >= 0 && item.value[1] >= 0);

  return {
    animationDuration: 180,
    tooltip: {
      position: 'top',
      formatter: (params: unknown) => {
        const item = params as { data?: { cell?: LiveDimensionMatrixResult['cells'][number] } };
        const cell = item.data?.cell;
        if (!cell) return '';
        return `<strong>${cell.category}</strong><br/>${cell.periodLabel}${cell.partialPeriod ? ' · partial' : ''}<br/>Actual: ${money(cell.actual)}<br/>Benchmark: ${money(cell.expected)}<br/>Business impact: ${money(cell.businessImpact)} (${cell.businessImpact < 0 ? 'unfavorable' : 'favorable'})<br/>Variance: ${percent(cell.variancePct)}<br/>Transactions: ${cell.transactions.toLocaleString()}`;
      },
    },
    toolbox: { right: 14, feature: { dataZoom: { yAxisIndex: 'none' }, restore: {}, saveAsImage: { name: `${matrix.dimension.field}-heatmap` } } },
    grid: { left: 180, right: 72, top: 48, bottom: 72 },
    xAxis: { type: 'category', data: periods.map((period) => period.label), splitArea: { show: true }, axisLabel: { hideOverlap: true } },
    yAxis: { type: 'category', data: categories, inverse: true, splitArea: { show: true }, axisLabel: { width: 165, overflow: 'truncate' } },
    visualMap: sequential ? {
      min: 0,
      max,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 5,
      inRange: { color: ['#fffdf7', '#f7bb3d', '#dc5b51'] },
      formatter: (value: number) => metric === 'actual' ? compact(value) : value.toFixed(1),
    } : {
      min: -max,
      max,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 5,
      inRange: { color: ['#c9473f', '#f2b9b4', '#fffdf7', '#bfe7cf', '#188451'] },
      formatter: (value: number) => metric === 'variancePct' ? `${value.toFixed(0)}%` : compact(value),
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, filterMode: 'filter', zoomOnMouseWheel: true, moveOnMouseMove: true },
      { type: 'slider', xAxisIndex: 0, filterMode: 'filter', height: 16, bottom: 34 },
      { type: 'inside', yAxisIndex: 0, filterMode: 'filter', zoomOnMouseWheel: 'shift', moveOnMouseMove: true },
      { type: 'slider', yAxisIndex: 0, filterMode: 'filter', orient: 'vertical', right: 8, width: 14 },
    ],
    series: [{ name: metric, type: 'heatmap', data, progressive: 500, emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,.35)' } } }],
  };
}

export function LiveDimensionVisualLab({
  result,
  summary,
  appToken,
  onFocus,
}: {
  result: LivePublicFinanceResult;
  summary: LiveDimensionSummary;
  appToken: string;
  onFocus: (filter: LiveDemoFilter) => void;
}) {
  const [mode, setMode] = useState<ChartMode>('concentration');
  const [heatMetric, setHeatMetric] = useState<HeatMetric>('businessImpact');
  const [matrix, setMatrix] = useState<LiveDimensionMatrixResult | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState('');
  const categoriesKey = summary.values.map((value) => value.value).join('\u0000');

  useEffect(() => {
    const controller = new AbortController();
    setMatrixLoading(true);
    setMatrixError('');
    loadLiveDimensionMatrix({
      scope: result.scope,
      source: result.fullSource,
      filter: result.filter,
      dimension: summary,
      categories: summary.values.map((value) => value.value),
      periods: result.monthly,
      currentTotalImpact: result.currentMonth?.businessImpact ?? 0,
      appToken,
      signal: controller.signal,
    }).then((next) => {
      setMatrix(next);
      setMatrixLoading(false);
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setMatrixError(error instanceof Error ? error.message : String(error));
      setMatrixLoading(false);
    });
    return () => controller.abort();
  }, [result.scope, result.filter?.field, result.filter?.value, summary.field, categoriesKey, result.currentMonth?.key]);

  const option = useMemo(() => {
    if (mode === 'concentration') return concentrationOption(summary);
    if (!matrix) return concentrationOption(summary);
    if (mode === 'waterfall') return waterfallOption(matrix);
    return heatmapOption(matrix, heatMetric);
  }, [mode, summary, matrix, heatMetric]);

  const latestByCategory = useMemo(() => new Map((matrix?.latestContributions ?? []).map((item) => [item.category, item])), [matrix]);
  const title = mode === 'concentration' ? 'Total spend concentration' : mode === 'waterfall' ? 'Latest-period impact waterfall' : 'Zoomable category × month heatmap';

  return <section className="live-visual-lab">
    <div className="live-chart-toolbar">
      <div><span className="deck-kicker">VISUAL ANALYSIS</span><h3>{title}</h3><p>{mode === 'heatmap' ? 'Use the sliders, mouse wheel, drag, toolbox zoom, and Restore control to move between the full history and a focused period/category window.' : 'Switch views without leaving the selected dimension.'}</p></div>
      <div className="live-chart-tabs" role="tablist" aria-label="Dimension chart type">
        <button type="button" className={mode === 'concentration' ? 'active' : ''} onClick={() => setMode('concentration')}>Concentration</button>
        <button type="button" className={mode === 'waterfall' ? 'active' : ''} onClick={() => setMode('waterfall')} disabled={!matrix}>Waterfall</button>
        <button type="button" className={mode === 'heatmap' ? 'active' : ''} onClick={() => setMode('heatmap')} disabled={!matrix}>Heatmap</button>
      </div>
      {mode === 'heatmap' && <label className="live-heat-metric">Heatmap value<select value={heatMetric} onChange={(event) => setHeatMetric(event.target.value as HeatMetric)}><option value="businessImpact">Business impact</option><option value="variancePct">Variance %</option><option value="actual">Actual spend</option></select></label>}
    </div>

    {matrixLoading && mode !== 'concentration' && <div className="live-matrix-loading">Loading the category-by-month matrix from the public source…</div>}
    {matrixError && mode !== 'concentration' && <div className="inline-error">{matrixError}</div>}
    <div className={mode === 'heatmap' ? 'live-driver-chart live-driver-heatmap' : 'live-driver-chart'}><EChart option={option} height={mode === 'heatmap' ? 350 : 330} ariaLabel={`${summary.label} ${title}`} /></div>

    <div className="live-dimension-table"><table><thead><tr><th>Category</th><th>Total payments</th><th>Share</th><th>Transactions</th><th>Latest impact</th><th>Latest variance</th><th /></tr></thead><tbody>{summary.values.map((value) => {
      const latest = latestByCategory.get(value.value);
      return <tr key={value.value}><td><strong>{value.value}</strong></td><td>{money(value.amount)}</td><td>{percent(value.shareOfSpend)}</td><td>{value.transactions.toLocaleString()}</td><td className={latest && latest.businessImpact < 0 ? 'bad' : 'good'}>{latest ? money(latest.businessImpact) : '—'}</td><td>{latest ? percent(latest.variancePct) : '—'}</td><td><button type="button" className="quiet-button" onClick={() => onFocus({ field: summary.field, value: value.value })}>Focus</button></td></tr>;
    })}</tbody></table></div>
  </section>;
}
