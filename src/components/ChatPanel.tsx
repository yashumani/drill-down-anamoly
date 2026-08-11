import { useMemo, useState } from 'react';
import { demoBusinessContext, demoQuestions } from '../data/demoNews';
import { answerChat } from '../lib/chatEngine';
import type { ChatAction } from '../lib/chatEngine';
import { askLlm } from '../lib/llm';
import type { LlmConfig } from '../lib/llm';
import type { DataRow, InvestigationResult, Predicate } from '../types';

interface Message { role: 'user' | 'assistant'; text: string; }

const initialLlm: LlmConfig = {
  enabled: false,
  endpoint: localStorage.getItem('anomaly-llm-endpoint') || '',
  model: localStorage.getItem('anomaly-llm-model') || '',
  apiKey: '',
  authHeader: localStorage.getItem('anomaly-llm-auth-header') || 'Authorization',
  authPrefix: localStorage.getItem('anomaly-llm-auth-prefix') ?? 'Bearer ',
};

export function ChatPanel({ rows, dimensions, actualKey, expectedKey, predicates, result, externalContext, manualContext, onExternalContext, onAction }: {
  rows: DataRow[]; dimensions: string[]; actualKey: string; expectedKey?: string; predicates: Predicate[]; result: InvestigationResult;
  externalContext: string; manualContext: string; onExternalContext: (value: string) => void; onAction: (action: ChatAction) => void;
}) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', text: 'Ask what changed, why a group stands out, or tell me what to investigate next. Demo questions and sample business context are ready below.' }]);
  const [llm, setLlm] = useState<LlmConfig>(initialLlm);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const starterSuggestions = useMemo(() => {
    const top = result.dimensionScores[0];
    const s = [...demoQuestions.slice(0, 2), 'What is driving the result?', 'What is the strongest combined pattern?'];
    if (top) s.push(`Show me ${top.dimension}`);
    if (predicates.length) s.push('Go deeper');
    return s.slice(0, 5);
  }, [result, predicates]);
  const [suggestions, setSuggestions] = useState<string[]>(starterSuggestions);

  function saveNonSecretConfig(next: LlmConfig) {
    setLlm(next);
    localStorage.setItem('anomaly-llm-endpoint', next.endpoint);
    localStorage.setItem('anomaly-llm-model', next.model);
    localStorage.setItem('anomaly-llm-auth-header', next.authHeader);
    localStorage.setItem('anomaly-llm-auth-prefix', next.authPrefix);
  }

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const deterministic = answerChat(q, { rows, dimensions, actualKey, expectedKey, predicates, result, externalContext });
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setSuggestions(deterministic.suggestions);
    setInput('');
    if (deterministic.action) onAction(deterministic.action);

    if (!llm.enabled) {
      setMessages((prev) => [...prev, { role: 'assistant', text: deterministic.text }]);
      return;
    }

    setBusy(true);
    try {
      const textOut = await askLlm(q, llm, { actualKey, expectedKey, predicates, result, externalContext });
      setMessages((prev) => [...prev, { role: 'assistant', text: textOut }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', text: `${deterministic.text}\n\nLLM connection note: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally { setBusy(false); }
  }

  return <aside className="chat-panel" aria-label="Ask the data">
    <div className="chat-head"><div><span className="chat-kicker">ASK THE DATA</span><h2>Explain this result</h2></div><button className="icon-button" type="button" onClick={() => setSettingsOpen((v) => !v)}>{llm.enabled ? 'LLM on' : 'Connect LLM'}</button></div>

    {settingsOpen && <div className="llm-settings">
      <div className="settings-title"><strong>Bring your own LLM</strong><label><input type="checkbox" checked={llm.enabled} onChange={(e) => saveNonSecretConfig({ ...llm, enabled: e.target.checked })} /> Enable</label></div>
      <label>Chat-completions endpoint<input value={llm.endpoint} onChange={(e) => saveNonSecretConfig({ ...llm, endpoint: e.target.value })} placeholder="https://your-host/.../chat/completions" /></label>
      <div className="settings-row"><label>Model<input value={llm.model} onChange={(e) => saveNonSecretConfig({ ...llm, model: e.target.value })} placeholder="model-name" /></label><label>Auth header<input value={llm.authHeader} onChange={(e) => saveNonSecretConfig({ ...llm, authHeader: e.target.value })} /></label></div>
      <div className="settings-row"><label>Auth prefix<input value={llm.authPrefix} onChange={(e) => saveNonSecretConfig({ ...llm, authPrefix: e.target.value })} placeholder="Bearer " /></label><label>API key<input type="password" value={llm.apiKey} onChange={(e) => setLlm({ ...llm, apiKey: e.target.value })} placeholder="Not saved" autoComplete="off" /></label></div>
      <p className="security-note">The API key stays only in this page's memory and is never saved. Because this demo runs in your browser, requests go directly to the endpoint you enter; that endpoint must allow browser CORS. For enterprise use, route LLM calls through a secured backend instead.</p>
    </div>}

    <details className="context-box" open>
      <summary>Add business context</summary>
      <p>Add known events the data cannot see—campaigns, outages, launches, policy changes, weather, competitor moves, or operational incidents. News context from the external factor panel is included automatically when available.</p>
      <div className="context-actions">
        <button type="button" className="quiet-button" onClick={() => onExternalContext(demoBusinessContext)}>Load sample context</button>
        {manualContext && <button type="button" className="quiet-button" onClick={() => onExternalContext('')}>Clear context</button>}
      </div>
      <textarea value={manualContext} onChange={(e) => onExternalContext(e.target.value)} placeholder="Example: West stores had a device shortage from July 8–18; Promo B launched July 10..." />
      {externalContext && <small className="context-status">External context is active for Ask the Data.</small>}
    </details>

    <div className="chat-messages" aria-live="polite">{messages.slice(-8).map((m, i) => <div key={i} className={`chat-message ${m.role}`}><span>{m.role === 'assistant' ? (llm.enabled ? 'AI analyst' : 'Data guide') : 'You'}</span><p>{m.text}</p></div>)}</div>
    <div className="chat-suggestions">{suggestions.map((s) => <button key={s} type="button" onClick={() => ask(s)}>{s}</button>)}</div>
    <div className="chat-input-row"><input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ask(input); }} placeholder="Ask: Could external news explain this?" aria-label="Ask a question about the data" /><button type="button" disabled={busy} onClick={() => ask(input)}>{busy ? 'Thinking…' : 'Ask'}</button></div>
  </aside>;
}
