import { demoNewsArticles } from '../data/demoNews';

export type NewsProvider = 'demo' | 'gdelt' | 'newsapi' | 'guardian';
export type NewsAngle = 'active' | 'passive';
export type NewsSentiment = 'positive' | 'negative' | 'neutral';

export interface NewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  snippet: string;
  angle: NewsAngle;
  sentiment: NewsSentiment;
  tags: string[];
}

export interface NewsAnalysisOptions {
  provider: NewsProvider;
  company: string;
  competitors: string;
  days: number;
  apiKey?: string;
}

export interface NewsAnalysisResult {
  provider: NewsProvider;
  company: string;
  activeQuery: string;
  passiveQuery: string;
  activeCount: number;
  passiveCount: number;
  articles: NewsArticle[];
  contextText: string;
  headlineSummary: string;
}

const positiveWords = [
  'growth', 'upgrade', 'expansion', 'partnership', 'award', 'approval', 'beat', 'strong',
  'launch', 'record', 'gain', 'improve', 'capacity', 'recovery', 'adds', 'opportunity',
];

const negativeWords = [
  'outage', 'lawsuit', 'investigation', 'fine', 'decline', 'miss', 'layoff', 'breach',
  'complaint', 'strike', 'recall', 'shortage', 'disruption', 'downgrade', 'weak',
  'fraud', 'settlement', 'constraint', 'pressure', 'slow', 'slower', 'risk',
];

const tagRules: Array<[string, string[]]> = [
  ['operations', ['outage', 'network', 'service disruption', 'availability', 'fulfillment', 'shipment', 'shortage', 'supply', 'support', 'replenishment']],
  ['competition/pricing', ['price', 'pricing', 'discount', 'promotion', 'bundle', 'competitor', 'market share', 'switcher', 'trade-in']],
  ['regulatory/legal', ['lawsuit', 'investigation', 'regulator', 'fcc', 'fine', 'settlement', 'court', 'antitrust', 'policy']],
  ['financial', ['earnings', 'revenue', 'profit', 'subscriber', 'guidance', 'forecast', 'quarter', 'adds']],
  ['labor/workforce', ['union', 'strike', 'layoff', 'hiring', 'workforce', 'contract']],
  ['product/technology', ['5g', 'fiber', 'broadband', 'device', 'wireless', 'spectrum', 'network upgrade', 'capacity']],
];

function csvList(value: string) {
  return value.split(',').map((x) => x.trim()).filter(Boolean);
}

function quoteTerm(value: string) {
  const clean = value.replace(/"/g, '').trim();
  return clean.includes(' ') ? `"${clean}"` : clean;
}

function buildQueries(company: string, competitors: string) {
  const companyTerm = quoteTerm(company || 'company');
  const competitorTerms = csvList(competitors).map(quoteTerm);
  const passiveTerms = competitorTerms.length ? competitorTerms : ['telecom', 'wireless', 'broadband', '5G', 'fiber'];
  return {
    activeQuery: companyTerm,
    passiveQuery: passiveTerms.join(' OR '),
  };
}

function toSentiment(text: string): NewsSentiment {
  const lower = text.toLowerCase();
  const positive = positiveWords.filter((w) => lower.includes(w)).length;
  const negative = negativeWords.filter((w) => lower.includes(w)).length;
  if (negative > positive) return 'negative';
  if (positive > negative) return 'positive';
  return 'neutral';
}

function toTags(text: string) {
  const lower = text.toLowerCase();
  return tagRules.filter(([, terms]) => terms.some((t) => lower.includes(t))).map(([tag]) => tag);
}

function sourceFromUrl(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'news source'; }
}

function normalizeDate(value: unknown) {
  if (!value) return '';
  const raw = String(value);
  if (/^\d{14}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return raw.slice(0, 19).replace('T', ' ');
}

function decorate(article: Omit<NewsArticle, 'sentiment' | 'tags'> & Partial<Pick<NewsArticle, 'sentiment' | 'tags'>>): NewsArticle {
  const text = `${article.title} ${article.snippet}`;
  return {
    ...article,
    sentiment: article.sentiment ?? toSentiment(text),
    tags: article.tags?.length ? article.tags : toTags(text),
  };
}

function templateCompany(text: string, company: string) {
  return text.replace(/\{\{company\}\}/g, company);
}

function fetchDemoNews(angle: NewsAngle, company: string): Promise<NewsArticle[]> {
  const rows = demoNewsArticles
    .filter((article) => article.angle === angle)
    .map((article) => decorate({
      title: templateCompany(article.title, company),
      url: article.url,
      source: article.source,
      publishedAt: article.publishedAt,
      snippet: templateCompany(article.snippet, company),
      angle: article.angle,
      sentiment: article.sentiment,
      tags: [...article.tags],
    }));
  return Promise.resolve(rows);
}

async function fetchGdelt(query: string, angle: NewsAngle, days: number): Promise<NewsArticle[]> {
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.searchParams.set('query', query);
  url.searchParams.set('mode', 'artlist');
  url.searchParams.set('format', 'json');
  url.searchParams.set('maxrecords', '30');
  url.searchParams.set('timespan', `${Math.max(1, Math.min(days, 90))}d`);
  url.searchParams.set('sort', 'hybridrel');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`GDELT request failed (${res.status}).`);
  const json = await res.json();
  const raw = Array.isArray(json.articles) ? json.articles : [];

  return raw.map((item: any) => decorate({
    title: String(item.title || 'Untitled article'),
    url: String(item.url || ''),
    source: String(item.domain || item.sourceCollectionIdentifier || sourceFromUrl(String(item.url || ''))),
    publishedAt: normalizeDate(item.seendate || item.datetime || item.date),
    snippet: String(item.context || item.excerpt || item.title || ''),
    angle,
  })).filter((x: NewsArticle) => x.url && x.title);
}

async function fetchNewsApi(query: string, angle: NewsAngle, days: number, apiKey?: string): Promise<NewsArticle[]> {
  if (!apiKey) throw new Error('NewsAPI requires an API key.');
  const from = new Date(Date.now() - Math.max(1, days) * 86400000).toISOString().slice(0, 10);
  const url = new URL('https://newsapi.org/v2/everything');
  url.searchParams.set('q', query);
  url.searchParams.set('from', from);
  url.searchParams.set('language', 'en');
  url.searchParams.set('sortBy', 'publishedAt');
  url.searchParams.set('pageSize', '30');

  const res = await fetch(url.toString(), { headers: { 'X-Api-Key': apiKey } });
  if (!res.ok) throw new Error(`NewsAPI request failed (${res.status}).`);
  const json = await res.json();
  const raw = Array.isArray(json.articles) ? json.articles : [];

  return raw.map((item: any) => decorate({
    title: String(item.title || 'Untitled article'),
    url: String(item.url || ''),
    source: String(item.source?.name || sourceFromUrl(String(item.url || ''))),
    publishedAt: normalizeDate(item.publishedAt),
    snippet: String(item.description || item.content || ''),
    angle,
  })).filter((x: NewsArticle) => x.url && x.title);
}

async function fetchGuardian(query: string, angle: NewsAngle, days: number, apiKey?: string): Promise<NewsArticle[]> {
  if (!apiKey) throw new Error('The Guardian Open Platform requires an API key.');
  const from = new Date(Date.now() - Math.max(1, days) * 86400000).toISOString().slice(0, 10);
  const url = new URL('https://content.guardianapis.com/search');
  url.searchParams.set('q', query);
  url.searchParams.set('from-date', from);
  url.searchParams.set('order-by', 'newest');
  url.searchParams.set('page-size', '30');
  url.searchParams.set('show-fields', 'trailText');
  url.searchParams.set('api-key', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Guardian request failed (${res.status}).`);
  const json = await res.json();
  const raw = Array.isArray(json.response?.results) ? json.response.results : [];

  return raw.map((item: any) => decorate({
    title: String(item.webTitle || 'Untitled article'),
    url: String(item.webUrl || ''),
    source: 'The Guardian',
    publishedAt: normalizeDate(item.webPublicationDate),
    snippet: String(item.fields?.trailText || ''),
    angle,
  })).filter((x: NewsArticle) => x.url && x.title);
}

async function fetchByProvider(provider: NewsProvider, query: string, angle: NewsAngle, days: number, apiKey: string | undefined, company: string) {
  if (provider === 'demo') return fetchDemoNews(angle, company);
  if (provider === 'newsapi') return fetchNewsApi(query, angle, days, apiKey);
  if (provider === 'guardian') return fetchGuardian(query, angle, days, apiKey);
  return fetchGdelt(query, angle, days);
}

function dedupe(articles: NewsArticle[]) {
  const seen = new Set<string>();
  return articles.filter((article) => {
    const key = article.url || article.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarize(articles: NewsArticle[], company: string) {
  const active = articles.filter((a) => a.angle === 'active');
  const passive = articles.filter((a) => a.angle === 'passive');
  const negatives = articles.filter((a) => a.sentiment === 'negative').length;
  const positives = articles.filter((a) => a.sentiment === 'positive').length;
  const tagCounts = new Map<string, number>();
  for (const article of articles) for (const tag of article.tags) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([tag]) => tag);
  const tone = negatives > positives ? 'risk-heavy' : positives > negatives ? 'opportunity-leaning' : 'mixed/neutral';
  return `${company || 'Company'} news scan found ${active.length} direct company articles and ${passive.length} competitor/market articles. The public-news tone is ${tone}${topTags.length ? `, with recurring themes around ${topTags.join(', ')}` : ''}.`;
}

export function createDemoNewsAnalysis(company = 'Verizon', competitors = 'AT&T, T-Mobile, Comcast, Charter'): NewsAnalysisResult {
  const { activeQuery, passiveQuery } = buildQueries(company, competitors);
  const articles = dedupe(demoNewsArticles.map((article) => decorate({
    title: templateCompany(article.title, company),
    url: article.url,
    source: article.source,
    publishedAt: article.publishedAt,
    snippet: templateCompany(article.snippet, company),
    angle: article.angle,
    sentiment: article.sentiment,
    tags: [...article.tags],
  })));
  const activeCount = articles.filter((a) => a.angle === 'active').length;
  const passiveCount = articles.filter((a) => a.angle === 'passive').length;
  const headlineSummary = summarize(articles, company);
  const contextText = buildContextText({
    provider: 'demo',
    company,
    activeQuery,
    passiveQuery,
    articles,
    headlineSummary,
  });
  return { provider: 'demo', company, activeQuery, passiveQuery, activeCount, passiveCount, articles, contextText, headlineSummary };
}

function buildContextText({
  provider,
  company,
  activeQuery,
  passiveQuery,
  articles,
  headlineSummary,
}: Pick<NewsAnalysisResult, 'provider' | 'company' | 'activeQuery' | 'passiveQuery' | 'articles' | 'headlineSummary'>) {
  const top = articles.slice(0, 8).map((a, i) => `${i + 1}. [${a.angle}; ${a.sentiment}; ${a.tags.join(', ') || 'untagged'}] ${a.title} — ${a.source}${a.publishedAt ? ` (${a.publishedAt})` : ''}`).join('\n');
  return [
    `PUBLIC NEWS CONTEXT FOR ${company}`,
    `Provider: ${provider}`,
    `Active/direct query: ${activeQuery}`,
    `Passive/competitor-market query: ${passiveQuery}`,
    headlineSummary,
    'Use this as external context only. Treat it as hypothesis material, not proof of causality.',
    top ? `Top articles:\n${top}` : 'No articles returned.',
  ].join('\n');
}

export async function analyzeExternalNews(options: NewsAnalysisOptions): Promise<NewsAnalysisResult> {
  const company = options.company.trim() || 'Verizon';
  const { activeQuery, passiveQuery } = buildQueries(company, options.competitors);

  const [active, passive] = await Promise.all([
    fetchByProvider(options.provider, activeQuery, 'active', options.days, options.apiKey, company),
    fetchByProvider(options.provider, passiveQuery, 'passive', options.days, options.apiKey, company),
  ]);

  const articles = dedupe([...active, ...passive]).slice(0, 40);
  const headlineSummary = summarize(articles, company);
  const contextText = buildContextText({ provider: options.provider, company, activeQuery, passiveQuery, articles, headlineSummary });

  return {
    provider: options.provider,
    company,
    activeQuery,
    passiveQuery,
    activeCount: active.length,
    passiveCount: passive.length,
    articles,
    contextText,
    headlineSummary,
  };
}
