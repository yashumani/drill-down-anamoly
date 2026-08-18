import type { DataRow } from '../types';

export const HIERARCHY_PARENT_FIELD = 'hierarchy_parent';
export const HIERARCHY_CHILD_FIELD = 'hierarchy_child';
export const MAX_HIERARCHY_LEVELS = 10;

export interface HierarchyLevelDefinition {
  field: string;
  label: string;
  description?: string;
}

export interface HierarchyPathItem extends HierarchyLevelDefinition {
  value: string;
}

export interface HierarchyEdge {
  hierarchy_parent: string;
  hierarchy_child: string;
  parentField: string;
  childField: string;
  depth: number;
}

export interface HierarchyValidation {
  valid: boolean;
  levels: HierarchyLevelDefinition[];
  warnings: string[];
}

const missingTokens = new Set(['', '(missing)', '(null)', 'null', 'undefined']);

export function hierarchyValue(value: unknown) {
  const normalized = String(value ?? '').trim();
  return missingTokens.has(normalized.toLowerCase()) ? '' : normalized;
}

export function hierarchyPathKey(path: readonly HierarchyPathItem[]) {
  return path.length
    ? path.map((item) => `${encodeURIComponent(item.field)}=${encodeURIComponent(item.value)}`).join('&')
    : 'root';
}

export function validateHierarchyLevels(
  levels: readonly HierarchyLevelDefinition[],
  availableFields?: readonly string[],
): HierarchyValidation {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const available = availableFields ? new Set(availableFields) : null;
  const normalized: HierarchyLevelDefinition[] = [];

  for (const level of levels.slice(0, MAX_HIERARCHY_LEVELS)) {
    const field = level.field.trim();
    if (!field) continue;
    if (seen.has(field)) {
      warnings.push(`${level.label || field} is repeated and was removed from the hierarchy.`);
      continue;
    }
    if (available && !available.has(field)) {
      warnings.push(`${level.label || field} is not available in this dataset and was removed.`);
      continue;
    }
    seen.add(field);
    normalized.push({ ...level, field, label: level.label.trim() || field });
  }

  if (levels.length > MAX_HIERARCHY_LEVELS) {
    warnings.push(`Only the first ${MAX_HIERARCHY_LEVELS} hierarchy levels are used.`);
  }
  if (normalized.length < 2) {
    warnings.push('Select at least two distinct dimensions to create a parent-child hierarchy.');
  }

  return { valid: normalized.length >= 2, levels: normalized, warnings };
}

export function rowHierarchyPath(row: DataRow, levels: readonly HierarchyLevelDefinition[]) {
  const path: HierarchyPathItem[] = [];
  let stopped = false;
  for (const level of levels) {
    const value = hierarchyValue(row[level.field]);
    if (!value) {
      stopped = true;
      continue;
    }
    if (stopped) break;
    path.push({ ...level, value });
  }
  return path;
}

export function hierarchyEdgesFromPath(path: readonly HierarchyPathItem[], rootLabel = 'All data'): HierarchyEdge[] {
  return path.map((item, index) => {
    const parent = index === 0 ? rootLabel : path[index - 1].value;
    const parentField = index === 0 ? '__root__' : path[index - 1].field;
    return {
      hierarchy_parent: parent,
      hierarchy_child: item.value,
      parentField,
      childField: item.field,
      depth: index + 1,
    };
  });
}

export function hierarchyEdgesFromRows(
  rows: readonly DataRow[],
  levels: readonly HierarchyLevelDefinition[],
  rootLabel = 'All data',
) {
  const unique = new Map<string, HierarchyEdge>();
  for (const row of rows) {
    for (const edge of hierarchyEdgesFromPath(rowHierarchyPath(row, levels), rootLabel)) {
      const key = `${edge.depth}\u0000${edge.parentField}\u0000${edge.hierarchy_parent}\u0000${edge.childField}\u0000${edge.hierarchy_child}`;
      unique.set(key, edge);
    }
  }
  return [...unique.values()].sort((left, right) => left.depth - right.depth
    || left.hierarchy_parent.localeCompare(right.hierarchy_parent)
    || left.hierarchy_child.localeCompare(right.hierarchy_child));
}
