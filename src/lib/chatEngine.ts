import { investigate } from './anomaly';
import type { DataQualityReport } from './dataQuality';
import { labelFor, resolveDimension, semanticFor } from '../data/semanticModel';
import type { FinancePeriodSummary, FinanceTimeSeriesResult } from './timeIntelligence';
import type { AttributionAggregation, DataRow, InvestigationResult, MetricPolarity, Predicate } from '../types';

export interface ChatContext {
  rows: DataRow[];
  dimensions: string[];
  actualKey: string;
  expectedKey?: string;
  metricPolarity: MetricPolarity;
  predicates: Predicate[];
  result: InvestigationResult;
  dataQuality?: DataQualityReport;
  timeSeries?: FinanceTimeSeriesResult;
  externalContext?: string;
  aggregationMethod?: AttributionAggregation;
  timeField?: string;
}

export interface ChatAction {
  type: 'drill' | 'reset' | 'back' | 'select-dimension';
  predicates?: Predicate[];
  dimension?: string;
}

export interface ChatReply {
  text: string;
  action?: ChatAction;
  suggestions: string[];
}

const compact = (value: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;

function scopeText(predicates: Predicate[]) {
  return predicates.length ? predicates.map((predicate) => `${labelFor(predicate.dimension)} = ${predicate.value}`).join(' → ') : 'all business dimensions';
}

function businessPhrase(value: number) {
  if (value < 0) return `${compact(Math.abs(value))} unfavorable`;
  if (value > 0) return `${compact(Math.abs(value))} favorable`;
  return 'neutral';
}

function summaryPhrase(summary: FinancePeriodSummary | null) {
  if (!summary) return 'not available';
  return `${businessPhrase(summary.businessImpact)} impact, ${percent(summary.variancePct)} raw variance, and ${percent(summary.pace)} pace to plan`;
}

function suggestions(ctx: ChatContext) {
  const top = ctx.result.dimensionScores[0];
  const output = ['How are we pacing YTD?', 'What changed over time?', 'What is driving the result?'];
  if (ctx.timeSeries?.runRate) output.push('Are we pacing to hit month-end?');
  if (ctx.timeSeries?.modelHealth.status !== 'healthy') output.push('Can I trust the time analysis?');
  if (ctx.externalContext) output.push('Could external news explain this variance?');
  if (top) output.push(`Show me ${labelFor(top.dimension)}`);
  if (ctx.predicates.length) output.push('Go deeper', 'Go back');
  return [...new Set(output)].slice(0, 5);
}

function categoryMatches(ctx: ChatContext, query: string) {
  const lower = query.toLowerCase();
  const matches: Array<{ dimension: string; value: string }> = [];
  for (const score of ctx.result.dimensionScores) {
    for (const category of score.categories) {
      const value = String(category.value);
      if (value && lower.includes(value.toLowerCase())) matches.push({ dimension: score.dimension, value });
    }
  }
  const unique = new Map(matches.map((match) => [`${match.dimension}|${match.value}`, match]));
  return [...unique.values()];
}

function summarizeExternalContext(context: string) {
  const lines = context.split('\n').map((line) => line.trim()).filter(Boolean);
  const useful = lines.filter((line) => !line.toLowerCase().startsWith('provider:')).slice(0, 8);
  return useful.length ? useful.join('\n') : context.slice(0, 700);
}

function explainQuality(ctx: ChatContext): ChatReply {
  const quality = ctx.dataQuality;
  if (!quality) return { text: 'A data-quality profile is not available for the current dataset.', suggestions: suggestions(ctx) };
  const topIssues = quality.issues.slice(0, 4).map((item) => `${item.severity === 'critical' ? 'Blocker' : item.severity === 'warning' ? 'Warning' : 'Observation'}: ${item.title}${item.column ? ` (${item.column})` : ''}`).join('\n');
  const readiness = quality.analysisReady
    ? 'The dataset passes the automatic readiness gate for exploratory FP&A analysis.'
    : 'The dataset does not currently pass the automatic readiness gate; resolve critical issues before treating the variance explanation as reliable.';
  return {
    text: [
      `Data quality is ${quality.overallScore.toFixed(0)}/100 (${quality.status}). ${readiness}`,
      `${(quality.missingRate * 100).toFixed(1)}% of cells are missing, ${quality.duplicateRows.toLocaleString()} exact duplicate rows were found, and ${quality.raggedRows.toLocaleString()} rows have an inconsistent schema.`,
      `${quality.measureCandidates.length} measure candidates and ${quality.dimensionCandidates.length} dimension candidates are approved for analysis.`,
      quality.sensitiveColumns.length ? `Potential sensitive fields: ${quality.sensitiveColumns.join(', ')}.` : 'No obvious sensitive fields were detected by the heuristic scan.',
      topIssues ? `Top items to review:\n${topIssues}` : 'No automatic issues were found.',
      'Open the supporting Data Quality workspace for column profiles, relationships, missingness patterns, raw-data preview, and the full quality framework.',
    ].join('\n\n'),
    suggestions: ['Which columns have the most missing data?', 'Are there duplicates?', 'What should I fix first?', 'What is driving the result?'],
  };
}

function explainTimeHealth(ctx: ChatContext): ChatReply {
  const time = ctx.timeSeries;
  if (!time) return { text: 'No usable time field is active. Select a date, week, month, quarter, or fiscal-period field first.', suggestions: suggestions(ctx) };
  return {
    text: [
      `Time-analysis health is ${time.modelHealth.score.toFixed(0)}/100 (${time.modelHealth.status}) for run ${time.runId}.`,
      `${time.modelHealth.periodCount} ${time.grain} periods are available; ${(time.modelHealth.parseRate * 100).toFixed(1)}% of scoped rows were assigned to time and ${(time.modelHealth.validMeasureRate * 100).toFixed(1)}% of time-parsed rows entered the measure calculation.`,
      time.modelHealth.seasonalityReady ? 'The period depth is sufficient for basic seasonality modeling.' : 'The period depth is not sufficient for reliable seasonality modeling, so current anomaly scores use robust rolling history rather than a seasonal forecast.',
      `Monitoring notes:\n${time.modelHealth.reasons.join('\n')}`,
      `Calculation version: ${time.calculationVersion}. Aggregation: ${time.aggregation}. Baseline: ${time.baselineMethod}.`,
    ].join('\n\n'),
    suggestions: ['What changed over time?', 'How are we pacing YTD?', 'What is driving the result?'],
  };
}

function explainTime(ctx: ChatContext, query: string): ChatReply {
  const time = ctx.timeSeries;
  if (!time) return { text: 'No usable time field is active. Select a date, week, month, quarter, or fiscal-period field to enable MTD, QTD, YTD, trend, and run-rate analysis.', suggestions: suggestions(ctx) };
  const lower = query.toLowerCase();

  if (lower.includes('trust') || lower.includes('model health') || lower.includes('time analysis')) return explainTimeHealth(ctx);

  if (lower.includes('month-end') || lower.includes('run rate') || lower.includes('pacing to hit')) {
    if (time.runRate) {
      return {
        text: `As of ${time.runRate.asOf.slice(0, 10)}, the current run rate projects ${compact(time.runRate.projectedActual)} actual versus ${compact(time.runRate.projectedExpected)} plan, producing ${businessPhrase(time.runRate.projectedBusinessImpact)} projected month-end impact. Confidence is ${time.runRate.confidence} because the projection uses ${time.runRate.elapsedDays} of ${time.runRate.totalDays} calendar days. Treat this as a simple pacing projection, not a seasonal forecast.`,
        suggestions: ['What is driving the projected gap?', 'How are we pacing YTD?', 'Could external news explain this variance?'],
      };
    }
    return {
      text: `A month-end run-rate projection is not available for the current configuration. It is produced only for daily, additive data when the latest month is incomplete. Current-period impact is ${time.currentPeriod ? businessPhrase(time.currentPeriod.businessImpact) : 'not available'}, and momentum is ${time.trend.direction}.`,
      suggestions: ['How are we pacing YTD?', 'What changed over time?', 'What is driving the result?'],
    };
  }

  if (lower.includes('mtd') || lower.includes('month to date')) return { text: `MTD is ${summaryPhrase(time.mtd)}.`, suggestions: ['What is driving MTD?', 'Are we pacing to hit month-end?', 'Show the strongest combined pattern'] };
  if (lower.includes('qtd') || lower.includes('quarter to date') || lower.includes('quarter')) return { text: `QTD is ${summaryPhrase(time.qtd)}. Recent momentum is ${time.trend.direction}.`, suggestions: ['What is driving QTD?', 'How are we pacing YTD?', 'What changed over time?'] };
  if (lower.includes('ytd') || lower.includes('year to date') || lower.includes('fiscal year')) return { text: `YTD is ${summaryPhrase(time.ytd)}. The latest period is ${time.currentPeriod ? `${time.currentPeriod.label} with ${businessPhrase(time.currentPeriod.businessImpact)} impact` : 'not available'}, and recent momentum is ${time.trend.direction}.`, suggestions: ['What is driving YTD?', 'What changed over time?', 'Could external news explain this variance?'] };
  if (lower.includes('forecast bias') || lower.includes('bias')) return { text: `The recent forecast/plan bias is ${percent(time.forecastBias)} based on raw actual-minus-plan variance over the latest ${Math.min(12, time.allPoints.length)} periods. Positive means actuals ran above plan; whether that is favorable depends on metric direction. Volatility is ${percent(time.volatility)}.`, suggestions: ['What changed over time?', 'Can I trust the time analysis?', 'What is driving the result?'] };
  if (lower.includes('volatility')) return { text: `Normalized business-impact volatility is ${percent(time.volatility)} over the latest ${Math.min(12, time.allPoints.length)} periods. The model-health drift score is ${time.modelHealth.driftScore.toFixed(2)}.`, suggestions: ['Can I trust the time analysis?', 'What changed over time?', 'What is driving the result?'] };

  const materialPeriods = time.allPoints.filter((point) => point.material).slice(-5).map((point) => `${point.label}: ${businessPhrase(point.businessImpact)} impact`).join('\n');
  return {
    text: [
      time.currentPeriod ? `Latest period: ${time.currentPeriod.label} has ${businessPhrase(time.currentPeriod.businessImpact)} impact, ${percent(time.currentPeriod.variancePct)} raw variance, and an anomaly score of ${time.currentPeriod.anomalyScore.toFixed(1)}.` : 'No current period is available.',
      `QTD: ${summaryPhrase(time.qtd)}. YTD: ${summaryPhrase(time.ytd)}.`,
      `Momentum is ${time.trend.direction}. ${time.trend.description}`,
      materialPeriods ? `Recent material periods:\n${materialPeriods}` : 'No period crossed the selected materiality threshold.',
      `Analysis health: ${time.modelHealth.score.toFixed(0)}/100 (${time.modelHealth.status}); run ${time.runId}.`,
    ].join('\n\n'),
    suggestions: ['How are we pacing YTD?', 'What is driving the latest period?', 'Can I trust the time analysis?', 'Could external news explain this variance?'],
  };
}

function explainExternal(ctx: ChatContext): ChatReply {
  if (!ctx.externalContext) {
    return {
      text: 'I do not have external context loaded yet. Use the Public news context panel or load sample business context, then ask again. External signals will be treated as hypotheses, not proven causes.',
      suggestions: ['What is driving the result?', 'What changed over time?'],
    };
  }
  const top = ctx.result.dimensionScores[0];
  const topLine = top?.topCategory
    ? `The observed data issue is concentrated around ${labelFor(top.dimension)} = ${top.topCategory.value}, with ${businessPhrase(top.topCategory.businessImpact)} category-level business impact.`
    : `The current data view has ${businessPhrase(ctx.result.businessImpact)} business impact.`;
  return {
    text: `${topLine}\n\nExternal context available:\n${summarizeExternalContext(ctx.externalContext)}\n\nTreat the news and business context as possible explanations to validate. Compare affected groups against unaffected groups in the same period, and test whether each event precedes or overlaps the variance by time, product, channel, geography, and account group.`,
    suggestions: ['What should I validate next?', 'What changed over time?', 'Go deeper', 'Why this recommendation?'],
  };
}

function explain(ctx: ChatContext): ChatReply {
  const top = ctx.result.dimensionScores[0];
  const interaction = ctx.result.interactions[0];
  const polarityText = ctx.metricPolarity === 'higher_is_better' ? 'Higher values are configured as better.' : 'Lower values are configured as better, so positive raw variance is unfavorable.';
  let text = `For ${scopeText(ctx.predicates)}, the business impact is ${businessPhrase(ctx.result.businessImpact)}. ${polarityText}`;
  if (ctx.timeSeries?.currentPeriod) text += ` The latest period (${ctx.timeSeries.currentPeriod.label}) has ${businessPhrase(ctx.timeSeries.currentPeriod.businessImpact)} impact, while YTD is ${summaryPhrase(ctx.timeSeries.ytd)}.`;
  if (ctx.dataQuality?.blockers) text = `Caution: the dataset has ${ctx.dataQuality.blockers} data-quality blocker(s), so this interpretation may change after cleaning. ${text}`;
  if (top?.topCategory) text += ` The clearest single factor is ${labelFor(top.dimension)}, led by ${top.topCategory.value}, which contributes ${businessPhrase(top.topCategory.businessImpact)} and covers ${(top.topCategory.support * 100).toFixed(1)}% of valid rows.`;
  if (interaction) text += ` The strongest combined pattern is ${interaction.predicates.map((predicate) => predicate.value).join(' + ')}, covering ${interaction.count.toLocaleString()} records with ${businessPhrase(interaction.businessImpact)} impact.`;
  if (ctx.externalContext) text += ' External context is loaded, so you can ask whether news or business events may explain the pattern.';
  return { text, suggestions: suggestions(ctx) };
}

function goDeeper(ctx: ChatContext): ChatReply {
  const last = ctx.predicates[ctx.predicates.length - 1];
  const hierarchicalChild = last ? semanticFor(last.dimension)?.child : undefined;
  const score = hierarchicalChild ? ctx.result.dimensionScores.find((dimension) => dimension.dimension === hierarchicalChild) : ctx.result.dimensionScores[0];
  const candidate = score?.topCategory;
  if (!score || !candidate) return { text: 'I do not see a stable next drill for the current group. Try choosing one of the ranked business factors instead.', suggestions: suggestions(ctx) };
  const hierarchyText = hierarchicalChild ? `Following the ${labelFor(last!.dimension)} hierarchy, the next level is ${labelFor(score.dimension)}.` : `${labelFor(score.dimension)} is currently the strongest next explanation across the remaining factors.`;
  return {
    text: `${hierarchyText} ${candidate.value} stands out most with ${businessPhrase(candidate.businessImpact)}, so I can narrow the dashboard to that group and re-check every other quality-approved factor inside the selected time window.`,
    action: { type: 'drill', predicates: [{ dimension: score.dimension, value: String(candidate.value) }] },
    suggestions: [`Drill into ${candidate.value}`, `Show me ${labelFor(score.dimension)}`, 'Why this recommendation?', 'Go back'],
  };
}

function compare(ctx: ChatContext, query: string): ChatReply | null {
  const lower = query.toLowerCase();
  if (!lower.includes('compare') && !lower.includes(' vs ') && !lower.includes(' versus ')) return null;
  for (const score of ctx.result.dimensionScores) {
    const matches = score.categories.filter((category) => lower.includes(String(category.value).toLowerCase())).slice(0, 2);
    if (matches.length === 2) {
      const parts = matches.map((match) => {
        const result = investigate(
          ctx.rows,
          ctx.dimensions,
          ctx.actualKey,
          ctx.expectedKey,
          [...ctx.predicates.filter((predicate) => predicate.dimension !== score.dimension), { dimension: score.dimension, value: String(match.value) }],
          ctx.metricPolarity,
          { aggregationMethod: ctx.aggregationMethod ?? ctx.result.aggregationMethod, timeField: ctx.timeField ?? ctx.timeSeries?.timeField },
        );
        return { value: match.value, result };
      });
      const better = parts[0].result.businessImpact >= parts[1].result.businessImpact ? parts[0] : parts[1];
      return {
        text: `${parts[0].value} has ${businessPhrase(parts[0].result.businessImpact)} impact, while ${parts[1].value} has ${businessPhrase(parts[1].result.businessImpact)} impact. ${better.value} is more favorable under the current metric direction.`,
        suggestions: [`Show ${parts[0].value}`, `Show ${parts[1].value}`, 'What is driving the difference?'],
      };
    }
  }
  return null;
}

export function answerChat(question: string, ctx: ChatContext): ChatReply {
  const query = question.trim();
  const lower = query.toLowerCase();
  if (!query) return { text: 'Ask about MTD, QTD, YTD, pacing, time trends, business drivers, data quality, or external why-factors.', suggestions: suggestions(ctx) };
  if (lower === 'reset' || lower.includes('start over') || lower.includes('all data')) return { text: 'I’ll return the dashboard to all available business dimensions in the selected time window.', action: { type: 'reset' }, suggestions: suggestions({ ...ctx, predicates: [] }) };
  if (lower.includes('go back') || lower === 'back') return { text: ctx.predicates.length ? 'I’ll move back one step in the investigation.' : 'You are already at the full business-dimension view.', action: ctx.predicates.length ? { type: 'back' } : undefined, suggestions: suggestions(ctx) };
  if (lower.includes('go deeper') || lower === 'deeper' || lower.includes('next level')) return goDeeper(ctx);

  if (lower.includes('mtd') || lower.includes('qtd') || lower.includes('ytd') || lower.includes('month to date') || lower.includes('quarter to date') || lower.includes('year to date') || lower.includes('month-end') || lower.includes('run rate') || lower.includes('pace') || lower.includes('pacing') || lower.includes('trend') || lower.includes('over time') || lower.includes('last 15 months') || lower.includes('forecast bias') || lower.includes('volatility') || lower.includes('time analysis') || lower.includes('model health')) {
    return explainTime(ctx, lower);
  }

  if (lower.includes('data quality') || lower.includes('quality good') || lower.includes('missing data') || lower.includes('duplicates') || lower.includes('duplicate rows') || lower.includes('what should i fix')) {
    return explainQuality(ctx);
  }

  if (lower.includes('external') || lower.includes('news') || lower.includes('competitor') || lower.includes('market context') || lower.includes('validate next')) {
    return explainExternal(ctx);
  }

  const comparison = compare(ctx, lower);
  if (comparison) return comparison;

  if (lower.startsWith('what is ') || lower.startsWith('what does ') || lower.startsWith('define ')) {
    const dimension = resolveDimension(lower, ctx.dimensions);
    if (dimension) {
      const metadata = semanticFor(dimension);
      const child = metadata?.child ? ` The next natural drill level is ${labelFor(metadata.child)}.` : '';
      return { text: `${labelFor(dimension)}: ${metadata?.description ?? 'A business factor available in this dataset.'}${child}`, suggestions: [`Show me ${labelFor(dimension)}`, 'What is driving the result?'] };
    }
  }

  const resolved = resolveDimension(lower, ctx.dimensions);
  if (resolved && (lower.includes('show') || lower.includes('which') || lower.includes('inside') || lower.includes('break down') || lower.includes('drill'))) {
    const score = ctx.result.dimensionScores.find((dimension) => dimension.dimension === resolved);
    if (score?.topCategory) return {
      text: `${labelFor(resolved)} is currently ranked #${ctx.result.dimensionScores.indexOf(score) + 1} as an explanation. ${score.topCategory.value} has the largest business impact at ${businessPhrase(score.topCategory.businessImpact)}. I’ve highlighted that factor for you.`,
      action: { type: 'select-dimension', dimension: resolved },
      suggestions: [`Drill into ${score.topCategory.value}`, `What does ${labelFor(resolved)} mean?`, 'Go deeper'],
    };
  }

  const categories = categoryMatches(ctx, lower);
  if (categories.length && (lower.includes('show') || lower.includes('focus') || lower.includes('drill') || lower.includes('investigate'))) {
    if (categories.length > 1) {
      const options = categories.slice(0, 4).map((category) => `${labelFor(category.dimension)} = ${category.value}`);
      return {
        text: `That value appears in more than one business factor. Please identify the intended field: ${options.join('; ')}.`,
        suggestions: options.map((option) => `Show ${option}`).slice(0, 4),
      };
    }
    const category = categories[0];
    return {
      text: `I found ${category.value} under ${labelFor(category.dimension)}. I’ll focus the dashboard on that group and re-run the remaining factor analysis within the selected time window.`,
      action: { type: 'drill', predicates: [category] },
      suggestions: ['What is driving this group?', 'How is this group trending?', 'Go deeper', 'Go back'],
    };
  }

  if (lower.includes('strongest combined') || lower.includes('interaction') || lower.includes('combination') || lower.includes('pattern')) {
    const interaction = ctx.result.interactions[0];
    if (!interaction) return { text: 'No stable multi-factor pattern passed the current support threshold.', suggestions: suggestions(ctx) };
    return { text: `The strongest combined pattern is ${interaction.predicates.map((predicate) => `${labelFor(predicate.dimension)} = ${predicate.value}`).join(' + ')}. It covers ${interaction.count.toLocaleString()} records and has ${businessPhrase(interaction.businessImpact)} impact.`, action: { type: 'drill', predicates: interaction.predicates }, suggestions: ['Explore this group', 'How is this group trending?', 'What is driving it?', 'Go back'] };
  }

  if (lower.includes('why this recommendation')) {
    const top = ctx.result.dimensionScores[0];
    return top?.topCategory ? { text: `${labelFor(top.dimension)} is recommended because it ranks highest across grouped impact, distinctiveness, concentration, support, and a cardinality penalty in the selected time window. Within it, ${top.topCategory.value} is the largest supported category-level contributor with ${businessPhrase(top.topCategory.businessImpact)} impact.`, suggestions: [`Show me ${labelFor(top.dimension)}`, `Drill into ${top.topCategory.value}`, 'How is this factor trending?'] } : explain(ctx);
  }

  return explain(ctx);
}
