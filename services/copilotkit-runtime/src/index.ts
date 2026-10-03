import 'dotenv/config';
import express from 'express';
import { BuiltInAgent, CopilotRuntime } from '@copilotkit/runtime/v2';
import { createCopilotExpressHandler } from '@copilotkit/runtime/v2/express';
import { parseRuntimeEnvironment } from './environment.js';

const environment = parseRuntimeEnvironment(process.env);

const prompt = `You are the FP&A Variance Copilot.

The frontend supplies a compact, deterministic evidence context and a small set of validated UI tools. Follow these rules:
1. Treat supplied financial values, evidence IDs, calculation run IDs, data-quality results, and metric semantics as authoritative.
2. Never invent, recalculate, or silently reinterpret financial values. Do not claim access to raw rows.
3. Distinguish an observed internal driver from an external hypothesis. Do not claim causality without validation evidence.
4. Respect metric polarity, aggregation behavior, reporting scope, and data-quality limitations.
5. Use frontend tools only when the user clearly requests navigation, dimension selection, drill, back, or reset.
6. Keep management answers concise: what happened, where it is concentrated, whether it is persistent, confidence/limitations, and the next validation action.
7. When evidence is insufficient, say so and ask for the missing definition or comparison rather than guessing.`;

const agent = new BuiltInAgent({
  model: environment.COPILOTKIT_MODEL,
  apiKey: environment.OPENAI_API_KEY,
  prompt,
  maxSteps: 6,
});

const runtime = new CopilotRuntime({
  agents: { default: agent },
});

const app = express();
app.disable('x-powered-by');
app.get('/healthz', (_request, response) => response.json({
  ok: true,
  service: 'fpa-copilotkit-runtime',
  model: environment.COPILOTKIT_MODEL,
  openAiCompatibleBaseUrlConfigured: Boolean(environment.OPENAI_BASE_URL),
}));

const allowedOrigins = new Set(environment.COPILOTKIT_ALLOWED_ORIGINS
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean));

app.use('/api/copilotkit', (request, response, next) => {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    response.status(403).json({ error: 'Origin is not allowed by this CopilotKit runtime.' });
    return;
  }
  next();
});

app.use('/api/copilotkit', createCopilotExpressHandler({
  runtime,
  basePath: '/',
  mode: 'single-route',
}));

app.listen(environment.PORT, environment.HOST, () => {
  console.log(`FP&A CopilotKit runtime listening on http://${environment.HOST}:${environment.PORT}/api/copilotkit`);
});
