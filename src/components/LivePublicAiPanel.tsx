import { useMemo, useState } from 'react';
import { askEvidenceLlm } from '../lib/llm';
import type { LlmConfig } from '../lib/llm';
import type { LivePublicFinanceResult } from '../lib/livePublicFinance';

interface Message { role: 'user' | 'assistant'; text: string; }

function stored(key: string, fallback = '') {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function initialConfig(): LlmConfig {
  return {
    enabled: false,
    endpoint: stored('anomaly-llm-endpoint'),
    model: stored('anomaly-llm-model'),
    apiKey: '',
    authHeader: stored('anomaly-llm-auth-header', 'Authorization'),
    authPrefix: stored('anomaly-llm-auth-prefix', 'Bearer '),
  };
}

const money = (value: number) => Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
}).format(value);

function evidence(result: LivePublicFinanceResult) {
  return {
    source: result.source,
    scope: result.scopeLabel,
    activeFilter: result.filter,
    sourceRows: result.fullSource.rowCount,
    scopedRows: result.scopedSource.rowCount,
    scopedPayments: result.scopedSource.totalAmount,
    coverage: { minDate: result.scopedSource.minDate, maxDate: result.scopedSource.maxDate },
    benchmark: result.benchmarkMethod,
    latestMonth: result.currentMonth,
    biggestUnfavorableMonth: result.biggestUnfavorableMonth,
    trailing12Amount: result.trailing12Amount,
    trailing12Impact: result.trailing12Impact,
    trend: result.trend,
    analysisHealth: result.analysisHealth,
    queryRuntimeMs: result.queryDurationMs,
    requestCount: result.requestCount,
    topDimensions: result.dimensions.map((dimension) => ({
      dimension: dimension.label,
      description: dimension.description,
      error: dimension.error,
      leadingCategories: dimension.values.slice(0, 5),
    })),
    warnings: result.warnings,
  };
}

function deterministicAnswer(question: string, result: LivePublicFinanceResult) {
  const lower = question.toLowerCase();
  const latest = result.currentMonth;
  const biggest = result.biggestUnfavorableMonth;
  const leadingDimensions = result.dimensions
    .filter((dimension) => dimension.values[0])
    .map((dimension) => ({ dimension, value: dimension.values[0] }))
    .sort((left, right) => right.value.shareOfSpend - left.value.shareOfSpend);
  const top = leadingDimensions[0];

  if (/(trust|quality|reliable|health|method)/.test(lower)) {
    return `The live analysis-health score is ${result.analysisHealth.toFixed(0)}/100. The source contains ${result.fullSource.rowCount.toLocaleString()} records, while the browser receives only server-side aggregates. The main limitation is that this dataset has no approved budget or forecast, so the comparison is a six-period rolling historical benchmark rather than an official plan variance.`;
  }
  if (/(unusual|anomal|worst|largest month)/.test(lower)) {
    return biggest
      ? `${biggest.label} is the largest unfavorable month in the returned history, with ${money(Math.abs(biggest.businessImpact))} unfavorable impact versus the rolling benchmark and an anomaly score of ${biggest.anomalyScore.toFixed(1)}. Validate whether this reflects timing, one-time payments, or a sustained run-rate change before treating it as an operating problem.`
      : 'No unfavorable month was returned above the current materiality and anomaly thresholds.';
  }
  if (/(dimension|concentrat|vendor|department|fund|account|driver)/.test(lower)) {
    return top
      ? `${top.dimension.label} currently shows the largest leading-category concentration. ${top.value.value} accounts for ${(top.value.shareOfSpend * 100).toFixed(1)}% of selected-scope payments, or ${money(top.value.amount)}. This is a concentration signal, not proof that the category caused the time variance; compare its monthly pattern with unaffected categories next.`
      : 'The dimension queries did not return a stable leading category. Retry the live scan or review the source-query warnings.';
  }
  if (/(next|investigate|action|recommend)/.test(lower)) {
    return top
      ? `Start with ${top.dimension.label} = ${top.value.value}. Use Focus to rerun the monthly pulse and all ten dimensions for that cohort, then compare the latest-month benchmark impact with the unfiltered population. If the gap persists, review the leading vendor, account, fund, and expenditure-type categories inside that cohort.`
      : 'Start by choosing a dimension with complete results, focus its leading category, and compare the recalculated monthly pulse with the full population.';
  }

  return latest
    ? `The selected live scope contains ${result.scopedSource.rowCount.toLocaleString()} procurement-payment records totaling ${money(result.scopedSource.totalAmount)}. ${latest.label} contains ${money(latest.actual)} of payments and is ${money(Math.abs(latest.businessImpact))} ${latest.businessImpact < 0 ? 'unfavorable' : 'favorable'} versus the rolling benchmark. Recent momentum is ${result.trend}. ${top ? `${top.dimension.label} = ${top.value.value} is the strongest concentration to validate next.` : ''}`
    : `The selected live scope contains ${result.scopedSource.rowCount.toLocaleString()} records totaling ${money(result.scopedSource.totalAmount)}, but no monthly result was returned.`;
}

export function LivePublicAiPanel({ result }: { result: LivePublicFinanceResult }) {
  const [llm, setLlm] = useState<LlmConfig>(() => initialConfig());
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: 'The finance guide is ready. Connect an LLM below for a richer executive review of the same verified live aggregates.' },
  ]);
  const suggestions = useMemo(() => [
    'Summarize this live dataset for a CFO',
    'Which dimension is most concentrated?',
    'What is the most unusual month?',
    'What should I investigate next?',
    'Can I trust this analysis?',
  ], []);

  function saveConfig(next: LlmConfig) {
    setLlm(next);
    try {
      localStorage.setItem('anomaly-llm-endpoint', next.endpoint);
      localStorage.setItem('anomaly-llm-model', next.model);
      localStorage.setItem('anomaly-llm-auth-header', next.authHeader);
      localStorage.setItem('anomaly-llm-auth-prefix', next.authPrefix);
    } catch {
      // The live demo remains usable if browser storage is unavailable.
    }
  }

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const fallback = deterministicAnswer(question, result);
    setMessages((previous) => [...previous, { role: 'user', text: question }]);
    setInput('');

    if (!llm.enabled) {
      setMessages((previous) => [...previous, { role: 'assistant', text: fallback }]);
      return;
    }

    setBusy(true);
    try {
      const output = await askEvidenceLlm(question, llm, {
        title: 'City of Los Angeles procurement live public-data review',
        evidence: evidence(result),
        instructions: [
          'The metric is procurement payment spend, so lower spend versus the historical benchmark is treated as favorable and higher spend as unfavorable.',
          'The historical benchmark is not an official City budget, forecast, or accounting plan.',
          'Top dimension categories indicate concentration only; do not call them causal drivers without a tested time relationship.',
        ],
      });
      setMessages((previous) => [...previous, { role: 'assistant', text: output }]);
    } catch (error) {
      setMessages((previous) => [...previous, { role: 'assistant', text: `${fallback}\n\nLLM connection note: ${error instanceof Error ? error.message : String(error)}` }]);
    } finally {
      setBusy(false);
    }
  }

  return <section className="live-ai-panel" aria-label="AI review for the live public dataset">
    <div className="live-ai-intro"><div><span>VISIBLE AI / LLM OPTION</span><h3>Review 3.8M live records through verified aggregates.</h3><p>The built-in finance guide works immediately. Enable your own OpenAI-compatible endpoint to generate an executive narrative from the live monthly and ten-dimension evidence.</p></div><b>{llm.enabled ? 'LLM ON' : 'GUIDE MODE'}</b></div>

    <div className="live-ai-settings">
      <div className="live-ai-settings-head"><strong>Bring your own LLM</strong><label><input type="checkbox" checked={llm.enabled} onChange={(event) => saveConfig({ ...llm, enabled: event.target.checked })} /> Enable LLM</label></div>
      <label>Chat-completions endpoint<input value={llm.endpoint} onChange={(event) => saveConfig({ ...llm, endpoint: event.target.value })} placeholder="https://your-host/.../chat/completions" /></label>
      <div><label>Model<input value={llm.model} onChange={(event) => saveConfig({ ...llm, model: event.target.value })} placeholder="model-name" /></label><label>API key<input type="password" value={llm.apiKey} onChange={(event) => setLlm({ ...llm, apiKey: event.target.value })} placeholder="Not saved" autoComplete="off" /></label></div>
      <div><label>Auth header<input value={llm.authHeader} onChange={(event) => saveConfig({ ...llm, authHeader: event.target.value })} /></label><label>Auth prefix<input value={llm.authPrefix} onChange={(event) => saveConfig({ ...llm, authPrefix: event.target.value })} placeholder="Bearer " /></label></div>
      <small>The API key stays in page memory only. Browser requests require CORS. A production deployment should use a secured server-side LLM gateway.</small>
    </div>

    <div className="live-ai-conversation">
      <div className="live-ai-messages" aria-live="polite">{messages.slice(-6).map((message, index) => <article key={`${message.role}-${index}`} className={message.role}><span>{message.role === 'assistant' ? (llm.enabled ? 'AI analyst' : 'Finance guide') : 'You'}</span><p>{message.text}</p></article>)}</div>
      <div className="live-ai-suggestions">{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => ask(suggestion)}>{suggestion}</button>)}</div>
      <div className="live-ai-input"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') ask(input); }} placeholder="Ask about concentration, unusual months, or next actions" /><button type="button" disabled={busy} onClick={() => ask(input)}>{busy ? 'Thinking…' : 'Ask'}</button></div>
    </div>
  </section>;
}
