import { describe, expect, it } from 'vitest';
import {
  buildHierarchyForest,
  detectHierarchyContract,
  hierarchyTemplateCsv,
  normalizeHierarchyRows,
} from './hierarchyContract';

describe('hierarchy data contract', () => {
  it('detects the two required relationship columns and builds a ten-level chain', () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      node_id: `N${index + 1}`,
      parent_node_id: index === 0 ? '' : `N${index}`,
      node_label: `Level ${index + 1}`,
      hierarchy_level: index + 1,
      actual_value: 100 - index,
      plan_value: 95 - index,
    }));
    const detection = detectHierarchyContract(rows);
    expect(detection.detected).toBe(true);
    expect(detection.mapping?.nodeId).toBe('node_id');
    expect(detection.mapping?.parentNodeId).toBe('parent_node_id');

    const normalized = normalizeHierarchyRows(rows, detection.mapping!);
    const forest = buildHierarchyForest(normalized);
    expect(forest.nodeCount).toBe(10);
    expect(forest.roots).toHaveLength(1);
    let cursor = forest.roots[0];
    for (let level = 1; level <= 10; level += 1) {
      expect(cursor.level).toBe(level);
      if (level < 10) cursor = cursor.children[0];
    }
  });

  it('does not enable hierarchy when a parent relationship is missing', () => {
    const detection = detectHierarchyContract([{ node_id: 'ROOT', node_label: 'Root' }]);
    expect(detection.detected).toBe(false);
    expect(detection.missingRequiredColumns).toContain('parent_node_id');
  });

  it('flags missing parents and cycles instead of silently accepting invalid structure', () => {
    const mapping = { nodeId: 'node_id', parentNodeId: 'parent_node_id', nodeLabel: 'node_label' };
    const missingParent = buildHierarchyForest(normalizeHierarchyRows([
      { node_id: 'A', parent_node_id: 'UNKNOWN', node_label: 'A' },
    ], mapping));
    expect(missingParent.warnings.join(' ')).toContain('missing parent');

    const cycle = buildHierarchyForest(normalizeHierarchyRows([
      { node_id: 'A', parent_node_id: 'B', node_label: 'A' },
      { node_id: 'B', parent_node_id: 'A', node_label: 'B' },
    ], mapping));
    expect(cycle.hasCycle).toBe(true);
  });

  it('ships a downloadable finance hierarchy template', () => {
    const template = hierarchyTemplateCsv();
    expect(template).toContain('node_id,parent_node_id');
    expect(template).toContain('actual_value,plan_value');
  });
});
