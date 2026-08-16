import { useEffect, useMemo, useState } from 'react';
import { demoBusinessContext, demoQuestions } from '../data/demoNews';
import { answerChat } from '../lib/chatEngine';
import type { ChatAction } from '../lib/chatEngine';
import type { DataQualityReport } from '../lib/dataQuality';
import { askLlm } from '../lib/llm';
import type { LlmConfig } from '../lib/llm';
import type { FinanceTimeSeriesResult } from '../lib/timeIntelligence';
import type { DataRow, InvestigationResult, MetricPolarity, Predicate } from '../types';

interface Message { role: 'user' | 'assistant'; text: string; }

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
    try {
      localStorage.setItem('anomaly-llm-endpoint', next.endpoint);
      localStorage.setItem('anomaly-llm-model', next.model);
      localStorage.setItem('anomaly-llm-auth-header', next.authHeader);
      localStorage.setItem('anomaly-llm-auth-prefix', next.authPrefix);
    } catch {
      // The dashboard remains usable when storage is blocked by the browser.
    }
  }

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const deterministic = answerChat(question, { rows, dimensions, actualKey, expectedKey, metricPolarity, predicates, result, dataQuality, timeSeries: timeSeries ?? undefined, externalContext });
    setMessages((previous) => [...previous, { role: 'user', text: question }]);
    setSuggestions(deterministic.suggestions);
    setInput('');
    if (deterministic.action) onAction(deterministic.action);

    if (!llm.enabled) {
      setMessages((previous) => [...previous, { role: 'assistant', text: deterministic.text }]);
      return;
    }

    setBusy(true);
    try {
      const output = await askLlm(question, llm, { actualKey, expectedKey, metricPolarity, predicates, result, dataQuality, timeSeries: timeSeries ?? undefined, externalContext });
      setMessages((previous) => [...previous, { role: 'assistant', text: output }]);
    } catch (requestError) {
      setMessages((previous) => [...previous, { role: 'assistant', text: `${deterministic.text}\n\nLLM connection note: ${requestError instanceof Error ? requestError.message : String(requestError)}` }]);
    } finally {
      setBusy(false);
    }
  }

  return <aside className={`chat-panel chat-${displayMode}`} aria-label="Ask FP&A">
    <div className="chat-head"><div><span className="chat-kicker">AI / LLM ANALYST</span><h2>Explain performance and pacing</h2></div><button className="icon-button" type="button" onClick={() => setSettingsOpen((value) => !value)}>{llm.enabled ? 'LLM connected' : settingsOpen ? 'LLM setup visible' : 'Connect LLM'}</button></div>

    {displayMode === 'presentation' && <div className="llm-visibility-callout"><div><strong>Use the built-in finance guide now</strong><span>Or connect your own OpenAI-compatible endpoint below for richer conversational analysis.</span></div><b>{llm.enabled ? 'LLM ON' : 'DETERMINISTIC MODE'}</b></div>}

    {settingsOpen && <div className="llm-settings">
      <div className="settings-title"><strong>Bring your own LLM</strong><label><input type="checkbox" checked={llm.enabled} onChange={(event) => saveNonSecretConfig({ ...llm, enabled: event.target.checked })} /> Enable</label></div>
      <label>Chat-completions endpoint<input value={llm.endpoint} onChange={(event) => saveNonSecretConfig({ ...llm, endpoint: event.target.value })} placeholder="https://your-host/.../chat/completions" /></label>
      <div className="settings-row"><label>Model<input value={llm.model} onChange={(event) => saveNonSecretConfig({ ...llm, model: event.target.value })} placeholder="model-name" /></label><label>Auth header<input value={llm.authHeader} onChange={(event) => saveNonSecretConfig({ ...llm, authHeader: event.target.value })} /></label></div>
      <div className="settings-row"><label>Auth prefix<input value={llm.authPrefix} onChange={(event) => saveNonSecretConfig({ ...llm, authPrefix: event.target.value })} placeholder="Bearer " /></label><label>API key<input type="password" value={llm.apiKey} onChange={(event) => setLlm({ ...llm, apiKey: event.target.value })} placeholder="Not saved" autoComplete="off" /></label></div>
      <p className="security-note">The key remains only in this page's memory. Browser calls require CORS; production deployments should proxy approved LLM providers through a secured backend, redact sensitive values, and retain an auditable calculation snapshot.</p>
    </div>}

    <details className="context-box">
      <summary>Add business context</summary>
      <p>Add events the financial dataset cannot see—campaigns, outages, launches, price changes, policy decisions, weather, competitor moves, accrual timing, or operational incidents. News context is included automatically when available.</p>
      <div className="context-actions"><button type="button" className="quiet-button" onClick={() => onExternalContext(demoBusinessContext)}>Load sample context</button>{manualContext && <button type="button" className="quiet-button" onClick={() => onExternalContext('')}>Clear context</button>}</div>
      <textarea value={manualContext} onChange={(event) => onExternalContext(event.target.value)} placeholder="Example: West stores had a device shortage from July 8–18; Promo B launched July 10; a vendor accrual was booked late..." />
      {externalContext && <small className="context-status">External context is active for Ask FP&A.</small>}
    </details>

    <div className="chat-messages" aria-live="polite">{messages.slice(-8).map((message, index) => <div key={`${index}-${message.role}`} className={`chat-message ${message.role}`}><span>{message.role === 'assistant' ? (llm.enabled ? 'AI FP&A analyst' : 'Finance guide') : 'You'}</span><p>{message.text}</p></div>)}</div>
    <div className="chat-suggestions">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => ask(suggestion)}>{suggestion}</button>)}</div>
    <div className="chat-input-row"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') ask(input); }} placeholder="Ask: Are we pacing to hit the quarter?" aria-label="Ask a finance question" /><button type="button" disabled={busy} onClick={() => ask(input)}>{busy ? 'Thinking…' : 'Ask'}</button></div>
  </aside>;
}
