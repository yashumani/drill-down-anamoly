import { useMemo, useState } from 'react';
import {
  UseAgentUpdate,
  useAgent,
  useAgentContext,
  useCopilotKit,
  useFrontendTool,
} from '@copilotkit/react-core/v2';
import { z } from 'zod';
import { runDeterministicAgent } from '../lib/agentOrchestrator';
import { buildEvidenceLedger } from '../lib/evidenceLedger';
import type { ChatAction } from '../lib/chatEngine';
import type { DataQualityReport } from '../lib/dataQuality';
import type { DatasetSession } from '../lib/datasetSession';
import type { MetricDefinition } from '../lib/metricSemantics';
import type { FinanceTimeSeriesResult } from '../lib/timeIntelligence';
import type { DataRow, InvestigationResult, MetricPolarity, Predicate } from '../types';
import { buildCopilotFinanceContext } from '../lib/copilotFinanceContext';
import {
  copilotKitAgentId,
  copilotKitRuntimeUrl,
  disconnectCopilotKitRuntime,
} from '../lib/copilotKitConfig';

interface CopilotFinanceExperienceProps {
  rows: DataRow[];
  dimensions: string[];
  actualKey: string;
  expectedKey?: string;
  metricPolarity: MetricPolarity;
  predicates: Predicate[];
  result: InvestigationResult;
  dataQuality: DataQualityReport;
  datasetSession: DatasetSession;
  metricDefinition: MetricDefinition;
  timeSeries: FinanceTimeSeriesResult | null;
  externalContext: string;
  manualContext: string;
  onExternalContext: (value: string) => void;
  onAction: (action: ChatAction) => void;
  defaultSettingsOpen?: boolean;
  displayMode?: 'sidebar' | 'presentation';
}

function messageText(message: unknown) {
  const record = (message ?? {}) as Record<string, unknown>;
  const content = record.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => {
    if (typeof part === 'string') return part;
    const item = (part ?? {}) as Record<string, unknown>;
    return typeof item.text === 'string' ? item.text : typeof item.content === 'string' ? item.content : '';
  }).filter(Boolean).join('\n');
}

function messageRole(message: unknown) {
  const role = (message as { role?: unknown } | null)?.role;
  return role === 'assistant' || role === 'user' ? role : null;
}

export default function CopilotFinanceExperience({
  rows,
  dimensions,
  actualKey,
  expectedKey,
  metricPolarity,
  predicates,
  result,
  dataQuality,
  datasetSession,
  metricDefinition,
  timeSeries,
  externalContext,
  manualContext,
  onExternalContext,
  onAction,
  displayMode = 'sidebar',
}: CopilotFinanceExperienceProps) {
  const [input, setInput] = useState('');
  const [localNote, setLocalNote] = useState('');
  const [suggestions, setSuggestions] = useState(() => [
    'What is driving the result?',
    'How are we pacing YTD?',
    'Which dimension should I inspect next?',
    'Can I trust this analysis?',
  ]);

  const evidenceLedger = useMemo(() => buildEvidenceLedger({
    result,
    predicates,
    metricDefinition,
    dataQuality,
    timeSeries,
    datasetSession,
    externalContext,
  }), [result, predicates, metricDefinition, dataQuality, timeSeries, datasetSession, externalContext]);

  const financeContext = useMemo(() => buildCopilotFinanceContext({
    actualKey,
    expectedKey,
    predicates,
    result,
    dataQuality,
    datasetSession,
    metricDefinition,
    timeSeries,
    evidenceLedger,
    externalContext,
  }), [actualKey, expectedKey, predicates, result, dataQuality, datasetSession, metricDefinition, timeSeries, evidenceLedger, externalContext]);

  useAgentContext({
    description: 'Current FP&A investigation evidence. Values are deterministic and must not be recalculated or invented.',
    value: financeContext,
  });

  useFrontendTool({
    name: 'selectFinanceDimension',
    description: 'Select one quality-approved business dimension in the exploration workspace without changing the current population.',
    parameters: z.object({ dimension: z.string().describe('Exact dimension field from the available driver list') }),
    followUp: false,
    handler: async ({ dimension }) => {
      if (!dimensions.includes(dimension)) return `Dimension ${dimension} is not available in this investigation.`;
      onAction({ type: 'select-dimension', dimension });
      return `Selected ${dimension}.`;
    },
  }, [dimensions, onAction]);

  useFrontendTool({
    name: 'drillIntoFinanceCategory',
    description: 'Apply one validated dimension and category as a drill filter, then let the deterministic engine rescan the remaining dimensions.',
    parameters: z.object({
      dimension: z.string().describe('Exact dimension field'),
      value: z.string().describe('Exact category value visible in the current evidence'),
    }),
    followUp: false,
    handler: async ({ dimension, value }) => {
      const score = result.dimensionScores.find((item) => item.dimension === dimension);
      if (!score) return `Dimension ${dimension} is not available in the current result.`;
      const category = score.categories.find((item) => String(item.value) === value);
      if (!category) return `${value} is not one of the currently supported ${dimension} categories.`;
      onAction({ type: 'drill', predicates: [{ dimension, value }] });
      return `Applied ${dimension} = ${value} and rescanned the remaining factors.`;
    },
  }, [result, onAction]);

  useFrontendTool({
    name: 'goBackOneFinanceDrillLevel',
    description: 'Remove the most recent drill predicate and return to the previous analytical population.',
    parameters: z.object({}),
    followUp: false,
    handler: async () => {
      if (!predicates.length) return 'The analysis is already at the root population.';
      onAction({ type: 'back' });
      return 'Returned one drill level.';
    },
  }, [predicates, onAction]);

  useFrontendTool({
    name: 'resetFinanceAnalysisScope',
    description: 'Remove all drill predicates and return to the full selected reporting population.',
    parameters: z.object({}),
    followUp: false,
    handler: async () => {
      onAction({ type: 'reset' });
      return 'Reset the analytical scope.';
    },
  }, [onAction]);

  const { agent, isReady } = useAgent({
    agentId: copilotKitAgentId,
    threadId: `fpa-${datasetSession.sessionId}`,
    updates: [UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnRunStatusChanged],
    throttleMs: 100,
  });
  const { copilotkit } = useCopilotKit();

  const visibleMessages = agent.messages.map((message, index) => ({
    id: String((message as { id?: unknown }).id ?? index),
    role: messageRole(message),
    text: messageText(message),
  })).filter((message): message is { id: string; role: 'assistant' | 'user'; text: string } => Boolean(message.role && message.text));

  async function ask(questionText: string) {
    const question = questionText.trim();
    if (!question || agent.isRunning) return;
    setInput('');
    setLocalNote('');
    const deterministic = runDeterministicAgent(question, {
      rows,
      dimensions,
      actualKey,
      expectedKey,
      metricPolarity,
      predicates,
      result,
      dataQuality,
      timeSeries: timeSeries ?? undefined,
      externalContext,
      aggregationMethod: result.aggregationMethod,
      timeField: timeSeries?.timeField,
    }, evidenceLedger);
    setSuggestions(deterministic.suggestedQuestions);
    if (!isReady) {
      setLocalNote(`${deterministic.answer}\n\nCopilotKit runtime is still connecting, so the deterministic finance guide answered this turn.`);
      return;
    }
    try {
      agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: question });
      await copilotkit.runAgent({ agent });
    } catch (error) {
      setLocalNote(`${deterministic.answer}\n\nCopilotKit connection note: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return <aside className={`chat-panel chat-${displayMode} copilotkit-finance-agent`} aria-label="CopilotKit FP&A agent">
    <div className="chat-head"><div><span className="chat-kicker">COPILOTKIT FP&amp;A AGENT</span><h2>Explain, navigate, and drill through verified evidence</h2></div><div className="llm-settings-actions"><span className="chat-status">{isReady ? agent.isRunning ? 'Running tools…' : 'Runtime ready' : 'Connecting…'}</span><button className="icon-button" type="button" onClick={disconnectCopilotKitRuntime}>Disconnect</button></div></div>
    <div className="llm-visibility-callout"><div><strong>Deterministic finance remains authoritative</strong><span>CopilotKit receives compact evidence and can invoke only validated UI actions. It never receives raw uploaded rows from this bridge.</span></div><b>{evidenceLedger.items.length} evidence items · run {result.runId}</b></div>

    <details className="context-box">
      <summary>Add business context</summary>
      <p>Add campaigns, outages, launches, pricing actions, policy decisions, weather, competitor moves, accrual timing, or operational incidents. The agent must treat this as a hypothesis source—not proof of causality.</p>
      <textarea value={manualContext} onChange={(event) => onExternalContext(event.target.value)} placeholder="Example: West stores had a device shortage from July 8–18…" />
    </details>

    <div className="chat-messages" aria-live="polite">
      {!visibleMessages.length && <div className="chat-message assistant"><span>FP&amp;A Copilot</span><p>Ask what changed, what is driving the movement, which branch to inspect, or whether the evidence is trustworthy. I can select dimensions and apply validated drill actions.</p></div>}
      {visibleMessages.slice(-10).map((message) => <div key={message.id} className={`chat-message ${message.role}`}><span>{message.role === 'assistant' ? 'FP&A Copilot' : 'You'}</span><p>{message.text}</p></div>)}
      {localNote && <div className="chat-message assistant"><span>Deterministic fallback</span><p>{localNote}</p></div>}
    </div>

    <div className="chat-suggestions">{suggestions.slice(0, 5).map((suggestion) => <button key={suggestion} type="button" onClick={() => ask(suggestion)} disabled={agent.isRunning}>{suggestion}</button>)}</div>
    <div className="chat-input-row"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') ask(input); }} placeholder="Ask about variance, pacing, drivers, or the next drill…" /><button type="button" onClick={() => agent.isRunning ? agent.abortRun() : ask(input)}>{agent.isRunning ? 'Stop' : 'Ask'}</button></div>
    <p className="chat-note">Runtime: {copilotKitRuntimeUrl} · agent {copilotKitAgentId} · dataset session {datasetSession.sessionId}</p>
  </aside>;
}
