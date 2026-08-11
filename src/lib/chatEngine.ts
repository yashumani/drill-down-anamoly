import { investigate } from './anomaly';
import type { DataQualityReport } from './dataQuality';
import { labelFor, resolveDimension, semanticFor } from '../data/semanticModel';
import type { DataRow, InvestigationResult, Predicate } from '../types';

export interface ChatContext {
  rows: DataRow[];
  dimensions: string[];
  actualKey: string;
  expectedKey?: string;
  predicates: Predicate[];
  result: InvestigationResult;
  dataQuality?: DataQualityReport;
  externalContext?: string;
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

function scopeText(predicates: Predicate[]) {
  return predicates.length ? predicates.map((predicate) => `${labelFor(predicate.dimension)} = ${predicate.value}`).join(' → ') : 'all data';
}

function suggestions(ctx: ChatContext) {
  const top = ctx.result.dimensionScores[0];
  const output = ['Is the data quality good enough?', 'What is driving the result?', 'What is the strongest combined pattern?'];
  if (ctx.externalContext) output.push('Could external news explain this anomaly?');
  if (top) output.push(`Show me ${labelFor(top.dimension)}`);
  if (ctx.predicates.length) output.push('Go deeper', 'Go back');
  return output.slice(0, 5);
}

function categoryMatch(ctx: ChatContext, query: string) {
  const lower = query.toLowerCase();
  for (const score of ctx.result.dimensionScores) {
    for (const category of score.categories) {
      if (lower.includes(String(category.value).toLowerCase())) return { dimension: score.dimension, value: String(category.value) };
    }
  }
  return null;
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
    ? 'The dataset passes the automatic readiness gate for exploratory anomaly analysis.'
    : 'The dataset does not currently pass the automatic readiness gate; resolve critical issues before treating the anomaly result as reliable.';
  return {
    text: [
      `Data quality is ${quality.overallScore.toFixed(0)}/100 (${quality.status}). ${readiness}`,
      `${(quality.missingRate * 100).toFixed(1)}% of cells are missing, ${quality.duplicateRows.toLocaleString()} exact duplicate rows were found, and ${quality.raggedRows.toLocaleString()} rows have an inconsistent schema.`,
      `${quality.measureCandidates.length} measure candidates and ${quality.dimensionCandidates.length} dimension candidates are approved for analysis.`,
      quality.sensitiveColumns.length ? `Potential sensitive fields: ${quality.sensitiveColumns.join(', ')}.` : 'No obvious sensitive fields were detected by the heuristic scan.',
      topIssues ? `Top items to review:\n${topIssues}` : 'No automatic issues were found.',
      'Open the Data Quality workspace for column profiles, relationships, missingness patterns, raw-data preview, and the full quality framework.',
    ].join('\n\n'),
    suggestions: ['Which columns have the most missing data?', 'Are there duplicates?', 'What should I fix first?', 'What is driving the result?'],
  };
}

function explainExternal(ctx: ChatContext): ChatReply {
  if (!ctx.externalContext) {
    return {
      text: 'I do not have external context loaded yet. Use the Public news context panel or load sample business context, then ask again. I will treat those signals as hypotheses, not proven causes.',
      suggestions: ['What is driving the result?', 'What is the strongest combined pattern?'],
    };
  }
  const top = ctx.result.dimensionScores[0];
  const topLine = top?.topCategory
    ? `The observed data issue is concentrated around ${labelFor(top.dimension)} = ${top.topCategory.value}, with ${compact(Math.abs(top.topCategory.variance))} of category-level difference.`
    : `The current data view differs from expectation by ${compact(Math.abs(ctx.result.variance))}.`;
  return {
    text: `${topLine}\n\nExternal context available:\n${summarizeExternalContext(ctx.externalContext)}\n\nTreat the news and business context as possible explanations to validate. Compare affected groups against unaffected groups in the same period, or test whether the event overlaps the anomaly by time, product, channel, or geography.`,
    suggestions: ['What should I validate next?', 'Go deeper', 'What is driving the result?', 'Why this recommendation?'],
  };
}

function explain(ctx: ChatContext): ChatReply {
  const top = ctx.result.dimensionScores[0];
  const interaction = ctx.result.interactions[0];
  const direction = ctx.result.variance < 0 ? 'below' : 'above';
  let text = `For ${scopeText(ctx.predicates)}, the result is ${compact(Math.abs(ctx.result.variance))} ${direction} expectation.`;
  if (ctx.dataQuality?.blockers) text = `Caution: the dataset has ${ctx.dataQuality.blockers} data-quality blocker(s), so this interpretation may change after cleaning. ${text}`;
  if (top?.topCategory) text += ` The clearest single factor is ${labelFor(top.dimension)}, led by ${top.topCategory.value}, which differs from expectation by ${compact(Math.abs(top.topCategory.variance))} and covers ${(top.topCategory.support * 100).toFixed(1)}% of valid rows.`;
  if (interaction) text += ` The strongest combined pattern is ${interaction.predicates.map((predicate) => predicate.value).join(' + ')}, covering ${interaction.count.toLocaleString()} records.`;
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
    text: `${hierarchyText} ${candidate.value} stands out most, so I can narrow the dashboard to that group and re-check every other quality-approved factor.`,
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
        const result = investigate(ctx.rows, ctx.dimensions, ctx.actualKey, ctx.expectedKey, [...ctx.predicates.filter((predicate) => predicate.dimension !== score.dimension), { dimension: score.dimension, value: String(match.value) }]);
        return { value: match.value, result };
      });
      const better = parts[0].result.variance >= parts[1].result.variance ? parts[0] : parts[1];
      return {
        text: `${parts[0].value} is ${compact(Math.abs(parts[0].result.variance))} ${parts[0].result.variance < 0 ? 'below' : 'above'} expectation, while ${parts[1].value} is ${compact(Math.abs(parts[1].result.variance))} ${parts[1].result.variance < 0 ? 'below' : 'above'} expectation. ${better.value} has the more favorable result in the current comparison.`,
        suggestions: [`Show ${parts[0].value}`, `Show ${parts[1].value}`, 'What is driving the difference?'],
      };
    }
  }
  return null;
}

export function answerChat(question: string, ctx: ChatContext): ChatReply {
  const query = question.trim();
  const lower = query.toLowerCase();
  if (!query) return { text: 'Ask about data quality, what is driving the result, a group comparison, or say “go deeper.”', suggestions: suggestions(ctx) };
  if (lower === 'reset' || lower.includes('start over') || lower.includes('all data')) return { text: 'I’ll return the dashboard to all available data.', action: { type: 'reset' }, suggestions: suggestions({ ...ctx, predicates: [] }) };
  if (lower.includes('go back') || lower === 'back') return { text: ctx.predicates.length ? 'I’ll move back one step in the investigation.' : 'You are already at the full-data view.', action: ctx.predicates.length ? { type: 'back' } : undefined, suggestions: suggestions(ctx) };
  if (lower.includes('go deeper') || lower === 'deeper' || lower.includes('next level')) return goDeeper(ctx);

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
      text: `${labelFor(resolved)} is currently ranked #${ctx.result.dimensionScores.indexOf(score) + 1} as an explanation. ${score.topCategory.value} has the largest difference from expectation at ${compact(Math.abs(score.topCategory.variance))}. I’ve highlighted that factor for you.`,
      action: { type: 'select-dimension', dimension: resolved },
      suggestions: [`Drill into ${score.topCategory.value}`, `What does ${labelFor(resolved)} mean?`, 'Go deeper'],
    };
  }

  const category = categoryMatch(ctx, lower);
  if (category && (lower.includes('show') || lower.includes('focus') || lower.includes('drill') || lower.includes('investigate'))) return {
    text: `I found ${category.value} under ${labelFor(category.dimension)}. I’ll focus the dashboard on that group and re-run the remaining factor analysis.`,
    action: { type: 'drill', predicates: [category] },
    suggestions: ['What is driving this group?', 'Go deeper', 'Go back'],
  };

  if (lower.includes('strongest combined') || lower.includes('interaction') || lower.includes('combination') || lower.includes('pattern')) {
    const interaction = ctx.result.interactions[0];
    if (!interaction) return { text: 'No stable multi-factor pattern passed the current support threshold.', suggestions: suggestions(ctx) };
    return { text: `The strongest combined pattern is ${interaction.predicates.map((predicate) => `${labelFor(predicate.dimension)} = ${predicate.value}`).join(' + ')}. It covers ${interaction.count.toLocaleString()} records and differs from expectation by ${compact(Math.abs(interaction.variance))}.`, action: { type: 'drill', predicates: interaction.predicates }, suggestions: ['Explore this group', 'What is driving it?', 'Go back'] };
  }

  if (lower.includes('why this recommendation')) {
    const top = ctx.result.dimensionScores[0];
    return top?.topCategory ? { text: `${labelFor(top.dimension)} is recommended because it ranks highest across grouped impact, distinctiveness, concentration, support, and a cardinality penalty in the current cohort. Within it, ${top.topCategory.value} is the largest supported category-level contributor.`, suggestions: [`Show me ${labelFor(top.dimension)}`, `Drill into ${top.topCategory.value}`] } : explain(ctx);
  }

  return explain(ctx);
}
