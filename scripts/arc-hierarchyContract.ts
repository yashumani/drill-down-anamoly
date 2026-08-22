import type { DataRow, DataValue } from '../src/types';

export interface HierarchyColumnMapping {
  nodeId: string;
  parentNodeId: string;
  nodeLabel?: string;
  hierarchyLevel?: string;
  levelName?: string;
  hierarchyName?: string;
  periodDate?: string;
  actualValue?: string;
  planValue?: string;
}
export type HierarchyMapping = HierarchyColumnMapping;
export type HierarchyContractMapping = HierarchyColumnMapping;
export interface HierarchyContractDetection { detected: boolean; mapping?: HierarchyColumnMapping; missingRequiredColumns: string[]; availableColumns: string[]; confidence: number; warnings: string[]; }
export interface NormalizedHierarchyRow {
  id: string; nodeId: string; parentId: string | null; parentNodeId: string | null; label: string; nodeLabel: string;
  hierarchyLevel: number | null; level: number | null; levelName: string; hierarchyName: string; actual: number;
  plan: number | null; variance: number | null; businessImpact: number | null; rowCount: number; sourceRows: DataRow[];
}
export interface HierarchyTreeNode extends NormalizedHierarchyRow { children: HierarchyTreeNode[]; depth: number; }
export type HierarchyNode = HierarchyTreeNode;
export interface HierarchyIssue { code: 'missing_parent' | 'cycle' | 'self_parent' | 'duplicate_parent' | 'missing_node_id'; severity: 'error' | 'warning'; nodeId?: string; message: string; }
export interface HierarchyForest { roots: HierarchyTreeNode[]; nodes: HierarchyTreeNode[]; nodesById: Map<string, HierarchyTreeNode>; valid: boolean; maxDepth: number; errors: string[]; warnings: string[]; issues: HierarchyIssue[]; }
export type HierarchyForestResult = HierarchyForest;

const REQUIRED_ALIASES = { nodeId: ['node_id', 'nodeid', 'node_key', 'member_id', 'hierarchy_node_id'], parentNodeId: ['parent_node_id', 'parentnodeid', 'parent_id', 'parent_key', 'hierarchy_parent_id'] } as const;
const OPTIONAL_ALIASES = {
  nodeLabel: ['node_label', 'node_name', 'member_name', 'label', 'name'], hierarchyLevel: ['hierarchy_level', 'level_number', 'node_level', 'level'],
  levelName: ['level_name', 'hierarchy_level_name'], hierarchyName: ['hierarchy_name', 'tree_name'], periodDate: ['period_date', 'date', 'month', 'reporting_period'],
  actualValue: ['actual_value', 'actual', 'value', 'amount'], planValue: ['plan_value', 'plan', 'budget', 'target', 'expected'],
} as const;
function normalizedKey(value: string) { return value.trim().toLowerCase().replace(/[\s.-]+/g, '_'); }
function allColumns(rows: DataRow[]) { return [...new Set(rows.flatMap((row) => Object.keys(row)))]; }
function findColumn(columns: string[], aliases: readonly string[]) { const byNormalized = new Map(columns.map((column) => [normalizedKey(column), column])); for (const alias of aliases) { const match = byNormalized.get(normalizedKey(alias)); if (match) return match; } return undefined; }
function text(value: DataValue | undefined) { if (value === null || value === undefined) return ''; return String(value).trim(); }
function finite(value: DataValue | undefined) { if (typeof value === 'number') return Number.isFinite(value) ? value : null; if (typeof value !== 'string') return null; const cleaned = value.trim().replace(/[$,%\s,]/g, ''); if (!cleaned) return null; const parsed = Number(cleaned); return Number.isFinite(parsed) ? parsed : null; }

export function detectHierarchyContract(rows: DataRow[]): HierarchyContractDetection {
  const columns = allColumns(rows); const nodeId = findColumn(columns, REQUIRED_ALIASES.nodeId); const parentNodeId = findColumn(columns, REQUIRED_ALIASES.parentNodeId);
  const missingRequiredColumns = [!nodeId ? 'node_id' : '', !parentNodeId ? 'parent_node_id' : ''].filter(Boolean);
  if (!nodeId || !parentNodeId) return { detected: false, missingRequiredColumns, availableColumns: columns, confidence: 0, warnings: ['Hierarchy is optional. Select or provide both a node identifier and a parent-node identifier to enable it.'] };
  const mapping: HierarchyColumnMapping = { nodeId, parentNodeId, nodeLabel: findColumn(columns, OPTIONAL_ALIASES.nodeLabel), hierarchyLevel: findColumn(columns, OPTIONAL_ALIASES.hierarchyLevel), levelName: findColumn(columns, OPTIONAL_ALIASES.levelName), hierarchyName: findColumn(columns, OPTIONAL_ALIASES.hierarchyName), periodDate: findColumn(columns, OPTIONAL_ALIASES.periodDate), actualValue: findColumn(columns, OPTIONAL_ALIASES.actualValue), planValue: findColumn(columns, OPTIONAL_ALIASES.planValue) };
  return { detected: true, mapping, missingRequiredColumns: [], availableColumns: columns, confidence: mapping.nodeLabel ? 1 : .9, warnings: mapping.nodeLabel ? [] : ['No node label column was detected; node identifiers will be shown as labels.'] };
}

export function normalizeHierarchyRows(rows: DataRow[], mapping: HierarchyColumnMapping): NormalizedHierarchyRow[] {
  const grouped = new Map<string, NormalizedHierarchyRow>();
  for (const row of rows) {
    const nodeId = text(row[mapping.nodeId]); if (!nodeId) continue; const parentText = text(row[mapping.parentNodeId]); const parentNodeId = parentText && parentText !== nodeId ? parentText : parentText || null;
    const actual = mapping.actualValue ? finite(row[mapping.actualValue]) ?? 0 : 0; const planValue = mapping.planValue ? finite(row[mapping.planValue]) : null; const parsedLevel = mapping.hierarchyLevel ? finite(row[mapping.hierarchyLevel]) : null;
    const existing = grouped.get(nodeId);
    if (existing) { existing.actual += actual; existing.plan = existing.plan === null && planValue === null ? null : (existing.plan ?? 0) + (planValue ?? 0); existing.variance = existing.plan === null ? null : existing.actual - existing.plan; existing.businessImpact = existing.variance; existing.rowCount += 1; existing.sourceRows.push(row); continue; }
    const label = mapping.nodeLabel ? text(row[mapping.nodeLabel]) || nodeId : nodeId; const level = parsedLevel === null ? null : Math.max(1, Math.round(parsedLevel));
    grouped.set(nodeId, { id: nodeId, nodeId, parentId: parentNodeId, parentNodeId, label, nodeLabel: label, hierarchyLevel: level, level, levelName: mapping.levelName ? text(row[mapping.levelName]) : '', hierarchyName: mapping.hierarchyName ? text(row[mapping.hierarchyName]) : '', actual, plan: planValue, variance: planValue === null ? null : actual - planValue, businessImpact: planValue === null ? null : actual - planValue, rowCount: 1, sourceRows: [row] });
  }
  return [...grouped.values()];
}
function cloneNode(row: NormalizedHierarchyRow): HierarchyTreeNode { return { ...row, children: [], depth: 1 }; }
export function buildHierarchyForest(rows: NormalizedHierarchyRow[]): HierarchyForest {
  const nodesById = new Map(rows.map((row) => [row.nodeId, cloneNode(row)])); const issues: HierarchyIssue[] = [];
  for (const node of nodesById.values()) { if (!node.parentNodeId) continue; if (node.parentNodeId === node.nodeId) { issues.push({ code: 'self_parent', severity: 'error', nodeId: node.nodeId, message: `${node.label} cannot be its own parent.` }); continue; } if (!nodesById.has(node.parentNodeId)) issues.push({ code: 'missing_parent', severity: 'error', nodeId: node.nodeId, message: `${node.label} references missing parent ${node.parentNodeId}.` }); }
  const visiting = new Set<string>(); const visited = new Set<string>();
  function detectCycle(nodeId: string, trail: string[]) { if (visiting.has(nodeId)) { const start = trail.indexOf(nodeId); const cycle = [...trail.slice(Math.max(0, start)), nodeId]; issues.push({ code: 'cycle', severity: 'error', nodeId, message: `Hierarchy cycle detected: ${cycle.join(' → ')}.` }); return; } if (visited.has(nodeId)) return; visiting.add(nodeId); const parentId = nodesById.get(nodeId)?.parentNodeId; if (parentId && nodesById.has(parentId)) detectCycle(parentId, [...trail, nodeId]); visiting.delete(nodeId); visited.add(nodeId); }
  for (const nodeId of nodesById.keys()) detectCycle(nodeId, []);
  const invalidNodes = new Set(issues.filter((issue) => issue.severity === 'error').map((issue) => issue.nodeId).filter(Boolean) as string[]);
  for (const node of nodesById.values()) { if (!node.parentNodeId || invalidNodes.has(node.nodeId)) continue; const parent = nodesById.get(node.parentNodeId); if (parent && !invalidNodes.has(parent.nodeId)) parent.children.push(node); }
  const roots = [...nodesById.values()].filter((node) => !node.parentNodeId || !nodesById.has(node.parentNodeId) || invalidNodes.has(node.nodeId)); let maxDepth = 0; const seen = new Set<string>();
  function assignDepth(node: HierarchyTreeNode, depth: number) { if (seen.has(node.nodeId)) return; seen.add(node.nodeId); node.depth = depth; if (node.hierarchyLevel === null) { node.hierarchyLevel = depth; node.level = depth; } maxDepth = Math.max(maxDepth, depth); node.children.sort((left, right) => Math.abs(right.actual) - Math.abs(left.actual) || left.label.localeCompare(right.label)); node.children.forEach((child) => assignDepth(child, depth + 1)); }
  roots.sort((left, right) => Math.abs(right.actual) - Math.abs(left.actual) || left.label.localeCompare(right.label)); roots.forEach((root) => assignDepth(root, 1));
  const errors = issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message); const warnings = issues.filter((issue) => issue.severity === 'warning').map((issue) => issue.message);
  return { roots, nodes: [...nodesById.values()], nodesById, valid: errors.length === 0 && roots.length > 0, maxDepth, errors, warnings, issues };
}
export function hierarchyTemplateCsv() { return ['hierarchy_name,node_id,parent_node_id,node_label,hierarchy_level,level_name,period_date,actual_value,plan_value','Enterprise LOB,ENT,,Enterprise,1,Enterprise,2026-01-31,1250000,1300000','Enterprise LOB,LOB-WIRELESS,ENT,Wireless,2,LOB,2026-01-31,760000,790000','Enterprise LOB,REGION-WEST,LOB-WIRELESS,West,3,Region,2026-01-31,290000,310000','Enterprise LOB,MARKET-LA,REGION-WEST,Los Angeles,4,Market,2026-01-31,135000,150000'].join('\n'); }
export function downloadHierarchyTemplate(filename = 'finance-hierarchy-template.csv') { if (typeof document === 'undefined') return hierarchyTemplateCsv(); const blob = new Blob([hierarchyTemplateCsv()], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); return filename; }
export const downloadHierarchyDataTemplate = downloadHierarchyTemplate;
