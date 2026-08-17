import type { AgentResponse } from './agentOrchestrator';
import type { EvidenceLedger } from './evidenceLedger';

export interface AiEvaluationResult {
  passed: boolean;
  score: number;
  checks: Array<{ id: string; passed: boolean; message: string }>;
}

const CAUSAL_TERMS = [
  /\bcaused\b/i,
  /\bproved? that\b/i,
  /\bdue to\b/i,
  /\bresulted in\b/i,
  /\bdefinitely explains\b/i,
];

function numbers(value: string) {
  return [...value.matchAll(/[-+]?\$?\d[\d,.]*(?:%|[KMBT])?/gi)].map((match) => match[0].replace(/[$,]/g, '').toLowerCase());
}

function ledgerText(ledger: EvidenceLedger) {
  return ledger.items.map((item) => `${item.summary} ${JSON.stringify(item.payload)}`).join(' ').toLowerCase();
}

export function evaluateAgentResponse(response: AgentResponse, ledger: EvidenceLedger): AiEvaluationResult {
  const checks: AiEvaluationResult['checks'] = [];
  const allowedEvidence = new Set(ledger.allowedEvidenceIds);
  const unknownEvidence = response.claims.flatMap((claim) => claim.evidenceIds).filter((id) => !allowedEvidence.has(id));
  checks.push({
    id: 'evidence-references',
    passed: unknownEvidence.length === 0 && response.claims.every((claim) => claim.evidenceIds.length > 0),
    message: unknownEvidence.length ? `Unknown evidence IDs: ${unknownEvidence.join(', ')}` : 'Every claim references known evidence.',
  });

  const hasExternalEvidence = ledger.items.some((item) => item.kind === 'external-context');
  const unqualifiedCausality = hasExternalEvidence && CAUSAL_TERMS.some((pattern) => pattern.test(response.answer));
  checks.push({
    id: 'causality-guardrail',
    passed: !unqualifiedCausality,
    message: unqualifiedCausality ? 'The answer uses causal language for hypothesis-only external evidence.' : 'No unsupported causal language detected.',
  });

  const sourceText = ledgerText(ledger);
  const unsupportedNumbers = numbers(response.answer).filter((value) => !sourceText.includes(value));
  checks.push({
    id: 'numeric-grounding',
    passed: unsupportedNumbers.length === 0,
    message: unsupportedNumbers.length ? `Potentially unsupported numeric tokens: ${unsupportedNumbers.join(', ')}` : 'Numeric tokens are traceable to the evidence ledger.',
  });

  const hasRunId = response.calculationRunId === ledger.calculationRunId;
  checks.push({
    id: 'run-linkage',
    passed: hasRunId,
    message: hasRunId ? 'Response is linked to the active calculation run.' : 'Response calculation run does not match the ledger.',
  });

  const score = Math.round(checks.filter((check) => check.passed).length / Math.max(1, checks.length) * 100);
  return { passed: checks.every((check) => check.passed), score, checks };
}
