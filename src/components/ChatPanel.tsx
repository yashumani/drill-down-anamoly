import { useEffect, useMemo, useState } from 'react';
import { demoBusinessContext, demoQuestions } from '../data/demoNews';
import { runDeterministicAgent } from '../lib/agentOrchestrator';
import { buildEvidenceLedger } from '../lib/evidenceLedger';
import type { ChatAction } from '../lib/chatEngine';
import type { DataQualityReport } from '../lib/dataQuality';
import type { DatasetSession } from '../lib/datasetSession';
import type { MetricDefinition } from '../lib/metricSemantics';
import { askLlm, outboundEvidencePreview, testLlmConnection } from '../lib/llm';
import type { LlmConfig } from '../lib/llm';
import { LOCAL_OLLAMA_SETUP_STEPS, localOllamaOriginCommand, localOllamaPreset } from '../lib/llmPresets';
import type { FinanceTimeSeriesResult } from '../lib/timeIntelligence';
import type { DataRow, InvestigationResult, MetricPolarity, Predicate } from '../types';

interface Message { role: 'user' | 'assistant'; text: string; evidenceIds?: string[]; runId?: string; }

function stored(key: string, fallback = '') {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

const initialLlm: LlmConfig = {
  enabled: false,
  endpoint: stored('anomaly-llm-endpoint'),
  model: stored('anomaly-llm-model'),
  apiKey: '',
  authHeader: stored('anomaly-llm-auth-header', 'Authorization'),
  authPrefix: stored('anomaly-llm-auth-prefix', 'Bearer '),
};

export function ChatPanel({
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
  defaultSettingsOpen = false,
  displayMode = 'sidebar',
}: {
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
}) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', text: 'Ask about MTD, QTD, YTD, pacing, material variance, business drivers, or external why-factor hypotheses.' }]);
  const [llm, setLlm] = useState<LlmConfig>(initialLlm);
  const [settingsOpen, setSettingsOpen] = useState(defaultSettingsOpen);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('');
  const evidenceLedger = useMemo(() => buildEvidenceLedger({
    result,
    predicates,
    metricDefinition,
    dataQuality,
    timeSeries,
    datasetSession,
    externalContext,
  }), [result, predicates, metricDefinition, dataQuality, timeSeries, datasetSession, externalContext]);

  const outboundPreview = useMemo(() => outboundEvidencePreview({
    actualKey,
    expectedKey,
    metricPolarity,
    predicates,
    result,
    dataQuality,
    timeSeries: timeSeries ?? undefined,
    externalContext,
    datasetSession,
    metricDefinition,
    evidenceLedger,
  }), [actualKey, expectedKey, metricPolarity, predicates, result, dataQuality, timeSeries, externalContext, datasetSession, metricDefinition, evidenceLedger]);

  const starterSuggestions = useMemo(() => {
    const top = result.dimensionScores[0];
    const output = ['How are we pacing YTD?', 'What changed over time?', 'What is driving the result?'];
    if (timeSeries?.runRate) output.push('Are we pacing to hit month-end?');
    if (timeSeries?.modelHealth.status !== 'healthy') output.push('Can I trust the time analysis?');
    if (externalContext) output.push('Could external news explain this variance?');
    if (top) output.push(`Show me ${top.dimension}`);
    if (predicates.length) output.push('Go deeper');
    output.push(...demoQuestions.slice(0, 1));
    return [...new Set(output)].slice(0, 5);
  }, [result, predicates, timeSeries, externalContext]);
  const [suggestions, setSuggestions] = useState<string[]>(starterSuggestions);

  useEffect(() => {
    setSuggestions(starterSuggestions);
  }, [starterSuggestions]);

  function saveNonSecretConfig(next: LlmConfig) {
    setLlm(next);
    setConnectionStatus('');
    try {
      localStorage.setItem('anomaly-llm-endpoint', next.endpoint);
      localStorage.setItem('anomaly-llm-model', next.model);
      localStorage.setItem('anomaly-llm-auth-header', next.authHeader);
      localStorage.setItem('anomaly-llm-auth-prefix', next.authPrefix);
    } catch {
      // The dashboard remains usable when storage is blocked by the browser.
    }
  }

  function useLocalModel() {
    saveNonSecretConfig(localOllamaPreset());
    setSettingsOpen(true);
    setConnectionStatus('Local FP&A preset loaded. Start Ollama with this site origin allowed, then test the connection.');
  }

  async function testConnection() {
    setTesting(true);
    setConnectionStatus('Testing the model endpoint…');
    try {
      const output = await testLlmConnection(llm);
      setConnectionStatus(output.message);
    } catch (error) {
      setConnectionStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  }

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
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
    setMessages((previous) => [...previous, { role: 'user', text: question }]);
    setSuggestions(deterministic.suggestedQuestions);
    setInput('');
    if (deterministic.uiActions[0]) onAction(deterministic.uiActions[0]);

    if (!llm.enabled) {
      setMessages((previous) => [...previous, {
        role: 'assistant',
        text: deterministic.answer,
        evidenceIds: deterministic.evidenceIds,
        runId: deterministic.calculationRunId,
      }]);
      return;
    }

    setBusy(true);
    try {
      const output = await askLlm(question, llm, { actualKey, expectedKey, metricPolarity, predicates, result, dataQuality, timeSeries: timeSeries ?? undefined, externalContext, datasetSession, metricDefinition, evidenceLedger });
      setMessages((previous) => [...previous, { role: 'assistant', text: output, evidenceIds: deterministic.evidenceIds, runId: result.runId }]);
    } catch (requestError) {
      setMessages((previous) => [...previous, { role: 'assistant', text: `${deterministic.answer}\n\nLLM connection note: ${requestError instanceof Error ? requestError.message : String(requestError)}`, evidenceIds: deterministic.evidenceIds, runId: result.runId }]);
    } finally {
      setBusy(false);
    }
  }

  return <aside className={`chat-panel chat-${displayMode}`} aria-label="Ask FP&A">
    <div className="chat-head"><div><span className="chat-kicker">AI / LLM ANALYST</span><h2>Explain performance and pacing</h2></div><button className="icon-button" type="button" onClick={() => setSettingsOpen((value) => !value)}>{llm.enabled ? 'LLM connected' : settingsOpen ? 'LLM setup visible' : 'Connect LLM'}</button></div>

    {displayMode === 'presentation' && <div className="llm-visibility-callout"><div><strong>Use the built-in finance guide now</strong><span>Or connect the local FP&A Ollama preset or another OpenAI-compatible endpoint.</span></div><b>{llm.enabled ? 'LLM ON' : 'DETERMINISTIC MODE'} · {evidenceLedger.items.length} evidence items</b></div>}

    {settingsOpen && <div className="llm-settings">
      <div className="settings-title"><strong>Model connection</strong><div className="llm-settings-actions"><button type="button" onClick={useLocalModel}>Use local FP&A model</button><button type="button" onClick={testConnection} disabled={testing}>{testing ? 'Testing…' : 'Test connection'}</button><label><input type="checkbox" checked={llm.enabled} onChange={(event) => saveNonSecretConfig({ ...llm, enabled: event.target.checked })} /> Enable</label></div></div>
      <label>Chat-completions endpoint<input value={llm.endpoint} onChange={(event) => saveNonSecretConfig({ ...llm, endpoint: event.target.value })} placeholder="https://your-host/.../chat/completions" /></label>
      <div className="settings-row"><label>Model<input value={llm.model} onChange={(event) => saveNonSecretConfig({ ...llm, model: event.target.value })} placeholder="model-name" /></label><label>Auth header<input value={llm.authHeader} onChange={(event) => saveNonSecretConfig({ ...llm, authHeader: event.target.value })} /></label></div>
      <div className="settings-row"><label>Auth prefix<input value={llm.authPrefix} onChange={(event) => saveNonSecretConfig({ ...llm, authPrefix: event.target.value })} placeholder="Bearer " /></label><label>API key<input type="password" value={llm.apiKey} onChange={(event) => setLlm({ ...llm, apiKey: event.target.value })} placeholder="Not saved" autoComplete="off" /></label></div>
      {connectionStatus && <p className="llm-connection-status">{connectionStatus}</p>}
      <details className="local-llm-guide"><summary>Local model setup</summary><code>{LOCAL_OLLAMA_SETUP_STEPS[0]}</code><code>{LOCAL_OLLAMA_SETUP_STEPS[1]}</code><code>{localOllamaOriginCommand()}</code><small>The deployed page calls the local OpenAI-compatible Ollama endpoint. Allow only this site origin rather than every website.</small></details>
      <p className="llm-outbound-preview"><strong>Outbound evidence preview</strong><span>{outboundPreview.bytes.toLocaleString()} bytes · no raw rows · ledger {outboundPreview.evidenceLedgerId ?? 'not available'} · run {outboundPreview.calculationRunId}</span>{outboundPreview.sensitiveColumns.length ? <small>Potential sensitive columns are named in quality metadata but raw values are not included: {outboundPreview.sensitiveColumns.join(', ')}.</small> : <small>No sensitive-column candidates are included in the outbound summary.</small>}</p>
      <p className="security-note">The API key remains only in this page's memory. Production deployments should proxy approved providers through a secured backend, redact sensitive values, and retain an auditable calculation snapshot.</p>
    </div>}

    <details className="context-box">
      <summary>Add business context</summary>
      <p>Add events the financial dataset cannot see—campaigns, outages, launches, price changes, policy decisions, weather, competitor moves, accrual timing, or operational incidents. News context is included automatically when available.</p>
      <div className="context-actions"><button type="button" className="quiet-button" onClick={() => onExternalContext(demoBusinessContext)}>Load sample context</button>{manualContext && <button type="button" className="quiet-button" onClick={() => onExternalContext('')}>Clear context</button>}</div>
      <textarea value={manualContext} onChange={(event) => onExternalContext(event.target.value)} placeholder="Example: West stores had a device shortage from July 8–18; Promo B launched July 10; a vendor accrual was booked late..." />
      {externalContext && <small className="context-status">External context is active for Ask FP&A.</small>}
    </details>

    <div className="chat-messages" aria-live="polite">{messages.slice(-8).map((message, index) => <div key={`${index}-${message.role}`} className={`chat-message ${message.role}`}><span>{message.role === 'assistant' ? (llm.enabled ? 'AI FP&A analyst' : 'Finance guide') : 'You'}</span><p>{message.text}</p>{message.evidenceIds?.length ? <div className="chat-evidence"><b>Evidence</b>{message.evidenceIds.slice(0, 4).map((id) => <code key={id}>{id}</code>)}{message.runId && <small>Run {message.runId}</small>}</div> : null}</div>)}</div>
    <div className="chat-suggestions">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => ask(suggestion)}>{suggestion}</button>)}</div>
    <div className="chat-input-row"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') ask(input); }} placeholder="Ask: Are we pacing to hit the quarter?" aria-label="Ask a finance question" /><button type="button" disabled={busy} onClick={() => ask(input)}>{busy ? 'Thinking…' : 'Ask'}</button></div>
  </aside>;
}
