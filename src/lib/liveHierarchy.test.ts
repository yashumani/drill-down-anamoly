import { describe, expect, it } from 'vitest';
import {
  buildLiveHierarchyWhere,
  createInitialLiveHierarchyPath,
  LIVE_FINANCE_HIERARCHY,
  nextLiveHierarchyLevel,
} from './liveHierarchy';

describe('live finance hierarchy', () => {
  it('defines a ten-level analytical path with two virtual roots and eight live fields', () => {
    expect(LIVE_FINANCE_HIERARCHY).toHaveLength(10);
    expect(LIVE_FINANCE_HIERARCHY[0].constantValue).toBe('City of Los Angeles');
    expect(LIVE_FINANCE_HIERARCHY[1].label).toBe('Line of Business');
    expect(LIVE_FINANCE_HIERARCHY.slice(2).every((level) => Boolean(level.field))).toBe(true);
    expect(new Set(LIVE_FINANCE_HIERARCHY.slice(2).map((level) => level.field)).size).toBe(8);
  });

  it('starts at the enterprise and LOB roots before querying Department', () => {
    const path = createInitialLiveHierarchyPath(1_000_000, 250_000);
    expect(path).toHaveLength(2);
    expect(path[0].parentNodeId).toBeNull();
    expect(path[1].parentNodeId).toBe(path[0].nodeId);
    expect(nextLiveHierarchyLevel(path)?.field).toBe('department_name');
  });

  it('builds a scope-aware and safely escaped parent-child query', () => {
    const path = createInitialLiveHierarchyPath(1_000_000, 250_000);
    path.push({
      nodeId: 'department-1',
      parentNodeId: path[1].nodeId,
      levelIndex: 2,
      levelId: 'department',
      levelLabel: 'Department',
      field: 'department_name',
      value: "Mayor's Office",
      amount: 125_000,
      transactions: 400,
      shareOfParent: 0.125,
      drillable: true,
    });
    const where = buildLiveHierarchyWhere('current_fy', {
      maxDate: '2026-07-31T00:00:00.000',
      maxFiscalYear: '2026',
    }, null, path);
    expect(where).toContain("fiscal_year = '2026'");
    expect(where).toContain("department_name = 'Mayor''s Office'");
  });
});
