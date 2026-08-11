import { investigate } from './anomaly';
import { labelFor, resolveDimension, semanticFor } from '../data/semanticModel';
import type { DataRow, InvestigationResult, Predicate } from '../types';

export interface ChatContext {
  rows: DataRow[];
  dimensions: string[];
  actualKey: string;
  expectedKey?: string;
  predicates: Predicate[];
  result: InvestigationResult;
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

const compact = (n: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

function scopeText(predicates: Predicate[]) {
  return predicates.length ? predicates.map((p) => `${labelFor(p.dimension)} = ${p.value}`).join(' → ') : 'all data';
}

function suggestions(ctx: ChatContext) {
  const top = ctx.result.dimensionScores[0];
  const out = ['What is driving the result?', 'What is the strongest combined pattern?'];
  if (top) out.push(`Show me ${labelFor(top.dimension)}`);
  if (ctx.predicates.length) out.push('Go deeper', 'Go back');
  return out.slice(0, 5);
}

function categoryMatch(ctx: ChatContext, q: string) {
  const lower = q.toLowerCase();
  for (const score of ctx.result.dimensionScores) {
    for (const category of score.categories) {
      if (lower.includes(String(category.value).toLowerCase())) return { dimension: score.dimension, value: String(category.value) };
    }
  }
  return null;
}

function explain(ctx: ChatContext): ChatReply {
  const top = ctx.result.dimensionScores[0];
  const interaction = ctx.result.interactions[0];
  const direction = ctx.result.variance < 0 ? 'below' : 'above';
  let text = `For ${scopeText(ctx.predicates)}, the result is ${compact(Math.abs(ctx.result.variance))} ${direction} expectation.`;
  if (top?.topCategory) text += ` The clearest single factor is ${labelFor(top.dimension)}, led by ${top.topCategory.value}, which differs from expectation by ${compact(Math.abs(top.topCategory.variance))}.`;
  if (interaction) text += ` The strongest combined pattern is ${interaction.predicates.map((p) => p.value).join(' + ')}, covering ${interaction.count.toLocaleString()} records.`;
  return { text, suggestions: suggestions(ctx) };
}

function goDeeper(ctx: ChatContext): ChatReply {
  const last = ctx.predicates[ctx.predicates.length - 1];
  const hierarchicalChild = last ? semanticFor(last.dimension)?.child : undefined;
  const score = hierarchicalChild ? ctx.result.dimensionScores.find((d) => d.dimension === hierarchicalChild) : ctx.result.dimensionScores[0];
  const candidate = score?.topCategory;
  if (!score || !candidate) return { text: 'I do not see a stable next drill for the current group. Try choosing one of the ranked business factors instead.', suggestions: suggestions(ctx) };
  const hierarchyText = hierarchicalChild ? `Following the ${labelFor(last!.dimension)} hierarchy, the next level is ${labelFor(score.dimension)}.` : `${labelFor(score.dimension)} is currently the strongest next explanation across the remaining factors.`;
  return {
    text: `${hierarchyText} ${candidate.value} stands out most, so I can narrow the dashboard to that group and re-check every other factor.`,
    action: { type: 'drill', predicates: [{ dimension: score.dimension, value: String(candidate.value) }] },
    suggestions: [`Drill into ${candidate.value}`, `Show me ${labelFor(score.dimension)}`, 'Why this recommendation?', 'Go back'],
  };
}

function compare(ctx: ChatContext, q: string): ChatReply | null {
  const lower = q.toLowerCase();
  if (!lower.includes('compare') && !lower.includes(' vs ') && !lower.includes(' versus ')) return null;
  for (const score of ctx.result.dimensionScores) {
    const matches = score.categories.filter((c) => lower.includes(String(c.value).toLowerCase())).slice(0, 2);
    if (matches.length === 2) {
      const parts = matches.map((m) => {
        const result = investigate(ctx.rows, ctx.dimensions, ctx.actualKey, ctx.expectedKey, [...ctx.predicates.filter((p) => p.dimension !== score.dimension), { dimension: score.dimension, value: String(m.value) }]);
        return { value: m.value, result };
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
  const q = question.trim();
  const lower = q.toLowerCase();
  if (!q) return { text: 'Ask me what is driving the result, tell me to show a group, compare two groups, or say “go deeper.”', suggestions: suggestions(ctx) };
  if (lower === 'reset' || lower.includes('start over') || lower.includes('all data')) return { text: 'I’ll return the dashboard to all available data.', action: { type: 'reset' }, suggestions: suggestions({ ...ctx, predicates: [] }) };
  if (lower.includes('go back') || lower === 'back') return { text: ctx.predicates.length ? 'I’ll move back one step in the investigation.' : 'You are already at the full-data view.', action: ctx.predicates.length ? { type: 'back' } : undefined, suggestions: suggestions(ctx) };
  if (lower.includes('go deeper') || lower === 'deeper' || lower.includes('next level')) return goDeeper(ctx);
  const comparison = compare(ctx, lower);
  if (comparison) return comparison;

  if (lower.startsWith('what is ') || lower.startsWith('what does ') || lower.startsWith('define ')) {
    const d = resolveDimension(lower, ctx.dimensions);
    if (d) {
      const meta = semanticFor(d);
      const child = meta?.child ? ` The next natural drill level is ${labelFor(meta.child)}.` : '';
      return { text: `${labelFor(d)}: ${meta?.description ?? 'A business factor available in this dataset.'}${child}`, suggestions: [`Show me ${labelFor(d)}`, 'What is driving the result?'] };
    }
  }

  const resolved = resolveDimension(lower, ctx.dimensions);
  if (resolved && (lower.includes('show') || lower.includes('which') || lower.includes('inside') || lower.includes('break down') || lower.includes('drill'))) {
    const score = ctx.result.dimensionScores.find((d) => d.dimension === resolved);
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
    const inter = ctx.result.interactions[0];
    if (!inter) return { text: 'No stable multi-factor pattern passed the current support threshold.', suggestions: suggestions(ctx) };
    return { text: `The strongest combined pattern is ${inter.predicates.map((p) => `${labelFor(p.dimension)} = ${p.value}`).join(' + ')}. It covers ${inter.count.toLocaleString()} records and differs from expectation by ${compact(Math.abs(inter.variance))}.`, action: { type: 'drill', predicates: inter.predicates }, suggestions: ['Explore this group', 'What is driving it?', 'Go back'] };
  }

  if (lower.includes('why this recommendation')) {
    const top = ctx.result.dimensionScores[0];
    return top?.topCategory ? { text: `${labelFor(top.dimension)} is recommended because it ranks highest across impact, distinctiveness, concentration, and support in the current cohort. Within it, ${top.topCategory.value} is the largest category-level contributor.`, suggestions: [`Show me ${labelFor(top.dimension)}`, `Drill into ${top.topCategory.value}`] } : explain(ctx);
  }

  return explain(ctx);
}
