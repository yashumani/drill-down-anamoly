import { useEffect, useMemo, useState } from 'react';
import { HierarchyArcChart } from './HierarchyArcChart';
import type { ArcHierarchyNodeInput } from '../lib/arcHierarchy';
import { buildScopeWhere, buildSodaUrl, escapeSoqlLiteral } from '../lib/livePublicFinance';
import type { LiveDemoScope, LivePublicFinanceResult } from '../lib/livePublicFinance';

interface ArcLevel { level: number; name: string; field: string | null; virtual?: boolean; }

const LIVE_ARC_LEVELS: readonly ArcLevel[] = [
  { level: 1, name: 'Enterprise', field: null, virtual: true },
  { level: 2, name: 'Line of Business', field: null, virtual: true },
  { level: 3, name: 'Department', field: 'department_name' },
  { level: 4, name: 'Government Activity', field: 'government_activity' },
  { level: 5, name: 'Fund Group', field: 'fund_group_name' },
  { level: 6, name: 'Fund Type', field: 'fund_type' },
  { level: 7, name: 'Fund', field: 'fund_name' },
  { level: 8, name: 'Account', field: 'account_name' },
  { level: 9, name: 'Expenditure Type', field: 'expenditure_type' },
  { level: 10, name: 'Vendor', field: 'vendor_name' },
] as const;

function nodeId(level: number, value: string) {
  return `${level}:${value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

function initialPath(result: LivePublicFinanceResult): ArcHierarchyNodeInput[] {
  return [
    { id: '1:city-of-los-angeles', label: 'City of Los Angeles', level: 1, levelName: 'Enterprise', parentId: null, amount: result.scopedSource.totalAmount, transactions: result.scopedSource.rowCount, shareOfParent: 1, hasChildren: true, virtual: true },
    { id: '2:procurement-payments', label: 'Procurement Payments', level: 2, levelName: 'Line of Business', parentId: '1:city-of-los-angeles', amount: result.scopedSource.totalAmount, transactions: result.scopedSource.rowCount, shareOfParent: 1, hasChildren: true, virtual: true },
  ];
}

async function readChildren({ result, scope, path, appToken, signal }: {
  result: LivePublicFinanceResult;
  scope: LiveDemoScope;
  path: ArcHierarchyNodeInput[];
  appToken: string;
  signal: AbortSignal;
}) {
  const currentLevel = path.at(-1)?.level ?? 2;
  const next = LIVE_ARC_LEVELS.find((level) => level.level === currentLevel + 1);
  if (!next?.field) return [];
  const parent = path.at(-1)!;
  const clauses = [buildScopeWhere(scope, result.fullSource, null)];
  for (const node of path) {
    const definition = LIVE_ARC_LEVELS.find((level) => level.level === node.level);
    if (definition?.field && node.label !== 'Other categories') clauses.push(`${definition.field} = '${escapeSoqlLiteral(node.label)}'`);
  }
  clauses.push(`${next.field} is not null`);
  const url = buildSodaUrl({
    select: `${next.field} as value, sum(dollar_amount) as amount, count(*) as transactions`,
    where: clauses.join(' AND '),
    group: next.field,
    order: 'sum(dollar_amount) DESC',
    limit: 9,
  });
  const response = await fetch(url, { headers: { Accept: 'application/json', ...(appToken.trim() ? { 'X-App-Token': appToken.trim() } : {}) }, signal });
  if (!response.ok) throw new Error(`Hierarchy branch query returned ${response.status}.`);
  const rows = await response.json() as Array<{ value?: string; amount?: string | number; transactions?: string | number }>;
  const parentAmount = Math.abs(Number(parent.amount ?? 0));
  return rows.map((row) => {
    const label = String(row.value ?? '(missing)');
    const amount = Number(row.amount ?? 0);
    const transactions = Number(row.transactions ?? 0);
    return { id: nodeId(next.level, label), label, level: next.level, levelName: next.name, parentId: parent.id, amount, transactions, shareOfParent: parentAmount ? amount / parentAmount : null, hasChildren: next.level < LIVE_ARC_LEVELS.length } satisfies ArcHierarchyNodeInput;
  });
}

export function LiveHierarchyArcExplorer({ result, scope, appToken }: { result: LivePublicFinanceResult; scope: LiveDemoScope; appToken: string }) {
  const [path, setPath] = useState<ArcHierarchyNodeInput[]>(() => initialPath(result));
  const [children, setChildren] = useState<ArcHierarchyNodeInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pathKey = path.map((node) => node.id).join('|');

  useEffect(() => { setPath(initialPath(result)); }, [result.scope, result.scopedSource.rowCount, result.scopedSource.totalAmount]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    readChildren({ result, scope, path, appToken, signal: controller.signal })
      .then(setChildren)
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setChildren([]);
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [result, scope, pathKey, appToken]);

  const currentLevel = path.at(-1)?.level ?? 2;
  const levelSummary = useMemo(() => LIVE_ARC_LEVELS.map((level) => ({ ...level, complete: level.level <= currentLevel, current: level.level === currentLevel })), [currentLevel]);

  return <section className="live-hierarchy-arc-explorer">
    <div className="live-hierarchy-level-rail" aria-label="Ten hierarchy levels">{levelSummary.map((level) => <div key={level.level} className={`${level.complete ? 'complete' : ''} ${level.current ? 'current' : ''}`}><span>{String(level.level).padStart(2, '0')}</span><strong>{level.name}</strong>{level.virtual && <small>demo root</small>}</div>)}</div>
    {error && <div className="hierarchy-query-warning"><strong>Live branch unavailable.</strong><span>{error}</span><small>Retry the branch, add an optional Socrata token, or use the org-chart view.</small></div>}
    <HierarchyArcChart
      path={path}
      children={children}
      loading={loading}
      onOpenNode={(node) => node.hasChildren !== false && setPath((current) => [...current, node])}
      onJumpToPath={(index) => setPath((current) => current.slice(0, Math.max(1, index + 1)))}
      onReset={() => setPath(initialPath(result))}
      title="Live procurement hierarchy arc"
    />
    <div className="hierarchy-source-note"><strong>Source behavior</strong><span>Each branch is grouped and summed by the public Socrata service. The browser receives only the current node and its immediate children.</span></div>
  </section>;
}
