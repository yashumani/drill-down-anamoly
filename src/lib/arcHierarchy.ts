export interface ArcHierarchyNodeInput {
  id: string;
  label: string;
  level: number;
  levelName?: string;
  parentId?: string | null;
  amount?: number;
  actual?: number;
  expected?: number | null;
  businessImpact?: number | null;
  transactions?: number;
  shareOfParent?: number | null;
  hasChildren?: boolean;
  virtual?: boolean;
}

export interface ArcHierarchyNode extends ArcHierarchyNodeInput {
  x: number;
  y: number;
  symbolSize: number;
  role: 'path' | 'focus' | 'child' | 'leaf';
}

export interface ArcHierarchyLink {
  source: string;
  target: string;
  curveness: number;
}

export interface ArcHierarchyLayout {
  nodes: ArcHierarchyNode[];
  links: ArcHierarchyLink[];
  width: number;
  height: number;
}

export interface ArcLeafInsight {
  headline: string;
  summary: string;
  evidence: string[];
  nextQuestion: string;
  confidence: 'high' | 'medium' | 'low';
  direction: 'favorable' | 'unfavorable' | 'neutral' | 'unknown';
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function buildArcHierarchyLayout(
  path: ArcHierarchyNodeInput[],
  children: ArcHierarchyNodeInput[],
  width = 960,
  height = 520,
): ArcHierarchyLayout {
  const safeWidth = Math.max(320, width);
  const safeHeight = Math.max(320, height);
  const focus = path.at(-1) ?? {
    id: 'root',
    label: 'All data',
    level: 0,
    amount: children.reduce((sum, child) => sum + finite(child.amount ?? child.actual), 0),
    transactions: children.reduce((sum, child) => sum + finite(child.transactions), 0),
    hasChildren: Boolean(children.length),
  };

  const pathNodes = path.length ? path : [focus];
  const pathStartX = Math.max(70, safeWidth * 0.08);
  const focusX = safeWidth * 0.36;
  const centerY = safeHeight * 0.53;
  const pathGap = pathNodes.length <= 1 ? 0 : (focusX - pathStartX) / Math.max(1, pathNodes.length - 1);
  const amounts = children.map((child) => Math.abs(finite(child.amount ?? child.actual)));
  const maxAmount = Math.max(1, ...amounts);
  const nodes: ArcHierarchyNode[] = pathNodes.map((node, index) => ({
    ...node,
    x: pathStartX + pathGap * index,
    y: centerY,
    symbolSize: index === pathNodes.length - 1 ? 58 : 34,
    role: index === pathNodes.length - 1 ? 'focus' : 'path',
  }));

  const links: ArcHierarchyLink[] = [];
  for (let index = 1; index < pathNodes.length; index += 1) {
    links.push({ source: pathNodes[index - 1].id, target: pathNodes[index].id, curveness: 0.12 });
  }

  const childCenterX = safeWidth * 0.72;
  const radiusX = Math.max(120, safeWidth * 0.24);
  const radiusY = Math.max(120, safeHeight * 0.38);
  const count = Math.max(1, children.length);
  children.forEach((child, index) => {
    const ratio = count === 1 ? 0.5 : index / (count - 1);
    const angle = -Math.PI * 0.43 + ratio * Math.PI * 0.86;
    const amount = Math.abs(finite(child.amount ?? child.actual));
    const symbolSize = clamp(24 + Math.sqrt(amount / maxAmount) * 34, 26, 62);
    nodes.push({
      ...child,
      x: childCenterX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
      symbolSize,
      role: child.hasChildren === false ? 'leaf' : 'child',
    });
    links.push({
      source: focus.id,
      target: child.id,
      curveness: clamp((ratio - 0.5) * 0.55, -0.28, 0.28),
    });
  });

  return { nodes, links, width: safeWidth, height: safeHeight };
}

export function buildArcLeafInsight(node: ArcHierarchyNodeInput, parent?: ArcHierarchyNodeInput | null): ArcLeafInsight {
  const amount = finite(node.amount ?? node.actual);
  const expected = node.expected === null || node.expected === undefined ? null : finite(node.expected);
  const impact = node.businessImpact === null || node.businessImpact === undefined
    ? expected === null ? null : amount - expected
    : finite(node.businessImpact);
  const share = node.shareOfParent ?? (parent && finite(parent.amount ?? parent.actual) !== 0
    ? amount / Math.abs(finite(parent.amount ?? parent.actual))
    : null);
  const transactions = finite(node.transactions);
  const direction: ArcLeafInsight['direction'] = impact === null
    ? 'unknown'
    : impact > 0
      ? 'favorable'
      : impact < 0
        ? 'unfavorable'
        : 'neutral';
  const materialShare = share !== null && Math.abs(share) >= 0.2;
  const highEvidence = transactions >= 100 || materialShare;
  const confidence: ArcLeafInsight['confidence'] = highEvidence ? 'high' : transactions >= 20 || share !== null ? 'medium' : 'low';
  const level = node.levelName || `Level ${node.level}`;
  const parentText = parent ? ` within ${parent.label}` : '';

  const headline = impact === null
    ? `${node.label} represents ${share === null ? 'a measurable branch' : `${(share * 100).toFixed(1)}% of its parent`}.`
    : `${node.label} is ${Math.abs(impact).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${direction} at ${level}.`;
  const summary = `${node.label}${parentText} contains ${amount.toLocaleString(undefined, { maximumFractionDigits: 1 })} in observed value${transactions ? ` across ${transactions.toLocaleString()} records` : ''}.${share === null ? '' : ` It represents ${(share * 100).toFixed(1)}% of the parent branch.`}`;
  const evidence = [
    `${level}: ${node.label}`,
    `Observed value: ${amount.toLocaleString(undefined, { maximumFractionDigits: 1 })}`,
    ...(expected === null ? [] : [`Expected value: ${expected.toLocaleString(undefined, { maximumFractionDigits: 1 })}`]),
    ...(impact === null ? [] : [`Business impact: ${impact.toLocaleString(undefined, { maximumFractionDigits: 1 })} (${direction})`]),
    ...(share === null ? [] : [`Share of parent: ${(share * 100).toFixed(1)}%`]),
    ...(transactions ? [`Records / transactions: ${transactions.toLocaleString()}`] : []),
  ];
  const nextQuestion = node.hasChildren === false
    ? `Compare ${node.label} with peer leaves and review the supporting records.`
    : `Open ${node.label} to identify which next-level branch explains the movement.`;

  return { headline, summary, evidence, nextQuestion, confidence, direction };
}

export function arcNodePathLabel(nodes: ArcHierarchyNodeInput[]) {
  return nodes.map((node) => node.label).join(' → ');
}
