import { useState } from 'react';
import { analyzeExternalNews } from '../lib/newsIntel';
import type { NewsAnalysisResult, NewsProvider } from '../lib/newsIntel';

const providers: Array<{ id: NewsProvider; label: string; note: string; needsKey: boolean }> = [
  { id: 'gdelt', label: 'GDELT public news', note: 'No key, broad global coverage', needsKey: false },
  { id: 'newsapi', label: 'NewsAPI', note: 'User API key required', needsKey: true },
  { id: 'guardian', label: 'Guardian Open Platform', note: 'User API key required', needsKey: true },
];

export function NewsIntelPanel({ onContextReady }: { onContextReady: (context: string) => void }) {
  const [provider, setProvider] = useState<NewsProvider>('gdelt');
  const [company, setCompany] = useState('Verizon');
  const [competitors, setCompetitors] = useState('AT&T, T-Mobile, Comcast, Charter');
  const [days, setDays] = useState(30);
  const [apiKey, setApiKey] = useState('');
  const [result, setResult] = useState<NewsAnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectedProvider = providers.find((p) => p.id === provider)!;

  async function scan() {
    setBusy(true);
    setError('');
    try {
      const analysis = await analyzeExternalNews({ provider, company, competitors, days, apiKey });
      setResult(analysis);
      onContextReady(analysis.contextText);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return <section className="news-panel" aria-label="External news intelligence">
    <div className="news-head">
      <div><span className="chat-kicker">EXTERNAL FACTORS</span><h2>Public news context</h2></div>
      <button type="button" onClick={scan} disabled={busy}>{busy ? 'Scanning…' : 'Scan news'}</button>
    </div>

    <p className="news-intro">Check direct company coverage and competitor / market coverage, then send the summary into Ask the Data as hypothesis context.</p>

    <div className="news-form">
      <label>Company<input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Verizon" /></label>
      <label>Competitors / market terms<input value={competitors} onChange={(e) => setCompetitors(e.target.value)} placeholder="AT&T, T-Mobile, Comcast" /></label>
      <div className="settings-row">
        <label>Provider<select value={provider} onChange={(e) => setProvider(e.target.value as NewsProvider)}>{providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <label>Lookback days<input type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value) || 30)} /></label>
      </div>
      {selectedProvider.needsKey && <label>API key<input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Not saved" autoComplete="off" /></label>}
      <small>{selectedProvider.note}. Browser-based calls require the provider endpoint to allow CORS.</small>
    </div>

    {error && <div className="inline-error">{error}</div>}

    {result && <div className="news-results">
      <div className="news-summary"><strong>{result.headlineSummary}</strong><span>Active: {result.activeCount} direct articles · Passive: {result.passiveCount} competitor/market articles</span></div>
      <div className="news-query-pills"><span>Active: {result.activeQuery}</span><span>Passive: {result.passiveQuery}</span></div>
      <div className="news-list">
        {result.articles.slice(0, 6).map((article) => <a key={article.url} href={article.url} target="_blank" rel="noreferrer" className={`news-card ${article.angle}`}>
          <span>{article.angle === 'active' ? 'Direct company news' : 'Competitor / market news'} · {article.sentiment}</span>
          <strong>{article.title}</strong>
          <small>{article.source}{article.publishedAt ? ` · ${article.publishedAt}` : ''}{article.tags.length ? ` · ${article.tags.join(', ')}` : ''}</small>
        </a>)}
      </div>
      <button className="quiet-button full-width" type="button" onClick={() => onContextReady(result.contextText)}>Send news context to Ask the Data</button>
    </div>}
  </section>;
}
