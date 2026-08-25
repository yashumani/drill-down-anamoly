import type { DataQualityReport } from './dataQuality';
import type { DatasetSession } from './datasetSession';
import type { PlanningLens } from './fpaInsights';
import { planningLenses } from './fpaInsights';
import type { MetricDefinition } from './metricSemantics';
import type { FinanceTimeSeriesResult } from './timeIntelligence';
import type { ImpactDirection, InvestigationResult, Predicate } from '../types';

export type PresentationPreset = 'executive' | 'anomalies' | 'questions';
export type PresentationTheme = 'paper' | 'midnight' | 'risk' | 'board';
export type PresentationDensity = 'balanced' | 'compact';
export type PresentationEmphasis = 'impact' | 'drivers' | 'anomalies' | 'questions';

export interface PresentationDesignPlan {
  title: string;
  subtitle: string;
  theme: PresentationTheme;
  density: PresentationDensity;
  emphasis: PresentationEmphasis;
  callout: string;
}

export interface PresentationQuestionAnswer {
  question: string;
  answer: string;
}

export interface PresentationDriver {
  rank: number;
  dimension: string;
  value: string;
  businessImpact: number;
  direction: ImpactDirection;
  support: number;
  score: number;
}

export interface PresentationAnomaly {
  period: string;
  businessImpact: number;
  direction: ImpactDirection;
  anomalyScore: number;
  variancePct: number | null;
  severity: string;
}

export interface PresentationTrendPoint {
  label: string;
  actual: number;
  expected: number;
  businessImpact: number;
}

export interface PresentationSlideModel {
  schemaVersion: 'presentation-slide-v1';
  generatedAt: string;
  dataset: string;
  metric: string;
  comparison: string;
  planningLens: string;
  period: string;
  scope: string;
  actual: number;
  expected: number;
  variance: number;
  businessImpact: number;
  impactDirection: ImpactDirection;
  variancePct: number | null;
  anomalyScore: number;
  anomalyLabel: string;
  analysisHealth: number;
  qualityScore: number;
  rowCount: number;
  validRowCount: number;
  dimensionsScanned: number;
  topDrivers: PresentationDriver[];
  topInteraction: string;
  anomalyPeriods: PresentationAnomaly[];
  questions: PresentationQuestionAnswer[];
  trend: PresentationTrendPoint[];
  warnings: string[];
  runId: string;
  datasetSessionId: string;
  evidenceSummary: string;
}

export interface BuildPresentationSlideOptions {
  result: InvestigationResult;
  timeSeries: FinanceTimeSeriesResult | null;
  dataQuality: DataQualityReport;
  metricDefinition: MetricDefinition;
  datasetSession: DatasetSession;
  predicates: Predicate[];
  planningLens: PlanningLens;
  actualKey: string;
  expectedKey?: string;
}

interface ThemeTokens {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  accent: string;
  favorable: string;
  unfavorable: string;
  warning: string;
  grid: string;
}

const THEMES: Record<PresentationTheme, ThemeTokens> = {
  paper: {
    background: '#F6F0E5',
    surface: '#FFFFFF',
    surfaceAlt: '#E8F7D4',
    text: '#101010',
    muted: '#5A5A5A',
    accent: '#C7F36A',
    favorable: '#16794A',
    unfavorable: '#D93535',
    warning: '#C57A00',
    grid: '#D8D2C8',
  },
  midnight: {
    background: '#111827',
    surface: '#1F2937',
    surfaceAlt: '#263244',
    text: '#F9FAFB',
    muted: '#C8D0DA',
    accent: '#78E3FF',
    favorable: '#73E2A7',
    unfavorable: '#FF7D8A',
    warning: '#FFD66B',
    grid: '#3A4658',
  },
  risk: {
    background: '#FFF5F1',
    surface: '#FFFFFF',
    surfaceAlt: '#FFE0D7',
    text: '#28100A',
    muted: '#754C43',
    accent: '#FF9B78',
    favorable: '#237A57',
    unfavorable: '#D32F2F',
    warning: '#A85E00',
    grid: '#E8C9C0',
  },
  board: {
    background: '#F1F5FA',
    surface: '#FFFFFF',
    surfaceAlt: '#DCE8F7',
    text: '#0A1D37',
    muted: '#50647C',
    accent: '#2D6CDF',
    favorable: '#147D64',
    unfavorable: '#C83E4D',
    warning: '#A86E00',
    grid: '#CBD5E1',
  },
};

const xmlEscape = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const humanize = (value: string) => value
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[_.-]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const compact = (value: number) => Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
}).format(value);

const percentage = (value: number | null) => value === null ? '—' : `${Math.abs(value * 100).toFixed(1)}%`;

function anomalyLabel(score: number) {
  if (score >= 3) return 'Very unusual';
  if (score >= 2) return 'Unusual';
  if (score >= 1) return 'Worth watching';
  return 'Normal range';
}

function planningLensLabel(value: PlanningLens) {
  return planningLenses.find((item) => item.id === value)?.label ?? humanize(value);
}

function periodLabel(timeSeries: FinanceTimeSeriesResult | null) {
  if (!timeSeries) return 'Selected analytical scope';
  const windowLabels: Record<string, string> = {
    '90d': 'Last 90 days',
    '8w': 'Last 8 weeks',
    '13w': 'Last 13 weeks',
    '15m': 'Last 15 months',
    '24m': 'Last 24 months',
    mtd: 'Month to date',
    qtd: 'Quarter to date',
    ytd: 'Year to date',
    all: 'All available periods',
  };
  return windowLabels[timeSeries.window] ?? humanize(timeSeries.window);
}

function scopeLabel(predicates: Predicate[]) {
  if (!predicates.length) return 'All business dimensions';
  return predicates.map((item) => `${humanize(item.dimension)} = ${item.value}`).join(' · ');
}

function severityFor(score: number, material: boolean | undefined) {
  if (score >= 3 || material) return 'Critical';
  if (score >= 2) return 'Watch';
  if (score >= 1) return 'Monitor';
  return 'Normal';
}

function questionAnswers(options: BuildPresentationSlideOptions): PresentationQuestionAnswer[] {
  const { result, timeSeries, dataQuality, expectedKey } = options;
  const current = timeSeries?.currentPeriod;
  const impact = current?.businessImpact ?? result.businessImpact;
  const direction = impact < 0 ? 'unfavorable' : impact > 0 ? 'favorable' : 'neutral';
  const top = result.dimensionScores[0]?.topCategory ? result.dimensionScores[0] : null;
  const comparison = expectedKey ? humanize(expectedKey) : 'the rolling historical reference';
  const pace = timeSeries?.runRate
    ? `The current run rate projects ${compact(Math.abs(timeSeries.runRate.projectedBusinessImpact))} ${timeSeries.runRate.impactDirection} business impact at period end.`
    : timeSeries
      ? `${timeSeries.trend.description}`
      : 'No usable time field was detected, so pacing cannot be evaluated.';
  const trend = timeSeries
    ? `${timeSeries.trend.description} ${timeSeries.allPoints.filter((point) => point.material || point.anomalyScore >= 2).length} material or unusual periods were flagged in the available history.`
    : 'The result is cross-sectional because no reliable time field was available.';
  const driver = top?.topCategory
    ? `${humanize(top.dimension)} = ${top.topCategory.value} is the leading supported concentration, with ${compact(Math.abs(top.topCategory.businessImpact))} ${top.topCategory.impactDirection} impact across ${(top.topCategory.support * 100).toFixed(1)}% of valid rows.`
    : 'No single factor passed the current support threshold strongly enough to lead the explanation.';
  return [
    {
      question: 'Why are we off plan?',
      answer: `${humanize(options.actualKey)} is ${compact(result.actual)} versus ${compact(result.expected)} for ${comparison}, creating ${compact(Math.abs(result.businessImpact))} ${result.impactDirection} business impact (${percentage(result.variancePct)} variance).`,
    },
    { question: 'Are we on track?', answer: pace },
    { question: 'What changed over time?', answer: trend },
    { question: 'What is driving the result?', answer: driver },
    {
      question: 'Can the result be trusted?',
      answer: `Data readiness is ${dataQuality.overallScore.toFixed(0)}/100 with ${dataQuality.blockers} blocker${dataQuality.blockers === 1 ? '' : 's'}. The analytical movement is ${anomalyLabel(result.anomalyScore).toLowerCase()} and the current direction is ${direction}.`,
    },
  ];
}

export function buildPresentationSlideModel(options: BuildPresentationSlideOptions): PresentationSlideModel {
  const { result, timeSeries, dataQuality, metricDefinition, datasetSession, predicates, planningLens, actualKey, expectedKey } = options;
  const actual = result.actual;
  const expected = result.expected;
  const variance = result.variance;
  const businessImpact = result.businessImpact;
  const direction = result.impactDirection;
  const variancePct = result.variancePct;
  const topDrivers = result.dimensionScores.slice(0, 5).map((item, index) => ({
    rank: index + 1,
    dimension: humanize(item.dimension),
    value: item.topCategory?.value ?? 'No stable category',
    businessImpact: item.topCategory?.businessImpact ?? 0,
    direction: item.topCategory?.impactDirection ?? 'neutral',
    support: item.topCategory?.support ?? 0,
    score: item.score,
  }));
  const topInteraction = result.interactions[0]
    ? result.interactions[0].predicates.map((item) => `${humanize(item.dimension)} = ${item.value}`).join(' + ')
    : 'No supported multi-dimensional interaction';
  const anomalyPeriods = (timeSeries?.allPoints ?? [])
    .filter((point) => point.material || point.anomalyScore >= 1)
    .sort((left, right) => Math.abs(right.businessImpact) - Math.abs(left.businessImpact))
    .slice(0, 8)
    .map((point) => ({
      period: point.label,
      businessImpact: point.businessImpact,
      direction: point.impactDirection,
      anomalyScore: point.anomalyScore,
      variancePct: point.variancePct,
      severity: severityFor(point.anomalyScore, point.material),
    }));
  const trend = (timeSeries?.points ?? []).slice(-12).map((point) => ({
    label: point.label,
    actual: point.actual,
    expected: point.expected,
    businessImpact: point.businessImpact,
  }));
  const health = timeSeries?.modelHealth.score ?? Math.max(0, Math.min(100, 100 - result.anomalyScore * 8));
  const warnings = [...new Set([
    ...result.warnings,
    ...(timeSeries?.warnings ?? []),
    ...dataQuality.issues.filter((item) => item.severity !== 'info').slice(0, 4).map((item) => item.title),
  ])].slice(0, 6);

  return {
    schemaVersion: 'presentation-slide-v1',
    generatedAt: new Date().toISOString(),
    dataset: datasetSession.source.name,
    metric: metricDefinition.actualField === actualKey && metricDefinition.name ? metricDefinition.name : humanize(actualKey),
    comparison: expectedKey ? humanize(expectedKey) : 'Rolling historical reference',
    planningLens: planningLensLabel(planningLens),
    period: periodLabel(timeSeries),
    scope: scopeLabel(predicates),
    actual,
    expected,
    variance,
    businessImpact,
    impactDirection: direction,
    variancePct,
    anomalyScore: result.anomalyScore,
    anomalyLabel: anomalyLabel(result.anomalyScore),
    analysisHealth: health,
    qualityScore: dataQuality.overallScore,
    rowCount: result.rowCount,
    validRowCount: result.validRowCount,
    dimensionsScanned: result.dimensionsScanned,
    topDrivers,
    topInteraction,
    anomalyPeriods,
    questions: questionAnswers(options),
    trend,
    warnings,
    runId: result.runId,
    datasetSessionId: datasetSession.sessionId,
    evidenceSummary: `${result.validRowCount.toLocaleString()} valid rows · ${result.dimensionsScanned} factors scanned · run ${result.runId}`,
  };
}

export function defaultPresentationDesign(model: PresentationSlideModel): PresentationDesignPlan {
  return {
    title: `${model.metric} performance brief`,
    subtitle: `${model.period} · ${model.scope}`,
    theme: model.businessImpact < 0 ? 'risk' : 'board',
    density: 'balanced',
    emphasis: model.anomalyPeriods.length ? 'anomalies' : 'impact',
    callout: model.topDrivers[0]
      ? `${model.topDrivers[0].dimension} → ${model.topDrivers[0].value} is the leading supported concentration.`
      : 'Review the evidence before assigning a business cause.',
  };
}

export function validatePresentationDesignPatch(value: unknown, current: PresentationDesignPlan): PresentationDesignPlan {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const themes: PresentationTheme[] = ['paper', 'midnight', 'risk', 'board'];
  const densities: PresentationDensity[] = ['balanced', 'compact'];
  const emphases: PresentationEmphasis[] = ['impact', 'drivers', 'anomalies', 'questions'];
  const text = (key: string, fallback: string, limit: number) => {
    const candidate = typeof input[key] === 'string' ? String(input[key]).trim() : '';
    return candidate ? candidate.slice(0, limit) : fallback;
  };
  return {
    title: text('title', current.title, 100),
    subtitle: text('subtitle', current.subtitle, 180),
    theme: themes.includes(input.theme as PresentationTheme) ? input.theme as PresentationTheme : current.theme,
    density: densities.includes(input.density as PresentationDensity) ? input.density as PresentationDensity : current.density,
    emphasis: emphases.includes(input.emphasis as PresentationEmphasis) ? input.emphasis as PresentationEmphasis : current.emphasis,
    callout: text('callout', current.callout, 220),
  };
}

function textLines(value: string, maxCharacters: number, maxLines = 4) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxCharacters && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) break;
    } else {
      current = next;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  const consumed = lines.join(' ').split(/\s+/).length;
  if (consumed < words.length && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.…]+$/, '')}…`;
  return lines;
}

function svgTextBlock(value: string, x: number, y: number, widthChars: number, lineHeight: number, attrs: string, maxLines = 4) {
  return `<text x="${x}" y="${y}" ${attrs}>${textLines(value, widthChars, maxLines).map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${xmlEscape(line)}</tspan>`).join('')}</text>`;
}

function toneColor(direction: ImpactDirection, theme: ThemeTokens) {
  if (direction === 'favorable') return theme.favorable;
  if (direction === 'unfavorable') return theme.unfavorable;
  return theme.muted;
}

function sparkline(points: PresentationTrendPoint[], x: number, y: number, width: number, height: number, theme: ThemeTokens) {
  if (points.length < 2) return '';
  const values = points.flatMap((point) => [point.actual, point.expected]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const path = (selector: (point: PresentationTrendPoint) => number) => points.map((point, index) => {
    const px = x + index * width / Math.max(1, points.length - 1);
    const py = y + height - (selector(point) - min) / range * height;
    return `${index ? 'L' : 'M'} ${px.toFixed(1)} ${py.toFixed(1)}`;
  }).join(' ');
  return [
    `<line x1="${x}" y1="${y + height}" x2="${x + width}" y2="${y + height}" stroke="${theme.grid}" stroke-width="2"/>`,
    `<path d="${path((point) => point.expected)}" fill="none" stroke="${theme.muted}" stroke-width="5" stroke-dasharray="10 8"/>`,
    `<path d="${path((point) => point.actual)}" fill="none" stroke="${theme.accent}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
  ].join('');
}

function baseSvgStart(theme: ThemeTokens, title: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" role="img" aria-label="${xmlEscape(title)}"><rect width="1920" height="1080" fill="${theme.background}"/>`;
}

function headerSvg(model: PresentationSlideModel, design: PresentationDesignPlan, theme: ThemeTokens) {
  const impactColor = toneColor(model.impactDirection, theme);
  return [
    `<rect x="60" y="44" width="1800" height="120" rx="28" fill="${theme.surface}" stroke="${theme.text}" stroke-width="3"/>`,
    `<rect x="60" y="44" width="20" height="120" rx="10" fill="${theme.accent}"/>`,
    svgTextBlock(design.title, 112, 96, 54, 42, `fill="${theme.text}" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="800"`, 2),
    svgTextBlock(design.subtitle, 112, 142, 90, 26, `fill="${theme.muted}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="600"`, 1),
    `<rect x="1570" y="70" width="250" height="68" rx="20" fill="${impactColor}"/>`,
    `<text x="1695" y="98" text-anchor="middle" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700">BUSINESS IMPACT</text>`,
    `<text x="1695" y="127" text-anchor="middle" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="900">${model.businessImpact >= 0 ? '+' : '−'}${xmlEscape(compact(Math.abs(model.businessImpact)))}</text>`,
  ].join('');
}

function footerSvg(model: PresentationSlideModel, theme: ThemeTokens) {
  return [
    `<line x1="60" y1="1016" x2="1860" y2="1016" stroke="${theme.grid}" stroke-width="2"/>`,
    `<text x="60" y="1050" fill="${theme.muted}" font-family="Arial, Helvetica, sans-serif" font-size="18">${xmlEscape(model.dataset)} · ${xmlEscape(model.evidenceSummary)}</text>`,
    `<text x="1860" y="1050" text-anchor="end" fill="${theme.muted}" font-family="Arial, Helvetica, sans-serif" font-size="18">Quality ${model.qualityScore.toFixed(0)}/100 · Health ${model.analysisHealth.toFixed(0)}/100</text>`,
  ].join('');
}

function renderExecutiveSvg(model: PresentationSlideModel, design: PresentationDesignPlan, theme: ThemeTokens) {
  const cards = [
    { label: 'Actual', value: compact(model.actual), note: model.metric },
    { label: 'Plan / expected', value: compact(model.expected), note: model.comparison },
    { label: 'Variance', value: `${model.variance >= 0 ? '+' : '−'}${compact(Math.abs(model.variance))}`, note: `${percentage(model.variancePct)} raw variance` },
    { label: 'Signal', value: model.anomalyLabel, note: `Score ${model.anomalyScore.toFixed(2)}` },
  ];
  const kpiSvg = cards.map((card, index) => {
    const x = 60 + index * 445;
    return [
      `<rect x="${x}" y="188" width="410" height="142" rx="24" fill="${index === 2 ? theme.surfaceAlt : theme.surface}" stroke="${theme.text}" stroke-width="2"/>`,
      `<text x="${x + 26}" y="228" fill="${theme.muted}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700">${xmlEscape(card.label.toUpperCase())}</text>`,
      `<text x="${x + 26}" y="278" fill="${theme.text}" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="900">${xmlEscape(card.value)}</text>`,
      svgTextBlock(card.note, x + 26, 310, 34, 20, `fill="${theme.muted}" font-family="Arial, Helvetica, sans-serif" font-size="17"`, 1),
    ].join('');
  }).join('');
  const driverSvg = model.topDrivers.slice(0, 4).map((driver, index) => {
    const y = 474 + index * 88;
    const width = 430 * Math.min(1, Math.max(0.08, Math.abs(driver.businessImpact) / Math.max(1, Math.abs(model.topDrivers[0]?.businessImpact ?? 1))));
    const color = toneColor(driver.direction, theme);
    return [
      `<text x="92" y="${y}" fill="${theme.text}" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="800">${driver.rank}. ${xmlEscape(driver.dimension)}</text>`,
      `<text x="92" y="${y + 27}" fill="${theme.muted}" font-family="Arial, Helvetica, sans-serif" font-size="17">${xmlEscape(driver.value)} · ${(driver.support * 100).toFixed(1)}% support</text>`,
      `<rect x="92" y="${y + 42}" width="470" height="18" rx="9" fill="${theme.grid}"/>`,
      `<rect x="92" y="${y + 42}" width="${width}" height="18" rx="9" fill="${color}"/>`,
      `<text x="580" y="${y + 56}" text-anchor="end" fill="${color}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="800">${driver.businessImpact >= 0 ? '+' : '−'}${xmlEscape(compact(Math.abs(driver.businessImpact)))}</text>`,
    ].join('');
  }).join('');
  const questionsSvg = model.questions.slice(0, 4).map((item, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 680 + column * 570;
    const y = 410 + row * 252;
    return [
      `<rect x="${x}" y="${y}" width="535" height="218" rx="24" fill="${theme.surface}" stroke="${theme.grid}" stroke-width="2"/>`,
      `<text x="${x + 24}" y="${y + 42}" fill="${theme.accent}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="900">${xmlEscape(item.question.toUpperCase())}</text>`,
      svgTextBlock(item.answer, x + 24, y + 82, 58, 26, `fill="${theme.text}" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="600"`, 5),
    ].join('');
  }).join('');
  return [
    baseSvgStart(theme, design.title),
    headerSvg(model, design, theme),
    kpiSvg,
    `<rect x="60" y="366" width="570" height="604" rx="30" fill="${theme.surface}" stroke="${theme.text}" stroke-width="2"/>`,
    `<text x="92" y="414" fill="${theme.text}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="900">Top supported drivers</text>`,
    `<text x="92" y="447" fill="${theme.muted}" font-family="Arial, Helvetica, sans-serif" font-size="18">Ranked by business impact, support, and concentration</text>`,
    driverSvg,
    `<rect x="92" y="820" width="506" height="118" rx="22" fill="${theme.surfaceAlt}"/>`,
    `<text x="116" y="854" fill="${theme.muted}" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="800">EXECUTIVE CALLOUT</text>`,
    svgTextBlock(design.callout, 116, 888, 48, 24, `fill="${theme.text}" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700"`, 3),
    `<text x="680" y="382" fill="${theme.text}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="900">Questions answered</text>`,
    questionsSvg,
    footerSvg(model, theme),
    '</svg>',
  ].join('');
}

function renderAnomaliesSvg(model: PresentationSlideModel, design: PresentationDesignPlan, theme: ThemeTokens) {
  const anomalies = model.anomalyPeriods.length ? model.anomalyPeriods : [{
    period: model.period,
    businessImpact: model.businessImpact,
    direction: model.impactDirection,
    anomalyScore: model.anomalyScore,
    variancePct: model.variancePct,
    severity: model.anomalyLabel,
  }];
  const rows = anomalies.slice(0, 8).map((item, index) => {
    const y = 382 + index * 72;
    const color = toneColor(item.direction, theme);
    return [
      `<rect x="86" y="${y - 34}" width="930" height="58" rx="16" fill="${index % 2 ? theme.surfaceAlt : theme.surface}"/>`,
      `<text x="112" y="${y}" fill="${theme.text}" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="800">${xmlEscape(item.period)}</text>`,
      `<text x="380" y="${y}" fill="${color}" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="900">${item.businessImpact >= 0 ? '+' : '−'}${xmlEscape(compact(Math.abs(item.businessImpact)))}</text>`,
      `<text x="590" y="${y}" fill="${theme.muted}" font-family="Arial, Helvetica, sans-serif" font-size="18">${xmlEscape(percentage(item.variancePct))}</text>`,
      `<text x="755" y="${y}" fill="${theme.muted}" font-family="Arial, Helvetica, sans-serif" font-size="18">${item.anomalyScore.toFixed(2)}</text>`,
      `<rect x="875" y="${y - 23}" width="112" height="34" rx="17" fill="${color}"/>`,
      `<text x="931" y="${y}" text-anchor="middle" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="800">${xmlEscape(item.severity)}</text>`,
    ].join('');
  }).join('');
  const drivers = model.topDrivers.slice(0, 5).map((driver, index) => {
    const y = 420 + index * 105;
    return [
      `<circle cx="1120" cy="${y - 8}" r="25" fill="${toneColor(driver.direction, theme)}"/>`,
      `<text x="1120" y="${y}" text-anchor="middle" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="900">${driver.rank}</text>`,
      `<text x="1162" y="${y - 4}" fill="${theme.text}" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="800">${xmlEscape(driver.dimension)}</text>`,
      `<text x="1162" y="${y + 25}" fill="${theme.muted}" font-family="Arial, Helvetica, sans-serif" font-size="18">${xmlEscape(driver.value)} · ${(driver.support * 100).toFixed(1)}% support</text>`,
      `<text x="1765" y="${y + 4}" text-anchor="end" fill="${toneColor(driver.direction, theme)}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="900">${driver.businessImpact >= 0 ? '+' : '−'}${xmlEscape(compact(Math.abs(driver.businessImpact)))}</text>`,
    ].join('');
  }).join('');
  return [
    baseSvgStart(theme, design.title),
    headerSvg(model, design, theme),
    `<rect x="60" y="190" width="990" height="790" rx="30" fill="${theme.surface}" stroke="${theme.text}" stroke-width="2"/>`,
    `<text x="86" y="246" fill="${theme.text}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="900">Anomaly register</text>`,
    `<text x="86" y="282" fill="${theme.muted}" font-family="Arial, Helvetica, sans-serif" font-size="18">${model.anomalyPeriods.length} flagged periods · strongest eight shown</text>`,
    sparkline(model.trend, 86, 306, 905, 72, theme),
    `<text x="112" y="342" fill="${theme.muted}" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="800">PERIOD</text>`,
    `<text x="380" y="342" fill="${theme.muted}" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="800">IMPACT</text>`,
    `<text x="590" y="342" fill="${theme.muted}" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="800">VARIANCE</text>`,
    `<text x="755" y="342" fill="${theme.muted}" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="800">SCORE</text>`,
    rows,
    `<rect x="1080" y="190" width="780" height="790" rx="30" fill="${theme.surface}" stroke="${theme.text}" stroke-width="2"/>`,
    `<text x="1110" y="246" fill="${theme.text}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="900">Driver priority</text>`,
    `<text x="1110" y="282" fill="${theme.muted}" font-family="Arial, Helvetica, sans-serif" font-size="18">Strongest supported places to investigate</text>`,
    drivers,
    `<rect x="1110" y="790" width="720" height="150" rx="22" fill="${theme.surfaceAlt}"/>`,
    `<text x="1136" y="828" fill="${theme.muted}" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="800">TOP COMBINED PATTERN</text>`,
    svgTextBlock(model.topInteraction, 1136, 866, 62, 26, `fill="${theme.text}" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="800"`, 3),
    footerSvg(model, theme),
    '</svg>',
  ].join('');
}

function renderQuestionsSvg(model: PresentationSlideModel, design: PresentationDesignPlan, theme: ThemeTokens) {
  const questionCards = model.questions.slice(0, 5).map((item, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const x = 60 + col * 910;
    const y = 210 + row * 244;
    const width = index === 4 ? 1800 : 870;
    return [
      `<rect x="${x}" y="${y}" width="${width}" height="210" rx="28" fill="${index === 4 ? theme.surfaceAlt : theme.surface}" stroke="${theme.grid}" stroke-width="2"/>`,
      `<circle cx="${x + 42}" cy="${y + 45}" r="22" fill="${theme.accent}"/>`,
      `<text x="${x + 42}" y="${y + 53}" text-anchor="middle" fill="${theme.background === '#111827' ? '#111827' : '#111111'}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="900">${index + 1}</text>`,
      `<text x="${x + 78}" y="${y + 53}" fill="${theme.text}" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="900">${xmlEscape(item.question)}</text>`,
      svgTextBlock(item.answer, x + 34, y + 98, index === 4 ? 130 : 72, 28, `fill="${theme.text}" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="600"`, 4),
    ].join('');
  }).join('');
  return [
    baseSvgStart(theme, design.title),
    headerSvg(model, design, theme),
    questionCards,
    footerSvg(model, theme),
    '</svg>',
  ].join('');
}

export function renderPresentationSlideSvg(
  model: PresentationSlideModel,
  design: PresentationDesignPlan,
  preset: PresentationPreset,
) {
  const theme = THEMES[design.theme];
  if (preset === 'anomalies') return renderAnomaliesSvg(model, design, theme);
  if (preset === 'questions') return renderQuestionsSvg(model, design, theme);
  return renderExecutiveSvg(model, design, theme);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadPresentationSvg(svg: string, filename = 'fpa-executive-slide.svg') {
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

export async function downloadPresentationPng(svg: string, filename = 'fpa-executive-slide.png') {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The slide preview could not be converted to PNG.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser does not provide a 2D canvas context.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG export returned an empty file.')), 'image/png', 0.96);
    });
    downloadBlob(png, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadPresentationModel(model: PresentationSlideModel, design: PresentationDesignPlan, preset: PresentationPreset) {
  downloadBlob(new Blob([JSON.stringify({ model, design, preset }, null, 2)], { type: 'application/json;charset=utf-8' }), 'fpa-presentation-evidence.json');
}
