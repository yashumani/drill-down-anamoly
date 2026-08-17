import { answerChat } from './chatEngine';
import type { ChatAction, ChatContext } from './chatEngine';
import { runAgentToolPlan } from './agentTools';
import type { AgentToolExecution } from './agentTools';
import type { EvidenceLedger } from './evidenceLedger';
import { findEvidence } from './evidenceLedger';

export type AgentIntent =
  | 'explain'
  | 'time'
  | 'driver'
  | 'quality'
  | 'external-hypothesis'
  | 'navigation'
  | 'compare'
  | 'unknown';

export interface AgentClaim {
  id: string;
  text: string;
  evidenceIds: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface AgentUiAction {
  type: ChatAction['type'];
  predicates?: ChatAction['predicates'];
  dimension?: string;
}

export interface AgentResponse {
  schemaVersion: 'finance-agent-response-v1';
  mode: 'deterministic' | 'llm-grounded';
  intent: AgentIntent;
  answer: string;
  claims: AgentClaim[];
  evidenceIds: string[];
  toolTrace: AgentToolExecution[];
  uiActions: AgentUiAction[];
  suggestedQuestions: string[];
  limitations: string[];
  calculationRunId: string;
  evidenceLedgerId: string;
}

export function resolveAgentIntent(question: string): AgentIntent {
  const value = question.toLowerCase();
  if (/(quality|missing|duplicate|trust|reliable)/.test(value)) return 'quality';
  if (/(news|external|competitor|event|cause|why factor)/.test(value)) return 'external-hypothesis';
  if (/(mtd|qtd|ytd|trend|time|month|quarter|year|pace|run rate|forecast bias|volatility)/.test(value)) return 'time';
  if (/(driver|contribut|dimension|factor|concentrat|drill|deeper)/.test(value)) return 'driver';
  if (/(compare| versus | vs )/.test(value)) return 'compare';
  if (/(go back|reset|start over|show me|select)/.test(value)) return 'navigation';
  if (/(explain|summary|what happened|why are we)/.test(value)) return 'explain';
  return 'unknown';
}

function evidenceForIntent(value: AgentIntent, ledger: EvidenceLedger) {
  const kindsByIntent: Record<AgentIntent, string[]> = {
    explain: ['variance', 'time-series', 'forecast-model', 'driver', 'quality', 'metric-definition'],
    time: ['time-series', 'forecast-model', 'variance', 'metric-definition', 'quality'],
    driver: ['driver', 'interaction', 'variance', 'scope', 'metric-definition'],
    quality: ['quality', 'dataset', 'metric-definition'],
    'external-hypothesis': ['external-context', 'driver', 'time-series', 'variance', 'limitation'],
    navigation: ['scope', 'driver'],
    compare: ['driver', 'variance', 'scope'],
    unknown: ['variance', 'driver', 'time-series'],
  };
  const allowed = new Set(kindsByIntent[value]);
  return ledger.items.filter((item) => allowed.has(item.kind)).slice(0, 8).map((item) => item.id);
}

function validateAction(action: ChatAction | undefined, context: ChatContext) {
  if (!action) return [];
  if (action.type === 'select-dimension') {
    return action.dimension && context.dimensions.includes(action.dimension) ? [action] : [];
  }
  if (action.type === 'drill') {
    const validPredicates = (action.predicates ?? []).filter((predicate) => {
      if (!context.dimensions.includes(predicate.dimension)) return false;
      const score = context.result.dimensionScores.find((item) => item.dimension === predicate.dimension);
      return score?.categories.some((category) => String(category.value) === predicate.value) ?? false;
    });
    return validPredicates.length ? [{ ...action, predicates: validPredicates }] : [];
  }
  return [action];
}

function limitations(ledger: EvidenceLedger) {
  return ledger.items
    .filter((item) => item.kind === 'limitation')
    .map((item) => item.summary)
    .slice(0, 5);
}

export function runDeterministicAgent(
  question: string,
  context: ChatContext,
  ledger: EvidenceLedger,
): AgentResponse {
  const reply = answerChat(question, context);
  const resolvedIntent = resolveAgentIntent(question);
  const toolTrace = runAgentToolPlan(question, context, ledger);
  const traceEvidence = toolTrace.flatMap((execution) => execution.evidenceIds);
  const evidenceIds = [...new Set([
    ...evidenceForIntent(resolvedIntent, ledger),
    ...traceEvidence,
  ])].filter((id) => Boolean(findEvidence(ledger, id)));
  const confidence: AgentClaim['confidence'] = context.dataQuality?.blockers
    ? 'low'
    : context.dataQuality && context.dataQuality.overallScore < 80
      ? 'medium'
      : 'high';
  const claims: AgentClaim[] = reply.text.trim() ? [{
    id: `claim:${ledger.calculationRunId}:1`,
    text: reply.text,
    evidenceIds,
    confidence,
  }] : [];

  return {
    schemaVersion: 'finance-agent-response-v1',
    mode: 'deterministic',
    intent: resolvedIntent,
    answer: reply.text,
    claims,
    evidenceIds,
    toolTrace,
    uiActions: validateAction(reply.action, context),
    suggestedQuestions: reply.suggestions,
    limitations: limitations(ledger),
    calculationRunId: ledger.calculationRunId,
    evidenceLedgerId: ledger.ledgerId,
  };
}

export function validateAgentResponse(
  response: AgentResponse,
  ledger: EvidenceLedger,
  allowedDimensions: string[],
) {
  const errors: string[] = [];
  const allowedEvidence = new Set(ledger.allowedEvidenceIds);
  for (const claim of response.claims) {
    if (!claim.evidenceIds.length) errors.push(`Claim ${claim.id} has no evidence.`);
    for (const id of claim.evidenceIds) {
      if (!allowedEvidence.has(id)) errors.push(`Claim ${claim.id} references unknown evidence ${id}.`);
    }
  }
  for (const execution of response.toolTrace) {
    for (const id of execution.evidenceIds) {
      if (!allowedEvidence.has(id)) errors.push(`Tool ${execution.call.name} references unknown evidence ${id}.`);
    }
  }
  for (const action of response.uiActions) {
    if (action.dimension && !allowedDimensions.includes(action.dimension)) errors.push(`Action references disallowed dimension ${action.dimension}.`);
    for (const predicate of action.predicates ?? []) {
      if (!allowedDimensions.includes(predicate.dimension)) errors.push(`Action predicate references disallowed dimension ${predicate.dimension}.`);
    }
  }
  return { valid: errors.length === 0, errors };
}
