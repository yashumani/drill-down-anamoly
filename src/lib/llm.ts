import type { InvestigationResult, Predicate } from '../types';

export interface LlmConfig {
  enabled: boolean;
  endpoint: string;
  model: string;
  apiKey: string;
  authHeader: string;
  authPrefix: string;
}

export interface LlmContext {
  actualKey: string;
  expectedKey?: string;
  predicates: Predicate[];
  result: InvestigationResult;
  externalContext?: string;
}

function compactResult(ctx: LlmContext) {
  return {
    metric: ctx.actualKey,
    comparison: ctx.expectedKey || 'cohort baseline',
    scope: ctx.predicates,
    summary: {
      actual: ctx.result.actual,
      expected: ctx.result.expected,
      variance: ctx.result.variance,
      variancePct: ctx.result.variancePct,
      anomalyScore: ctx.result.anomalyScore,
      rows: ctx.result.rowCount,
    },
    topDrivers: ctx.result.dimensionScores.slice(0, 8).map((d) => ({
      dimension: d.dimension,
      score: d.score,
      topCategory: d.topCategory ? { value: d.topCategory.value, variance: d.topCategory.variance, rows: d.topCategory.count } : null,
    })),
    topInteractions: ctx.result.interactions.slice(0, 5).map((x) => ({ predicates: x.predicates, variance: x.variance, rows: x.count, lift: x.lift })),
    externalContext: ctx.externalContext || undefined,
  };
}

export async function askLlm(question: string, config: LlmConfig, ctx: LlmContext): Promise<string> {
  if (!config.endpoint.trim()) throw new Error('Add an API endpoint first.');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey.trim()) headers[config.authHeader.trim() || 'Authorization'] = `${config.authPrefix}${config.apiKey}`;

  const response = await fetch(config.endpoint.trim(), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model || undefined,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'You are an evidence-grounded business analytics assistant. Explain the supplied calculated dashboard results in plain language. Never invent numbers, causes, or facts. Separate observed data drivers from possible external explanations. If external context is supplied, call it context or a hypothesis unless the evidence proves a relationship. Be concise and decision-oriented.',
        },
        { role: 'user', content: `Question: ${question}\n\nVerified dashboard context:\n${JSON.stringify(compactResult(ctx), null, 2)}` },
      ],
    }),
  });

  if (!response.ok) throw new Error(`LLM request failed (${response.status}). Check endpoint, authentication, CORS, and model settings.`);
  const data: any = await response.json();
  const text = data?.choices?.[0]?.message?.content ?? data?.output_text ?? data?.content?.[0]?.text;
  if (!text) throw new Error('The endpoint responded, but no supported text field was found. Use an OpenAI-compatible chat-completions response shape.');
  return String(text);
}
