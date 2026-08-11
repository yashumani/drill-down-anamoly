import { useMemo, useState } from 'react';
import { answerChat } from '../lib/chatEngine';
import type { ChatAction } from '../lib/chatEngine';
import type { DataRow, InvestigationResult, Predicate } from '../types';

interface Message { role: 'user' | 'assistant'; text: string; }

export function ChatPanel({
  rows,
  dimensions,
  actualKey,
  expectedKey,
  predicates,
  result,
  onAction,
}: {
  rows: DataRow[];
  dimensions: string[];
  actualKey: string;
  expectedKey?: string;
  predicates: Predicate[];
  result: InvestigationResult;
  onAction: (action: ChatAction) => void;
}) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: 'Ask me what is driving the result, tell me to show a group, compare two groups, or say “go deeper.” I use the same filters and evidence as the dashboard.' },
  ]);

  const starterSuggestions = useMemo(() => {
    const top = result.dimensionScores[0];
    const s = ['What is driving the result?', 'What is the strongest combined pattern?'];
    if (top) s.push(`Show me ${top.dimension}`);
    if (predicates.length) s.push('Go deeper');
    return s.slice(0, 4);
  }, [result, predicates]);

  const [suggestions, setSuggestions] = useState<string[]>(starterSuggestions);

  function ask(text: string) {
    const q = text.trim();
    if (!q) return;
    const reply = answerChat(q, { rows, dimensions, actualKey, expectedKey, predicates, result });
    setMessages((prev) => [...prev, { role: 'user', text: q }, { role: 'assistant', text: reply.text }]);
    setSuggestions(reply.suggestions);
    setInput('');
    if (reply.action) onAction(reply.action);
  }

  return <aside className="chat-panel" aria-label="Ask the data">
    <div className="chat-head">
      <div>
        <span className="chat-kicker">ASK THE DATA</span>
        <h2>Talk through the result</h2>
      </div>
      <span className="chat-status">Uses current dashboard context</span>
    </div>

    <div className="chat-messages" aria-live="polite">
      {messages.slice(-8).map((m, i) => <div key={i} className={`chat-message ${m.role}`}><span>{m.role === 'assistant' ? 'Data guide' : 'You'}</span><p>{m.text}</p></div>)}
    </div>

    <div className="chat-suggestions">
      {suggestions.map((s) => <button key={s} type="button" onClick={() => ask(s)}>{s}</button>)}
    </div>

    <div className="chat-input-row">
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') ask(input); }}
        placeholder="Ask: Why are we below target?"
        aria-label="Ask a question about the data"
      />
      <button type="button" onClick={() => ask(input)}>Ask</button>
    </div>
    <small className="chat-note">Prototype: answers are generated from deterministic dashboard calculations. A production LLM can later replace only the language/intent layer.</small>
  </aside>;
}
