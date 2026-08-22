import { useEffect, useMemo, useState } from 'react';
import type { EChartsOption, ECElementEvent } from 'echarts';
import { buildArcHierarchyLayout, buildArcLeafInsight, arcNodePathLabel } from '../lib/arcHierarchy';
import type { ArcHierarchyNodeInput } from '../lib/arcHierarchy';
import { EChart } from './EChart';

const compact = (value: number | null | undefined) => value === null || value === undefined
  ? '—'
  : Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

interface LocalInsightState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  text: string;
}

function localLlmSettings() {
  try {
    return {
      enabled: localStorage.getItem('anomaly-llm-enabled') === 'true',
      endpoint: localStorage.getItem('anomaly-llm-endpoint') ?? '',
      model: localStorage.getItem('anomaly-llm-model') ?? '',
    };
  } catch {
    return { enabled: false, endpoint: '', model: '' };
  }
}

function safeLocalEndpoint(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return url.toString();
    if (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return url.toString();
    return '';
  } catch {
    return '';
  }
}

async function generateLocalLeafInsight(node: ArcHierarchyNodeInput, parent: ArcHierarchyNodeInput | null, signal: AbortSignal) {
  const settings = localLlmSettings();
  const endpoint = safeLocalEndpoint(settings.endpoint);
  if (!settings.enabled || !endpoint || !settings.model) throw new Error('Connect a local LLM from AI Review to enable generated leaf commentary.');
  const evidence = buildArcLeafInsight(node, parent);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.2,
      max_tokens: 220,
      messages: [
        {
          role: 'system',
          content: 'You are an FP&A hierarchy analyst. Use only the supplied node evidence. Explain what is observed, where it sits in the hierarchy, and the next validation step. Never claim causality, never invent a budget, and keep the answer below 90 words.',
        },
        {
          role: 'user',
          content: JSON.stringify({ hierarchyPath: parent ? `${parent.label} → ${node.label}` : node.label, node, verifiedEvidence: evidence.evidence }),
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Local LLM returned ${response.status}.`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; message?: { content?: string }; response?: string };
  const text = payload.choices?.[0]?.message?.content ?? payload.message?.content ?? payload.response ?? '';
  if (!text.trim()) throw new Error('The local LLM returned an empty response.');
  return text.trim();
}

export function HierarchyArcChart({ path, children, loading = false, onOpenNode, onJumpToPath, onReset, title = 'Hierarchy arc explorer' }: {
  path: ArcHierarchyNodeInput[];
  children: ArcHierarchyNodeInput[];
  loading?: boolean;
  onOpenNode?: (node: ArcHierarchyNodeInput) => void;
  onJumpToPath?: (index: number) => void;
  onReset?: () => void;
  title?: string;
}) {
  const focus = path.at(-1) ?? null;
  const [selectedId, setSelectedId] = useState(children[0]?.id ?? focus?.id ?? '');
  const [llmCache, setLlmCache] = useState<Record<string, LocalInsightState>>({});
  const selected = [...path, ...children].find((node) => node.id === selectedId) ?? children[0] ?? focus;
  const parent = selected?.parentId ? [...path, ...children].find((node) => node.id === selected.parentId) ?? focus : focus && selected?.id !== focus.id ? focus : null;
  const layout = useMemo(() => buildArcHierarchyLayout(path, children), [path, children]);

  useEffect(() => {
    if (!selected || llmCache[selected.id]) return;
    const settings = localLlmSettings();
    if (!settings.enabled || !safeLocalEndpoint(settings.endpoint) || !settings.model) return;
    const controller = new AbortController();
    setLlmCache((current) => ({ ...current, [selected.id]: { status: 'loading', text: '' } }));
    generateLocalLeafInsight(selected, parent, controller.signal)
      .then((text) => setLlmCache((current) => ({ ...current, [selected.id]: { status: 'ready', text } })))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLlmCache((current) => ({ ...current, [selected.id]: { status: 'error', text: error instanceof Error ? error.message : String(error) } }));
      });
    return () => controller.abort();
  }, [selected?.id]);

  const option: EChartsOption = useMemo(() => ({
    animationDuration: 550,
    animationDurationUpdate: 650,
    animationEasingUpdate: 'cubicInOut',
    tooltip: {
      confine: true,
      formatter: (params: unknown) => {
        const item = params as { data?: ArcHierarchyNodeInput & { role?: string } };
        const node = item.data;
        if (!node?.id) return '';
        return [
          `<strong>${node.label}</strong>`,
          `${node.levelName || `Level ${node.level}`}`,
          `Value: ${compact(node.amount ?? node.actual)}`,
          node.shareOfParent === null || node.shareOfParent === undefined ? '' : `Share of parent: ${(node.shareOfParent * 100).toFixed(1)}%`,
          node.transactions ? `Records: ${node.transactions.toLocaleString()}` : '',
          node.hasChildren === false ? 'Leaf node · select for insight' : 'Select to open the next branch',
        ].filter(Boolean).join('<br/>');
      },
    },
    toolbox: { right: 8, feature: { restore: {}, saveAsImage: { name: 'hierarchy-arc' } } },
    series: [{
      type: 'graph',
      layout: 'none',
      data: layout.nodes.map((node) => ({
        ...node,
        name: node.label,
        value: node.amount ?? node.actual ?? 0,
        itemStyle: { opacity: selected?.id === node.id ? 1 : 0.86, borderWidth: selected?.id === node.id ? 5 : node.role === 'focus' ? 4 : 2, borderColor: '#111111' },
        label: {
          show: true,
          formatter: node.label.length > 24 ? `${node.label.slice(0, 22)}…` : node.label,
          position: node.role === 'path' || node.role === 'focus' ? 'bottom' : 'right',
          fontWeight: node.role === 'focus' ? 800 : 650,
          fontSize: node.role === 'focus' ? 13 : 11,
          backgroundColor: 'rgba(255,255,255,0.92)',
          borderColor: '#111111',
          borderWidth: 1,
          borderRadius: 7,
          padding: [4, 7],
        },
      })),
      links: layout.links.map((link) => ({ source: link.source, target: link.target, lineStyle: { width: 2.5, opacity: 0.72, curveness: link.curveness } })),
      roam: true,
      draggable: false,
      symbol: 'circle',
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: [0, 7],
      lineStyle: { color: 'source' },
      emphasis: { focus: 'adjacency', lineStyle: { width: 5, opacity: 1 } },
      select: { itemStyle: { borderWidth: 6, borderColor: '#111111' } },
      selectedMode: 'single',
      universalTransition: true,
    }],
  }), [layout, selected?.id]);

  function selectGraphNode(params: ECElementEvent) {
    const id = String((params.data as { id?: string } | undefined)?.id ?? '');
    const node = [...path, ...children].find((candidate) => candidate.id === id);
    if (!node) return;
    setSelectedId(node.id);
    const pathIndex = path.findIndex((candidate) => candidate.id === node.id);
    if (pathIndex >= 0) onJumpToPath?.(pathIndex);
    else if (node.hasChildren !== false) onOpenNode?.(node);
  }

  async function retryLlm() {
    if (!selected) return;
    const controller = new AbortController();
    setLlmCache((current) => ({ ...current, [selected.id]: { status: 'loading', text: '' } }));
    try {
      const text = await generateLocalLeafInsight(selected, parent, controller.signal);
      setLlmCache((current) => ({ ...current, [selected.id]: { status: 'ready', text } }));
    } catch (error) {
      setLlmCache((current) => ({ ...current, [selected.id]: { status: 'error', text: error instanceof Error ? error.message : String(error) } }));
    }
  }

  const builtInInsight = selected ? buildArcLeafInsight(selected, parent) : null;
  const localInsight = selected ? llmCache[selected.id] : undefined;

  return <section className="hierarchy-arc-shell" aria-label={title}>
    <div className="hierarchy-arc-head">
      <div><span className="deck-kicker">DYNAMIC ARC TREE</span><h3>{title}</h3><p>This is an interactive hierarchy visualization—not a machine-learning decision tree. Select a branch to open its children; select a leaf to review evidence and optional local-LLM commentary.</p></div>
      <div className="hierarchy-arc-actions"><button type="button" className="quiet-button" onClick={onReset} disabled={!path.length}>Reset</button></div>
    </div>
    <div className="hierarchy-arc-breadcrumbs" aria-label="Hierarchy path">{path.map((node, index) => <button type="button" key={node.id} onClick={() => onJumpToPath?.(index)}><span>{node.levelName || `Level ${node.level}`}</span><strong>{node.label}</strong></button>)}</div>
    <div className="hierarchy-arc-layout">
      <div className="hierarchy-arc-canvas">
        {loading && <div className="hierarchy-arc-loading">Loading the next hierarchy branch…</div>}
        <EChart option={option} height={520} onClick={selectGraphNode} ariaLabel={`${title}. Current path ${arcNodePathLabel(path)}.`} />
        <div className="hierarchy-arc-help"><span>Tap a node</span><span>Pinch / wheel to zoom</span><span>Drag to move</span><span>Node size = financial share</span></div>
      </div>
      <aside className={`hierarchy-leaf-insight ${builtInInsight?.direction ?? 'unknown'}`}>
        <span className="deck-kicker">LEAF INSIGHT</span>
        {selected && builtInInsight ? <>
          <h4>{selected.label}</h4>
          <p className="leaf-insight-headline">{builtInInsight.headline}</p>
          <p>{builtInInsight.summary}</p>
          <dl>{builtInInsight.evidence.map((item) => <div key={item}><dt>Evidence</dt><dd>{item}</dd></div>)}</dl>
          <div className="leaf-confidence"><span>Evidence confidence</span><strong>{builtInInsight.confidence}</strong></div>
          <div className="leaf-next-step"><span>Next step</span><strong>{builtInInsight.nextQuestion}</strong></div>
          {localInsight?.status === 'loading' && <div className="leaf-llm-status">Local LLM is reviewing this leaf…</div>}
          {localInsight?.status === 'ready' && <div className="leaf-llm-answer"><span>Local LLM commentary</span><p>{localInsight.text}</p></div>}
          {localInsight?.status === 'error' && <div className="leaf-llm-status error"><span>{localInsight.text}</span><button type="button" onClick={retryLlm}>Retry local insight</button></div>}
          {!localInsight && <button type="button" className="leaf-ai-button" onClick={retryLlm}>Generate local AI insight</button>}
          {selected.hasChildren !== false && <button type="button" onClick={() => onOpenNode?.(selected)}>Open this branch →</button>}
        </> : <p>Select a node to review its verified evidence.</p>}
      </aside>
    </div>
  </section>;
}
