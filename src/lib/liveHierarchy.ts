import {
  buildScopeWhere,
  buildSodaUrl,
  escapeSoqlLiteral,
} from './livePublicFinance';
import type {
  LiveDemoFilter,
  LiveDemoScope,
  LiveSourceSummary,
} from './livePublicFinance';

export interface LiveHierarchyLevel {
  id: string;
  label: string;
  description: string;
  field?: string;
  constantValue?: string;
}

export interface LiveHierarchyPathItem {
  nodeId: string;
  parentNodeId: string | null;
  levelIndex: number;
  levelId: string;
  levelLabel: string;
  field?: string;
  value: string;
  amount: number;
  transactions: number;
  shareOfParent: number;
  drillable: boolean;
}

export interface LiveHierarchyChildrenResult {
  level: LiveHierarchyLevel | null;
  parentNodeId: string;
  children: LiveHierarchyPathItem[];
  queryDurationMs: number;
  requestCount: number;
  topCategoriesOnly: boolean;
  warning?: string;
}

export const LIVE_FINANCE_HIERARCHY: readonly LiveHierarchyLevel[] = [
  { id: 'enterprise', label: 'Enterprise', description: 'The root of the analytical hierarchy.', constantValue: 'City of Los Angeles' },
  { id: 'lob', label: 'Line of Business', description: 'A business-facing analytical branch.', constantValue: 'Procurement Payments' },
  { id: 'department', label: 'Department', description: 'City department, bureau, or office.', field: 'department_name' },
  { id: 'activity', label: 'Government Activity', description: 'Operational activity associated with the expenditure.', field: 'government_activity' },
  { id: 'fund-group', label: 'Fund Group', description: 'High-level source-of-funds grouping.', field: 'fund_group_name' },
  { id: 'fund-type', label: 'Fund Type', description: 'Financial classification of the fund.', field: 'fund_type' },
  { id: 'fund', label: 'Fund', description: 'Named fund that financed the payment.', field: 'fund_name' },
  { id: 'account', label: 'Account', description: 'General-ledger account or spending category.', field: 'account_name' },
  { id: 'expenditure', label: 'Expenditure Type', description: 'Procurement expenditure classification.', field: 'expenditure_type' },
  { id: 'vendor', label: 'Vendor', description: 'Payee or supplier receiving the payment.', field: 'vendor_name' },
] as const;

const HIERARCHY_FIELDS = new Set(LIVE_FINANCE_HIERARCHY.map((level) => level.field).filter(Boolean));
const TOP_CHILDREN = 7;

function delay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      globalThis.clearTimeout(timer);
      reject(new Error('Hierarchy query was cancelled.'));
    }, { once: true });
  });
}

async function fetchHierarchyJson<T>(url: string, appToken = '', signal?: AbortSignal): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 35_000);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          ...(appToken.trim() ? { 'X-App-Token': appToken.trim() } : {}),
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        const message = await response.text();
        if ((response.status === 429 || response.status >= 500) && attempt === 0) {
          lastError = new Error(`Hierarchy API returned ${response.status}: ${message.slice(0, 180)}`);
          await delay(700, signal);
          continue;
        }
        throw new Error(`Hierarchy API returned ${response.status}: ${message.slice(0, 220)}`);
      }
      return await response.json() as T;
    } catch (error) {
      if (signal?.aborted) throw new Error('Hierarchy query was cancelled.');
      lastError = controller.signal.aborted
        ? new Error('The hierarchy query timed out after 35 seconds.')
        : error;
      if (attempt === 0) await delay(500, signal);
    } finally {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function stableNodeId(parentNodeId: string | null, levelId: string, value: string) {
  let hash = 2166136261;
  const source = `${parentNodeId ?? 'root'}|${levelId}|${value}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${levelId}-${(hash >>> 0).toString(36)}`;
}

export function createInitialLiveHierarchyPath(totalAmount: number, transactions: number): LiveHierarchyPathItem[] {
  const rootLevel = LIVE_FINANCE_HIERARCHY[0];
  const lobLevel = LIVE_FINANCE_HIERARCHY[1];
  const root: LiveHierarchyPathItem = {
    nodeId: stableNodeId(null, rootLevel.id, rootLevel.constantValue ?? rootLevel.label),
    parentNodeId: null,
    levelIndex: 0,
    levelId: rootLevel.id,
    levelLabel: rootLevel.label,
    value: rootLevel.constantValue ?? rootLevel.label,
    amount: totalAmount,
    transactions,
    shareOfParent: 1,
    drillable: true,
  };
  const lob: LiveHierarchyPathItem = {
    nodeId: stableNodeId(root.nodeId, lobLevel.id, lobLevel.constantValue ?? lobLevel.label),
    parentNodeId: root.nodeId,
    levelIndex: 1,
    levelId: lobLevel.id,
    levelLabel: lobLevel.label,
    value: lobLevel.constantValue ?? lobLevel.label,
    amount: totalAmount,
    transactions,
    shareOfParent: 1,
    drillable: true,
  };
  return [root, lob];
}

export function buildLiveHierarchyWhere(
  scope: LiveDemoScope,
  source: Pick<LiveSourceSummary, 'maxDate' | 'maxFiscalYear'>,
  baseFilter: LiveDemoFilter | null,
  path: LiveHierarchyPathItem[],
) {
  const clauses = [buildScopeWhere(scope, source, baseFilter)];
  for (const item of path) {
    if (!item.field || !HIERARCHY_FIELDS.has(item.field)) continue;
    clauses.push(`${item.field} = '${escapeSoqlLiteral(item.value)}'`);
  }
  return clauses.filter(Boolean).join(' AND ');
}

export function nextLiveHierarchyLevel(path: LiveHierarchyPathItem[]) {
  return LIVE_FINANCE_HIERARCHY[path.length] ?? null;
}

export async function loadLiveHierarchyChildren(options: {
  scope: LiveDemoScope;
  source: Pick<LiveSourceSummary, 'maxDate' | 'maxFiscalYear'>;
  baseFilter: LiveDemoFilter | null;
  path: LiveHierarchyPathItem[];
  parentAmount: number;
  parentTransactions: number;
  appToken?: string;
  signal?: AbortSignal;
}): Promise<LiveHierarchyChildrenResult> {
  const started = performance.now();
  const level = nextLiveHierarchyLevel(options.path);
  const parent = options.path[options.path.length - 1];
  if (!level || !parent) {
    return {
      level: null,
      parentNodeId: parent?.nodeId ?? '',
      children: [],
      queryDurationMs: performance.now() - started,
      requestCount: 0,
      topCategoriesOnly: false,
    };
  }

  if (level.constantValue) {
    const child: LiveHierarchyPathItem = {
      nodeId: stableNodeId(parent.nodeId, level.id, level.constantValue),
      parentNodeId: parent.nodeId,
      levelIndex: options.path.length,
      levelId: level.id,
      levelLabel: level.label,
      value: level.constantValue,
      amount: options.parentAmount,
      transactions: options.parentTransactions,
      shareOfParent: 1,
      drillable: true,
    };
    return {
      level,
      parentNodeId: parent.nodeId,
      children: [child],
      queryDurationMs: performance.now() - started,
      requestCount: 0,
      topCategoriesOnly: false,
    };
  }

  if (!level.field || !HIERARCHY_FIELDS.has(level.field)) throw new Error(`Unsupported hierarchy level ${level.label}.`);
  const where = buildLiveHierarchyWhere(options.scope, options.source, options.baseFilter, options.path);
  const url = buildSodaUrl({
    select: `${level.field} as value, sum(dollar_amount) as amount, count(*) as transactions`,
    where: `${where} AND ${level.field} is not null`,
    group: level.field,
    order: 'sum(dollar_amount) DESC',
    limit: TOP_CHILDREN,
  });

  const rows = await fetchHierarchyJson<Array<{ value?: string; amount?: string | number; transactions?: string | number }>>(
    url,
    options.appToken,
    options.signal,
  );
  const children = rows.map((row) => {
    const value = String(row.value ?? '(missing)');
    const amount = Number(row.amount ?? 0);
    const transactions = Number(row.transactions ?? 0);
    return {
      nodeId: stableNodeId(parent.nodeId, level.id, value),
      parentNodeId: parent.nodeId,
      levelIndex: options.path.length,
      levelId: level.id,
      levelLabel: level.label,
      field: level.field,
      value,
      amount: Number.isFinite(amount) ? amount : 0,
      transactions: Number.isFinite(transactions) ? transactions : 0,
      shareOfParent: options.parentAmount ? amount / options.parentAmount : 0,
      drillable: true,
    } satisfies LiveHierarchyPathItem;
  });

  const displayedAmount = children.reduce((sum, child) => sum + child.amount, 0);
  const displayedTransactions = children.reduce((sum, child) => sum + child.transactions, 0);
  const otherAmount = Math.max(0, options.parentAmount - displayedAmount);
  const otherTransactions = Math.max(0, options.parentTransactions - displayedTransactions);
  if (otherAmount > Math.abs(options.parentAmount) * 0.005) {
    children.push({
      nodeId: stableNodeId(parent.nodeId, level.id, 'Other categories'),
      parentNodeId: parent.nodeId,
      levelIndex: options.path.length,
      levelId: level.id,
      levelLabel: level.label,
      field: level.field,
      value: 'Other categories',
      amount: otherAmount,
      transactions: otherTransactions,
      shareOfParent: options.parentAmount ? otherAmount / options.parentAmount : 0,
      drillable: false,
    });
  }

  return {
    level,
    parentNodeId: parent.nodeId,
    children,
    queryDurationMs: performance.now() - started,
    requestCount: 1,
    topCategoriesOnly: true,
    warning: children.length === 0 ? `No ${level.label} children were returned for this branch.` : undefined,
  };
}
