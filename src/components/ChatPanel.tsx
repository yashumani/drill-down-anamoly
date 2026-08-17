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
import {
  LOCAL_FP_AND_A_MODEL,
  LOCAL_OLLAMA_SETUP_STEPS,
  localOllamaOriginCommand,
  localOllamaPreset,
  selectLocalOllamaModel,
} from '../lib/llmPresets';
import type { FinanceTimeSeriesResult } from '../lib/timeIntelligence';
import type { DataRow, InvestigationResult, MetricPolarity, Predicate } from '../types';

interface Message { role: 'user' | 'assistant'; text: string; evidenceIds?: string[]; runId?: string; }

function stored(key: string, fallback = '') {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

const initialLlm: LlmConfig = {
  enabled: stored('anomaly-llm-enabled', 'false') === 'true',
  endpoint: stored('anomaly-llm-endpoint'),
  model: stored('anomaly-llm-model'),
  apiKey: '',
  authHeader: stored('anomaly-llm-auth-header', 'Authorization'),
  authPrefix: stored('anomaly-llm-auth-prefix', 'Bearer '),
};

function persistNonSecretConfig(config: LlmConfig) {
  try {
    localStorage.setItem('anomaly-llm-enabled', String(config.enabled));
    localStorage.setItem('anomaly-llm-endpoint', config.endpoint);
    localStorage.setItem('anomaly-llm-model', config.model);
    localStorage.setItem('anomaly-llm-auth-header', config.authHeader);
    localStorage.setItem('anomaly-llm-auth-prefix', config.authPrefix);
  } catch {
    // The dashboard remains usable when storage is blocked by the browser.
  }
}

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
  const [connectionOk, setConnectionOk] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
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

  function updateConfig(next: LlmConfig, preserveModels = false) {
    setLlm(next);
    persistNonSecretConfig(next);
    setConnectionOk(false);
    if (!preserveModels) setAvailableModels([]);
    setConnectionStatus('');
  }

  async function connectLocalModel() {
    const preset = localOllamaPreset();
    const checking = { ...preset, enabled: false };
    setSettingsOpen(true);
    setTesting(true);
    setConnectionOk(false);
    setAvailableModels([]);
    setLlm(checking);
    persistNonSecretConfig(checking);
    setConnectionStatus('Looking for Ollama on this device…');
    try {
      const output = await testLlmConnection(checking);
      setAvailableModels(output.availableModels);
      const selectedModel = output.ok ? preset.model : selectLocalOllamaModel(output.availableModels);
      if (!selectedModel) {
        throw new Error('Ollama is reachable, but no installed text model was returned. Pull llama3.2, then connect again.');
      }
      const next = { ...preset, model: selectedModel, enabled: true };
      setLlm(next);
      persistNonSecretConfig(next);
      setConnectionOk(true);
      setConnectionStatus(selectedModel === LOCAL_FP_AND_A_MODEL
        ? `Local LLM connected. ${selectedModel} is ready for evidence-grounded finance questions.`
        : `Local LLM connected using ${selectedModel}. Create the ${LOCAL_FP_AND_A_MODEL} alias later to apply the repository's finance-specific model profile.`);
    } catch (error) {
      const disabled = { ...checking, enabled: false };
      setLlm(disabled);
      persistNonSecretConfig(disabled);
      setConnectionStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setConnectionOk(false);
    setConnectionStatus('Testing the model endpoint…');
    try {
      const output = await testLlmConnection(llm);
      setAvailableModels(output.availableModels);
      setConnectionOk(output.ok);
      setConnectionStatus(output.message);
    } catch (error) {
      setAvailableModels([]);
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

  const connectionLabel = llm.enabled && connectionOk
    ? 'LLM ready'
    : llm.enabled
      ? 'LLM configured'
      : settingsOpen
        ? 'LLM setup visible'
        : 'Connect LLM';
  const detectedModelOptions = availableModels.includes(llm.model) || !llm.model
    ? availableModels
    : [llm.model, ...availableModels];

  return <aside className={`chat-panel chat-${displayMode}`} aria-label="Ask FP&A">
    <div className="chat-head"><div><span className="chat-kicker">AI / LLM ANALYST</span><h2>Explain performance and pacing</h2></div><button className="icon-button" type="button" onClick={() => setSettingsOpen((value) => !value)}>{connectionLabel}</button></div>

    {displayMode === 'presentation' && <div className="llm-visibility-callout"><div><strong>Use the built-in finance guide now</strong><span>Or connect the local FP&A Ollama preset or another OpenAI-compatible endpoint.</span></div><b>{llm.enabled && connectionOk ? 'LLM READY' : llm.enabled ? 'LLM CONFIGURED' : 'DETERMINISTIC MODE'} · {evidenceLedger.items.length} evidence items</b></div>}

    {settingsOpen && <div className="llm-settings">
      <div className="settings-title"><strong>Model connection</strong><div className="llm-settings-actions"><button type="button" onClick={connectLocalModel} disabled={testing}>{testing ? 'Connecting…' : 'Connect local LLM'}</button><button type="button" onClick={testConnection} disabled={testing || !llm.endpoint.trim()}>{testing ? 'Testing…' : 'Test endpoint'}</button><label className="llm-enable-toggle"><input type="checkbox" checked={llm.enabled} onChange={(event) => updateConfig({ ...llm, enabled: event.target.checked })} /> Enable</label></div></div>
      <label>Chat-completions endpoint<input value={llm.endpoint} onChange={(event) => updateConfig({ ...llm, endpoint: event.target.value })} placeholder="https://your-host/.../chat/completions" /></label>
      <div className="settings-row"><label>Model{detectedModelOptions.length ? <select value={llm.model} onChange={(event) => updateConfig({ ...llm, model: event.target.value }, true)}>{detectedModelOptions.map((model) => <option key={model} value={model}>{model}</option>)}</select> : <input value={llm.model} onChange={(event) => updateConfig({ ...llm, model: event.target.value })} placeholder="model-name" />}</label><label>Auth header<input value={llm.authHeader} onChange={(event) => updateConfig({ ...llm, authHeader: event.target.value })} /></label></div>
      <div className="settings-row"><label>Auth prefix<input value={llm.authPrefix} onChange={(event) => updateConfig({ ...llm, authPrefix: event.target.value })} placeholder="Bearer " /></label><label>API key<input type="password" value={llm.apiKey} onChange={(event) => setLlm({ ...llm, apiKey: event.target.value })} placeholder="Not saved" autoComplete="off" /></label></div>
      {connectionStatus && <p className={`llm-connection-status ${connectionOk ? 'connected' : ''}`} role="status" aria-live="polite">{connectionStatus}</p>}
      <details className="local-llm-guide"><summary>Local model setup</summary><code>{LOCAL_OLLAMA_SETUP_STEPS[0]}</code><code>{LOCAL_OLLAMA_SETUP_STEPS[1]}</code><code>{localOllamaOriginCommand()}</code><small>The deployed page calls the local OpenAI-compatible Ollama endpoint. Allow only this site origin rather than every website.</small><small><strong>Phone note:</strong> 127.0.0.1 means the phone itself. To use a model running on another computer, route it through an approved authenticated HTTPS gateway; do not expose Ollama port 11434 directly to the internet.</small></details>
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
