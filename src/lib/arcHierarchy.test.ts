import { describe, expect, it } from 'vitest';
import { buildArcHierarchyLayout, buildArcLeafInsight } from './arcHierarchy';

describe('arc hierarchy layout', () => {
  it('places the current path before curved child branches', () => {
    const layout = buildArcHierarchyLayout(
      [{ id: 'root', label: 'Enterprise', level: 1, amount: 1000, hasChildren: true }],
      [
        { id: 'a', parentId: 'root', label: 'Wireless', level: 2, amount: 600, shareOfParent: 0.6, hasChildren: true },
        { id: 'b', parentId: 'root', label: 'Fiber', level: 2, amount: 400, shareOfParent: 0.4, hasChildren: false },
      ],
      900,
      500,
    );
    expect(layout.nodes).toHaveLength(3);
    expect(layout.links).toHaveLength(2);
    expect(layout.nodes.find((node) => node.id === 'root')?.role).toBe('focus');
    expect(layout.nodes.find((node) => node.id === 'b')?.role).toBe('leaf');
    expect(layout.links.every((link) => Number.isFinite(link.curveness))).toBe(true);
  });

  it('creates evidence-grounded leaf language without causal claims', () => {
    const insight = buildArcLeafInsight({ id: 'leaf', label: 'West', level: 3, levelName: 'Region', amount: 290, expected: 310, businessImpact: -20, transactions: 150, shareOfParent: 0.29, hasChildren: false });
    expect(insight.direction).toBe('unfavorable');
    expect(insight.confidence).toBe('high');
    expect(insight.summary).toContain('29.0%');
    expect(insight.summary.toLowerCase()).not.toContain('caused');
  });
});
