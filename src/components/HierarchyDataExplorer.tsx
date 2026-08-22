import { useEffect, useMemo, useState } from 'react';
import type { DataRow } from '../types';
import { buildHierarchyForest, detectHierarchyContract, downloadHierarchyTemplate, normalizeHierarchyRows } from '../lib/hierarchyContract';
import type { HierarchyColumnMapping, HierarchyTreeNode } from '../lib/hierarchyContract';
import type { ArcHierarchyNodeInput } from '../lib/arcHierarchy';
import { HierarchyArcChart } from './HierarchyArcChart';

function fieldNames(rows: DataRow[]) { return [...new Set(rows.flatMap((row) => Object.keys(row)))].sort((left, right) => left.localeCompare(right)); }
function toArc(node: HierarchyTreeNode, parent?: HierarchyTreeNode | null): ArcHierarchyNodeInput {
  const parentActual = parent ? Math.abs(parent.actual) : 0;
  return { id: node.nodeId, label: node.label, level: node.depth, levelName: node.levelName || `Level ${node.depth}`, parentId: node.parentNodeId, amount: node.actual, actual: node.actual, expected: node.plan, businessImpact: node.businessImpact, transactions: node.rowCount, shareOfParent: parentActual ? node.actual / parentActual : null, hasChildren: node.children.length > 0 };
}

export function HierarchyDataExplorer({ rows }: { rows: DataRow[] }) {
  const columns = useMemo(() => fieldNames(rows), [rows]);
  const detection = useMemo(() => detectHierarchyContract(rows), [rows]);
  const [mapping, setMapping] = useState<HierarchyColumnMapping | null>(detection.mapping ?? null);
  const [configured, setConfigured] = useState(Boolean(detection.mapping));
  const [pathIds, setPathIds] = useState<string[]>([]);

  useEffect(() => { setMapping(detection.mapping ?? null); setConfigured(Boolean(detection.mapping)); setPathIds([]); }, [rows, detection.mapping?.nodeId, detection.mapping?.parentNodeId]);
  const forest = useMemo(() => !configured || !mapping?.nodeId || !mapping.parentNodeId ? null : buildHierarchyForest(normalizeHierarchyRows(rows, mapping)), [rows, configured, mapping]);
  useEffect(() => { if (!forest?.roots.length) return; setPathIds((current) => current.length && forest.nodesById.has(current[0]) ? current : [forest.roots[0].nodeId]); }, [forest]);

  const pathNodes = pathIds.map((id) => forest?.nodesById.get(id)).filter(Boolean) as HierarchyTreeNode[];
  const current = pathNodes.at(-1) ?? forest?.roots[0] ?? null;
  const arcPath = pathNodes.map((node, index) => toArc(node, index > 0 ? pathNodes[index - 1] : null));
  const arcChildren = current?.children.map((child) => toArc(child, current)) ?? [];

  function setMappingField(field: keyof HierarchyColumnMapping, value: string) {
    setMapping((currentMapping) => ({ nodeId: currentMapping?.nodeId ?? '', parentNodeId: currentMapping?.parentNodeId ?? '', ...currentMapping, [field]: value || undefined }));
    setConfigured(false);
  }

  if (!configured || !mapping) return <section className="hierarchy-mapping-card" aria-label="Prepare parent child hierarchy">
    <div className="hierarchy-mapping-intro"><span className="deck-kicker">OPTIONAL HIERARCHY SETUP</span><h3>Map the parent and child columns once.</h3><p>Hierarchy is shown only when the data contains a stable node identifier and a parent-node identifier. Flat dimensional analysis continues normally when those fields are unavailable.</p></div>
    <div className="hierarchy-mapping-grid">
      <label>Node / child ID<select value={mapping?.nodeId ?? ''} onChange={(event) => setMappingField('nodeId', event.target.value)}><option value="">Choose column</option>{columns.map((column) => <option key={column} value={column}>{column}</option>)}</select></label>
      <label>Parent node ID<select value={mapping?.parentNodeId ?? ''} onChange={(event) => setMappingField('parentNodeId', event.target.value)}><option value="">Choose column</option>{columns.map((column) => <option key={column} value={column}>{column}</option>)}</select></label>
      <label>Node label<select value={mapping?.nodeLabel ?? ''} onChange={(event) => setMappingField('nodeLabel', event.target.value)}><option value="">Use node ID</option>{columns.map((column) => <option key={column} value={column}>{column}</option>)}</select></label>
      <label>Actual value<select value={mapping?.actualValue ?? ''} onChange={(event) => setMappingField('actualValue', event.target.value)}><option value="">No measure</option>{columns.map((column) => <option key={column} value={column}>{column}</option>)}</select></label>
      <label>Plan / target<select value={mapping?.planValue ?? ''} onChange={(event) => setMappingField('planValue', event.target.value)}><option value="">No plan</option>{columns.map((column) => <option key={column} value={column}>{column}</option>)}</select></label>
      <label>Level name<select value={mapping?.levelName ?? ''} onChange={(event) => setMappingField('levelName', event.target.value)}><option value="">Derive levels</option>{columns.map((column) => <option key={column} value={column}>{column}</option>)}</select></label>
    </div>
    <div className="hierarchy-mapping-actions"><button type="button" onClick={() => setConfigured(true)} disabled={!mapping?.nodeId || !mapping?.parentNodeId}>Build arc hierarchy</button><button type="button" className="quiet-button" onClick={() => downloadHierarchyTemplate()}>Download hierarchy template</button></div>
    {detection.missingRequiredColumns.length > 0 && <small>Automatic detection did not find: {detection.missingRequiredColumns.join(', ')}.</small>}
  </section>;

  if (!forest || !forest.roots.length) return <section className="hierarchy-mapping-card"><strong>Hierarchy could not be created.</strong><p>{forest?.errors.join(' ') || 'No valid root node was found.'}</p><button type="button" onClick={() => setConfigured(false)}>Review column mapping</button></section>;

  return <section className="uploaded-hierarchy-explorer">
    <div className="uploaded-hierarchy-toolbar"><div><span className="deck-kicker">UPLOADED DATA HIERARCHY</span><strong>{forest.nodes.length.toLocaleString()} nodes · {forest.maxDepth} levels · {forest.roots.length} root{forest.roots.length === 1 ? '' : 's'}</strong></div><div><label>Root<select value={pathIds[0] ?? ''} onChange={(event) => setPathIds([event.target.value])}>{forest.roots.map((root) => <option key={root.nodeId} value={root.nodeId}>{root.label}</option>)}</select></label><button type="button" className="quiet-button" onClick={() => setConfigured(false)}>Change columns</button></div></div>
    {forest.errors.length > 0 && <div className="hierarchy-query-warning"><strong>Hierarchy validation issues</strong><span>{forest.errors.join(' ')}</span></div>}
    <HierarchyArcChart path={arcPath} children={arcChildren} onOpenNode={(node) => setPathIds((currentPath) => [...currentPath, node.id])} onJumpToPath={(index) => setPathIds((currentPath) => currentPath.slice(0, index + 1))} onReset={() => setPathIds([forest.roots[0].nodeId])} title="Uploaded data hierarchy arc" />
  </section>;
}
