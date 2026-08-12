import type { DataRow, ImpactDirection, InvestigationResult, Predicate } from '../types';
import type { DataQualityReport } from './dataQuality';
import type { NewsAnalysisResult, NewsArticle } from './newsIntel';

export type PlanningLens = 'revenue' | 'opex' | 'capex' | 'marketing' | 'corporate' | 'workforce';

export interface PlanningLensDefinition {
  id: PlanningLens;
  label: string;
  plainLanguage: string;
  commonQuestions: string[];
  topicWeights: Record<string, number>;
  dimensionHints: string[];
}

export interface FpaNarrative {
  headline: string;
  whatChanged: string;
  whereToLook: string;
  whyHypothesis: string;
  nextBestAction: string;
  caveat: string;
}

export interface WhyFactor {
  id: string;
  title: string;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  angle: 'active' | 'passive' | 'manual';
  impactDirection: ImpactDirection;
  source: string;
  publishedAt: string;
  topics: string[];
  sentiment: string;
  evidence: string[];
  validationPlan: string;
  article?: NewsArticle;
}

export const planningLenses: PlanningLensDefinition[] = [
  {
    id: 'revenue',
    label: 'Revenue / Sales',
    plainLanguage: 'Find revenue leakage, pricing pressure, channel mix, product mix, customer mix, and volume drivers.',
    commonQuestions: ['Which segment explains the missed plan?', 'Is this pricing, volume, mix, or timing?', 'Which favorable areas offset the miss?'],
    topicWeights: { 'competition/pricing': 1.4, 'product/technology': 1.15, financial: 1.1, operations: 0.85 },
    dimensionHints: ['channel', 'product', 'productFamily', 'productLine', 'offer', 'promo', 'customer', 'segment', 'acquisition'],
  },
  {
    id: 'opex',
    label: 'OpEx / Expense',
    plainLanguage: 'Explain cost pressure, labor, vendor, fulfillment, support, operations, and run-rate changes.',
    commonQuestions: ['Which cost center or vendor is driving the overrun?', 'Is this rate, usage, headcount, or one-time spend?', 'Which costs are persistent?'],
    topicWeights: { operations: 1.35, 'labor/workforce': 1.25, 'regulatory/legal': 1.05, financial: 0.9 },
    dimensionHints: ['vendor', 'expense', 'cost', 'fulfillment', 'support', 'service', 'employee', 'inventory'],
  },
  {
    id: 'capex',
    label: 'CapEx / Investment',
    plainLanguage: 'Track project timing, network build, technology programs, assets, and budget capitalization movement.',
    commonQuestions: ['Is the variance timing or scope?', 'Which project or asset class moved?', 'Does external build activity explain the change?'],
    topicWeights: { 'product/technology': 1.35, operations: 1.2, financial: 1.0, 'regulatory/legal': 0.95 },
    dimensionHints: ['project', 'asset', 'network', 'technology', 'fiber', 'market', 'region', 'capacity'],
  },
  {
    id: 'marketing',
    label: 'Marketing / Demand Gen',
    plainLanguage: 'Connect campaign, offer, acquisition, channel, competitor promotion, and conversion movement.',
    commonQuestions: ['Which campaign or offer drove the gap?', 'Is the variance channel mix or conversion?', 'Did competitor promotion create pressure?'],
    topicWeights: { 'competition/pricing': 1.45, 'product/technology': 1.05, financial: 0.85, operations: 0.7 },
    dimensionHints: ['campaign', 'offer', 'promo', 'acquisition', 'channel', 'source', 'social', 'search'],
  },
  {
    id: 'corporate',
    label: 'Corporate / G&A',
    plainLanguage: 'Explain enterprise-level movement such as legal, regulatory, corporate allocations, one-time charges, and financial guidance.',
    commonQuestions: ['Is this recurring or one-time?', 'Which corporate line item moved?', 'Is there a legal, regulatory, or guidance event?'],
    topicWeights: { financial: 1.25, 'regulatory/legal': 1.35, 'labor/workforce': 1.05, operations: 0.8 },
    dimensionHints: ['corporate', 'legal', 'regulatory', 'finance', 'allocation', 'department', 'businessUnit'],
  },
  {
    id: 'workforce',
    label: 'Workforce / Headcount',
    plainLanguage: 'Investigate headcount, hiring, attrition, labor actions, workforce mix, and productivity movement.',
    commonQuestions: ['Is the change headcount or productivity?', 'Which employee group or location moved?', 'Did labor events overlap the movement?'],
    topicWeights: { 'labor/workforce': 1.5, operations: 1.0, financial: 0.8, 'regulatory/legal': 0.75 },
    dimensionHints: ['employee', 'headcount', 'labor', 'workforce', 'team', 'department', 'region'],
  },
];

const fallbackLens = planningLenses[0];

export function getPlanningLens(id: PlanningLens) {
  return planningLenses.find((lens) => lens.id === id) ?? fallbackLens;
}

function compact(value: number) {
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function humanize(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_.-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalized(value: unknown) {
  return String(value ?? '').toLowerCase();
}

function categoryValue(value: unknown) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '') ? '(missing)' : String(value).trim();
}

function rowsInScope(rows: DataRow[], predicates: Predicate[]) {
  return rows.filter((row) => predicates.every((predicate) => categoryValue(row[predicate.dimension]) === predicate.value));
}

function monthKey(value: unknown) {
  const raw = String(value ?? '').trim();
  const match = raw.match(/(20\d{2})[-/](0?[1-9]|1[0-2])/);
  if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`;
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return new Date(date).toISOString().slice(0, 7);
  return '';
}

function scopeMonths(rows: DataRow[]) {
  const columns = rows.length ? Object.keys(rows[0]).filter((column) => /(month|date|period|week|quarter)/i.test(column)) : [];
  const months = new Set<string>();
  for (const row of rows.slice(0, 5000)) {
    for (const column of columns) {
      const month = monthKey(row[column]);
      if (month) months.add(month);
    }
  }
  return months;
}

function textMatches(text: string, values: string[]) {
  return values.filter((value) => value && text.includes(value.toLowerCase()));
}

function dimensionTopicHints(result: InvestigationResult) {
  const names = result.dimensionScores.slice(0, 8).map((score) => score.dimension.toLowerCase());
  const hints = new Set<string>();
  if (names.some((name) => /(inventory|fulfillment|service|support|store)/.test(name))) hints.add('operations');
  if (names.some((name) => /(offer|promo|price|channel|acquisition|campaign|source)/.test(name))) hints.add('competition/pricing');
  if (names.some((name) => /(product|device|fiber|wireless|plan|technology|network)/.test(name))) hints.add('product/technology');
  if (names.some((name) => /(employee|labor|workforce|headcount)/.test(name))) hints.add('labor/workforce');
  if (names.some((name) => /(legal|regulatory|settlement|fine)/.test(name))) hints.add('regulatory/legal');
  return hints;
}

function validationPlan(topics: string[], lens: PlanningLensDefinition, factorTitle: string) {
  if (topics.includes('operations')) return 'Validate by comparing affected operational cohorts against unaffected cohorts in the same period: inventory status, fulfillment method, support tier, market, and channel.';
  if (topics.includes('competition/pricing')) return 'Validate by comparing offer, promo, channel, acquisition source, and win-rate or conversion movement before/during the competitor or pricing event.';
  if (topics.includes('product/technology')) return 'Validate by comparing product family, product line, device/technology category, market coverage, and customer segment in the event window.';
  if (topics.includes('labor/workforce')) return 'Validate by comparing headcount, staffing, queue/backlog, productivity, and affected locations before and after the workforce event.';
  if (topics.includes('regulatory/legal')) return 'Validate by checking whether legal/regulatory timing aligns with booked expense, accruals, reserves, or policy-driven customer behavior.';
  if (lens.id === 'capex') return 'Validate project timing: compare planned versus actual spend, in-service dates, geography, vendor, and asset category around the event.';
  return `Validate whether "${factorTitle}" overlaps the variance by time, geography, product, channel, and affected account group before treating it as a cause.`;
}

export function buildFpaNarrative(result: InvestigationResult, quality: DataQualityReport, lensId: PlanningLens): FpaNarrative {
  const lens = getPlanningLens(lensId);
  const amount = compact(Math.abs(result.businessImpact));
  const direction = result.impactDirection;
  const top = result.dimensionScores[0];
  const interaction = result.interactions[0];
  const qualityCaveat = quality.blockers
    ? `Data-quality caution: ${quality.blockers} blocker(s) may change the interpretation.`
    : quality.warnings
      ? `Data-quality note: ${quality.warnings} warning(s) should be reviewed but the data passed the automatic readiness gate.`
      : 'Data quality did not surface major automatic blockers.';

  return {
    headline: `${lens.label}: ${amount} ${direction} business impact`,
    whatChanged: `Actual performance differs from expectation by ${compact(Math.abs(result.variance))} raw variance, which translates to ${amount} ${direction} business impact under the selected metric direction.`,
    whereToLook: top?.topCategory
      ? `${humanize(top.dimension)} is the strongest single factor. ${top.topCategory.value} explains ${compact(Math.abs(top.topCategory.businessImpact))} of business impact and covers ${(top.topCategory.support * 100).toFixed(1)}% of valid rows.`
      : 'No stable single-factor driver passed the current scan. Review data quality and measure selection first.',
    whyHypothesis: interaction
      ? `The strongest combined pattern is ${interaction.predicates.map((predicate) => `${humanize(predicate.dimension)} = ${predicate.value}`).join(' + ')}, with ${compact(Math.abs(interaction.businessImpact))} business impact. External signals should be tested against this cohort first.`
      : 'Use external factors as hypotheses only. Test them against the top contributing cohort before making a planning assumption.',
    nextBestAction: lens.commonQuestions[0],
    caveat: `${qualityCaveat} External factors are directional hypotheses, not proof of causality until overlap is tested.`,
  };
}

export function scoreWhyFactors({
  rows,
  predicates,
  result,
  newsAnalysis,
  lensId,
}: {
  rows: DataRow[];
  predicates: Predicate[];
  result: InvestigationResult;
  newsAnalysis: NewsAnalysisResult | null;
  lensId: PlanningLens;
}): WhyFactor[] {
  if (!newsAnalysis?.articles?.length) return [];
  const lens = getPlanningLens(lensId);
  const scopedRows = rowsInScope(rows, predicates);
  const months = scopeMonths(scopedRows.length ? scopedRows : rows);
  const driverHints = dimensionTopicHints(result);
  const topDriver = result.dimensionScores[0];
  const topDriverValues = [
    topDriver?.dimension,
    topDriver?.topCategory?.value,
    ...result.interactions.slice(0, 2).flatMap((interaction) => interaction.predicates.map((predicate) => predicate.value)),
    ...predicates.map((predicate) => predicate.value),
  ].filter(Boolean).map(String);

  return newsAnalysis.articles.map((article, index) => {
    const text = `${article.title} ${article.snippet} ${article.tags.join(' ')}`.toLowerCase();
    const topics = [...new Set(article.tags.length ? article.tags : ['market context'])];
    const weightedTopic = topics.reduce((score, topic) => score + (lens.topicWeights[topic] ?? (driverHints.has(topic) ? 0.8 : 0.35)), 0);
    const topicScore = Math.min(28, weightedTopic * 10);
    const driverMatches = textMatches(text, topDriverValues);
    const driverScore = Math.min(22, driverMatches.length * 8);
    const articleMonth = monthKey(article.publishedAt);
    const timeScore = articleMonth && months.has(articleMonth) ? 16 : articleMonth ? 8 : 4;
    const directionScore = result.impactDirection === 'unfavorable'
      ? (article.sentiment === 'negative' ? 16 : article.sentiment === 'positive' ? 6 : 9)
      : result.impactDirection === 'favorable'
        ? (article.sentiment === 'positive' ? 14 : article.sentiment === 'negative' ? 5 : 8)
        : 6;
    const angleScore = article.angle === 'active' ? 12 : 10;
    const competitionBoost = article.angle === 'passive' && topics.includes('competition/pricing') ? 9 : 0;
    const rawScore = Math.min(100, Math.round(topicScore + driverScore + timeScore + directionScore + angleScore + competitionBoost));
    const confidence = rawScore >= 72 ? 'high' : rawScore >= 48 ? 'medium' : 'low';
    const evidence = [
      article.angle === 'active' ? 'Direct company coverage' : 'Competitor / market coverage',
      topics.length ? `Theme overlap: ${topics.join(', ')}` : 'No strong topic tag detected',
      articleMonth && months.has(articleMonth) ? `Timing overlap with loaded data period ${articleMonth}` : articleMonth ? `Article date ${articleMonth}; confirm whether that is in the variance window` : 'No reliable article date detected',
      driverMatches.length ? `Mentions current driver clue(s): ${[...new Set(driverMatches)].slice(0, 3).join(', ')}` : `No direct mention of the current top driver (${topDriver ? humanize(topDriver.dimension) : 'none'})`,
    ];

    return {
      id: `${article.angle}-${index}-${article.url || article.title}`,
      title: article.title,
      score: rawScore,
      confidence,
      angle: article.angle,
      impactDirection: result.impactDirection,
      source: article.source,
      publishedAt: article.publishedAt,
      topics,
      sentiment: article.sentiment,
      evidence,
      validationPlan: validationPlan(topics, lens, article.title),
      article,
    } satisfies WhyFactor;
  }).sort((a, b) => b.score - a.score).slice(0, 8);
}
