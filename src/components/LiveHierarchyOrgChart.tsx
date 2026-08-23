import { useEffect, useMemo, useState } from 'react';
import type { EChartsOption, ECElementEvent } from 'echarts';
import { EChart } from './EChart';
import { downloadHierarchyTemplate } from '../lib/hierarchyContract';
import {
  createInitialLiveHierarchyPath,
  LIVE_FINANCE_HIERARCHY,
  loadLiveHierarchyChildren,
  nextLiveHierarchyLevel,
} from '../lib/liveHierarchy';
import type { LiveHierarchyPathItem } from '../lib/liveHierarchy';
import type { LivePublicFinanceResult } from '../lib/livePublicFinance';

const money = (value: number) => Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
}).format(value);
const count = (value: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const percent = (value: number) => `${(value * 100).toFixed(value >= 0.1 ? 0 : 1)}%`;

const levelColors = ['#111111', '#3B82F6', '#10B981', '#A3E635', '#FACC15', '#FB923C', '#F43F5E', '#C026D3', '#7C3AED', '#0891B2'];

interface ChartNode {
  name: string;
  nodeId: string;
  drillable: boolean;
  levelIndex: number;
  amount: number;
  share: number;
  transactions: number;
  selectedPath: boolean;
  children?: ChartNode[];
  itemStyle?: Record<string, unknown>;
  label?: Record<string, unknown>;
}

function chartNode(item: LiveHierarchyPathItem, selectedPath: boolean): ChartNode {
  return {
    name: item.value,
    nodeId: item.nodeId,
    drillable: item.drillable,
    levelIndex: item.levelIndex,
    amount: item.amount,
    share: item.shareOfParent,
    transactions: item.transactions,
    selectedPath,
    itemStyle: {
      color: levelColors[item.levelIndex % levelColors.length],
      borderColor: '#111111',
      borderWidth: selectedPath ? 3 : 2,
      shadowBlur: selectedPath ? 12 : 4,
      shadowColor: 'rgba(0,0,0,.22)',
      shadowOffsetX: 3,
      shadowOffsetY: 4,
    },
  };
}

function buildChartTree(path: LiveHierarchyPathItem[], children: LiveHierarchyPathItem[]) {
  if (!path.length) return null;
  const root = chartNode(path[0], true);
  let cursor = root;
  for (let index = 1; index < path.length; index += 1) {
    const child = chartNode(path[index], true);
    cursor.children = [child];
    cursor = child;
  }
  if (children.length) cursor.children = children.map((child) => chartNode(child, false));
  return root;
}

function hierarchyChartOption(path: LiveHierarchyPathItem[], children: LiveHierarchyPathItem[], phone: boolean): EChartsOption {
  const tree = buildChartTree(path, children);
  const level = nextLiveHierarchyLevel(path);
  return {
    animationDuration: 320,
    animationDurationUpdate: 420,
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: (params: unknown) => {
        const data = (params as { data?: ChartNode }).data;
        if (!data) return '';
        return [
          `<strong>${data.name}</strong>`,
          `Level ${data.levelIndex + 1}: ${LIVE_FINANCE_HIERARCHY[data.levelIndex]?.label ?? 'Hierarchy'}`,
          `Payments: ${money(data.amount)}`,
          `Transactions: ${data.transactions.toLocaleString()}`,
          data.levelIndex > 0 ? `Share of parent: ${percent(data.share)}` : 'Root population',
          data.drillable && level ? 'Tap to drill into the next level' : '',
        ].filter(Boolean).join('<br/>');
      },
    },
    series: tree ? [{
      type: 'tree',
      data: [tree],
      orient: phone ? 'TB' : 'LR',
      top: phone ? '3%' : '5%',
      left: phone ? '8%' : '3%',
      bottom: phone ? '8%' : '5%',
      right: phone ? '8%' : '7%',
      symbol: 'roundRect',
      symbolSize: phone ? [112, 48] : [154, 58],
      edgeShape: 'polyline',
      edgeForkPosition: '48%',
      lineStyle: { width: 2, color: '#1f2937', curveness: 0.08 },
      roam: true,
      expandAndCollapse: false,
      initialTreeDepth: -1,
      emphasis: { focus: 'descendant' },
      label: {
        position: 'inside',
        align: 'center',
        verticalAlign: 'middle',
        color: '#ffffff',
        formatter: (params: unknown) => {
          const data = (params as { data?: ChartNode }).data;
          if (!data) return '';
          const value = data.name.length > (phone ? 16 : 22) ? `${data.name.slice(0, phone ? 15 : 21)}…` : data.name;
          return `{name|${value}}\n{value|${money(data.amount)}}`;
        },
        rich: {
          name: { color: '#ffffff', fontSize: phone ? 10 : 11, fontWeight: 800, lineHeight: phone ? 14 : 16 },
          value: { color: '#ffffff', fontSize: phone ? 9 : 10, fontWeight: 600, lineHeight: phone ? 13 : 15 },
        },
      },
      leaves: { label: { position: 'inside' } },
    }] : [],
  } as EChartsOption;
}

export function LiveHierarchyOrgChart({ result, appToken }: { result: LivePublicFinanceResult; appToken: string }) {
  const initialPath = useMemo(
    () => createInitialLiveHierarchyPath(result.scopedSource.totalAmount, result.scopedSource.rowCount),
    [result.scopedSource.totalAmount, result.scopedSource.rowCount],
  );
  const [path, setPath] = useState<LiveHierarchyPathItem[]>(initialPath);
  const [children, setChildren] = useState<LiveHierarchyPathItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [queryEvidence, setQueryEvidence] = useState('');
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 640);
  const pathKey = path.map((item) => item.nodeId).join('|');
  const current = path[path.length - 1];
  const nextLevel = nextLiveHierarchyLevel(path);

  useEffect(() => {
    setPath(initialPath);
    setChildren([]);
  }, [initialPath, result.scope, result.filter?.field, result.filter?.value]);

  useEffect(() => {
    const onResize = () => setPhone(window.innerWidth <= 640);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    loadLiveHierarchyChildren({
      scope: result.scope,
      source: result.scopedSource,
      baseFilter: result.filter,
      path,
      parentAmount: current?.amount ?? result.scopedSource.totalAmount,
      parentTransactions: current?.transactions ?? result.scopedSource.rowCount,
      appToken,
      signal: controller.signal,
    }).then((response) => {
      setChildren(response.children);
      setQueryEvidence(response.requestCount
        ? `${response.children.length} branches · ${(response.queryDurationMs / 1000).toFixed(1)}s source query`
        : `${response.children.length} configured branch`);
      setLoading(false);
    }).catch((loadError) => {
      if (controller.signal.aborted) return;
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setChildren([]);
      setLoading(false);
    });
    return () => controller.abort();
  }, [result.scope, result.filter?.field, result.filter?.value, result.scopedSource.maxDate, result.scopedSource.maxFiscalYear, pathKey, appToken]);

  const option = useMemo(() => hierarchyChartOption(path, children, phone), [path, children, phone]);

  function chooseChild(child: LiveHierarchyPathItem) {
    if (!child.drillable || child.levelIndex >= LIVE_FINANCE_HIERARCHY.length - 1) return;
    setPath((currentPath) => [...currentPath, child]);
  }

  function handleChartClick(params: ECElementEvent) {
    const nodeId = String((params.data as { nodeId?: string } | undefined)?.nodeId ?? '');
    const child = children.find((item) => item.nodeId === nodeId);
    if (child) chooseChild(child);
  }

  function goToLevel(index: number) {
    setPath((currentPath) => currentPath.slice(0, index + 1));
  }

  return <section className="hierarchy-workspace" aria-label="Ten-level parent-child hierarchy exploration">
    <header className="hierarchy-head">
      <div>
        <span className="deck-kicker">PARENT-CHILD ORG CHART</span>
        <h3>Drill through ten levels of financial distribution</h3>
        <p>Choose a branch to load its children on demand. The chart uses two standardized relationship fields—<code>node_id</code> and <code>parent_node_id</code>—so the same pattern can work with an LOB, geography, cost-center, product, or organizational hierarchy.</p>
      </div>
      <div className="hierarchy-head-actions">
        <button type="button" className="quiet-button" onClick={() => downloadHierarchyTemplate()}>Download hierarchy template</button>
        <button type="button" onClick={() => setPath(initialPath)} disabled={path.length <= initialPath.length}>Reset hierarchy</button>
      </div>
    </header>

    <section className="hierarchy-contract-strip" aria-label="Hierarchy data preparation contract">
      <article><span>Required relationship</span><strong>node_id</strong><small>Unique ID for every hierarchy member</small></article>
      <article><span>Required relationship</span><strong>parent_node_id</strong><small>Parent ID; blank only for the root</small></article>
      <article><span>Recommended display</span><strong>node_label + level_name</strong><small>Business label and hierarchy level</small></article>
      <article><span>Finance evidence</span><strong>actual_value + plan_value</strong><small>Optional measures aggregated to every node</small></article>
    </section>

    <div className="hierarchy-level-rail" aria-label="Hierarchy levels">
      {LIVE_FINANCE_HIERARCHY.map((level, index) => {
        const selected = path[index];
        return <button
          type="button"
          key={level.id}
          className={selected ? 'complete' : index === path.length ? 'active' : ''}
          disabled={!selected}
          onClick={() => selected && goToLevel(index)}
          title={level.description}
        >
          <span>{String(index + 1).padStart(2, '0')}</span>
          <strong>{level.label}</strong>
          <small>{selected?.value ?? (index === path.length ? 'Choose next' : 'Pending')}</small>
        </button>;
      })}
    </div>

    <div className="hierarchy-breadcrumbs">
      {path.map((item, index) => <button type="button" key={item.nodeId} onClick={() => goToLevel(index)}><span>{item.levelLabel}</span><strong>{item.value}</strong></button>)}
      {nextLevel && <div><span>Next level</span><strong>{nextLevel.label}</strong></div>}
    </div>

    <div className="hierarchy-chart-shell">
      <div className="hierarchy-chart-meta">
        <div><span>Current parent</span><strong>{current?.value}</strong><small>{money(current?.amount ?? 0)} · {count(current?.transactions ?? 0)} transactions</small></div>
        <div><span>Next branch</span><strong>{nextLevel?.label ?? 'Leaf level reached'}</strong><small>{loading ? 'Loading children…' : error || queryEvidence}</small></div>
        <div><span>Navigation</span><strong>Tap a node · pinch or drag to roam</strong><small>Only the current branch and its children are rendered, keeping ten-level exploration readable.</small></div>
      </div>
      {error && <div className="error hierarchy-error"><strong>Hierarchy branch could not be loaded.</strong><span>{error}</span></div>}
      <EChart option={option} height={phone ? 430 : 520} ariaLabel="Interactive ten-level procurement hierarchy org chart" onClick={handleChartClick} />
      {loading && <div className="hierarchy-loading"><span /><strong>Loading {nextLevel?.label ?? 'branch'} from the live source…</strong></div>}
    </div>

    <section className="hierarchy-child-grid" aria-label="Current hierarchy children">
      {children.map((child, index) => <button
        type="button"
        key={child.nodeId}
        className={!child.drillable ? 'other' : ''}
        onClick={() => chooseChild(child)}
        disabled={!child.drillable || child.levelIndex >= LIVE_FINANCE_HIERARCHY.length - 1}
      >
        <span><i style={{ background: levelColors[child.levelIndex % levelColors.length] }} />{child.levelLabel} {String(index + 1).padStart(2, '0')}</span>
        <strong>{child.value}</strong>
        <small>{money(child.amount)} · {percent(child.shareOfParent)} of parent · {count(child.transactions)} transactions</small>
        <em>{child.drillable && child.levelIndex < LIVE_FINANCE_HIERARCHY.length - 1 ? 'Open branch →' : child.value === 'Other categories' ? 'Aggregated remainder' : 'Leaf level'}</em>
      </button>)}
      {!loading && !error && !children.length && <div className="hierarchy-empty"><strong>No child branches</strong><p>The selected member is a leaf or the public source returned no values for the next level.</p></div>}
    </section>

    <footer className="hierarchy-footnote">
      <strong>Demo hierarchy:</strong>
      <span>{LIVE_FINANCE_HIERARCHY.map((level) => level.label).join(' → ')}</span>
      <small>The first two levels are virtual business roots. Levels three through ten are grouped live from the public procurement source. This is a demonstration hierarchy, not an official City organizational chart.</small>
    </footer>
  </section>;
}
