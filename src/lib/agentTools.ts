import type { ChatContext } from './chatEngine';
import type { EvidenceItem, EvidenceLedger, EvidenceKind } from './evidenceLedger';

export type AgentToolName =
  | 'get_current_scope'
  | 'get_metric_definition'
  | 'get_time_analysis'
  | 'scan_dimensions'
  | 'find_interactions'
  | 'get_data_quality'
  | 'get_external_context';

export interface AgentToolCall {
  id: string;
  name: AgentToolName;
  reason: string;
}

export interface AgentToolExecution {
  call: AgentToolCall;
  status: 'success' | 'empty';
  evidenceIds: string[];
  summary: string;
  payload: unknown;
}

const evidenceKinds: Record<AgentToolName, EvidenceKind[]> = {
  get_current_scope: ['scope', 'dataset'],
  get_metric_definition: ['metric-definition'],
  get_time_analysis: ['time-series', 'forecast-model', 'variance'],
  scan_dimensions: ['driver', 'variance'],
  find_interactions: ['interaction', 'driver', 'scope'],
  get_data_quality: ['quality', 'dataset', 'limitation'],
  get_external_context: ['external-context', 'time-series', 'driver', 'limitation'],
};

function callsForQuestion(question: string): Array<Omit<AgentToolCall, 'id'>> {
  const value = question.toLowerCase();
  const calls: Array<Omit<AgentToolCall, 'id'>> = [
    { name: 'get_current_scope', reason: 'Resolve the active investigation cohort before explaining any result.' },
    { name: 'get_metric_definition', reason: 'Confirm metric semantics, direction, aggregation, and caveats.' },
  ];

  if (/(mtd|qtd|ytd|trend|time|month|quarter|year|pace|run rate|forecast|volatility|bias)/.test(value)) {
    calls.push({ name: 'get_time_analysis', reason: 'The question asks about time, pacing, or forecast evidence.' });
  }
  if (/(driv|contribut|dimension|factor|concentrat|why|explain|what happened)/.test(value)) {
    calls.push({ name: 'scan_dimensions', reason: 'The question requires ranked business-driver evidence.' });
  }
  if (/(combined|interaction|together|combination|multi)/.test(value)) {
    calls.push({ name: 'find_interactions', reason: 'The question asks for a multidimensional segment.' });
  }
  if (/(quality|missing|duplicate|trust|reliable|coverage|valid)/.test(value)) {
    calls.push({ name: 'get_data_quality', reason: 'The question asks whether the evidence can be trusted.' });
  }
  if (/(news|external|competitor|event|cause|why factor|weather|outage|promotion)/.test(value)) {
    calls.push({ name: 'get_external_context', reason: 'The question asks about a possible external explanation.' });
  }
  if (calls.length === 2) {
    calls.push({ name: 'get_time_analysis', reason: 'Provide current-period and trend context for the general finance question.' });
    calls.push({ name: 'scan_dimensions', reason: 'Provide the leading supported business driver.' });
  }
  return calls;
}

export function planAgentTools(question: string): AgentToolCall[] {
  return callsForQuestion(question).map((call, index) => ({
    ...call,
    id: `tool-call-${index + 1}`,
  }));
}

function itemsForTool(ledger: EvidenceLedger, name: AgentToolName) {
  const allowed = new Set(evidenceKinds[name]);
  return ledger.items.filter((item) => allowed.has(item.kind)).slice(0, name === 'scan_dimensions' ? 8 : 5);
}

function toolSummary(name: AgentToolName, items: EvidenceItem[], context: ChatContext) {
  if (!items.length) return `No ${name.replaceAll('_', ' ')} evidence is available in the current calculation ledger.`;
  if (name === 'scan_dimensions') {
    const top = context.result.dimensionScores[0]?.topCategory;
    return top
      ? `${context.result.dimensionScores.length} dimensions were scanned; ${top.dimension} = ${top.value} is the leading supported category.`
      : 'Dimension scanning completed, but no supported category was returned.';
  }
  if (name === 'find_interactions') {
    return context.result.interactions.length
      ? `${context.result.interactions.length} supported interaction segments are available.`
      : 'No interaction passed the current support and pruning thresholds.';
  }
  return items.map((item) => item.summary).join(' ');
}

export function executeAgentTool(
  call: AgentToolCall,
  context: ChatContext,
  ledger: EvidenceLedger,
): AgentToolExecution {
  const items = itemsForTool(ledger, call.name);
  return {
    call,
    status: items.length ? 'success' : 'empty',
    evidenceIds: items.map((item) => item.id),
    summary: toolSummary(call.name, items, context),
    payload: items.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      summary: item.summary,
      runId: item.runId,
    })),
  };
}

export function runAgentToolPlan(
  question: string,
  context: ChatContext,
  ledger: EvidenceLedger,
): AgentToolExecution[] {
  return planAgentTools(question).map((call) => executeAgentTool(call, context, ledger));
}
