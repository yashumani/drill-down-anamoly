# CopilotKit integration

## Purpose

CopilotKit is used as the agent orchestration and application-action layer. It does not replace the deterministic FP&A calculation engine.

```text
React investigation state
        ↓
Compact finance context + evidence IDs
        ↓
CopilotKit runtime / AG-UI
        ↓
Model explanation and validated frontend tools
        ↓
Existing deterministic drill, back, reset, and dimension-selection actions
```

## What the agent receives

The browser registers a serializable `fpa-copilot-context/v1` object containing:

- dataset session identity and row count;
- metric definition, polarity, aggregation, and comparison field;
- current predicates and calculation run ID;
- business impact and supported variance values;
- current-period and YTD evidence when time intelligence is available;
- leading dimensions, categories, and supported interactions;
- data-quality score, blockers, warnings, and readiness;
- evidence-ledger ID and evidence item IDs;
- analyst-entered external hypotheses;
- limitations from the deterministic calculation.

Raw uploaded rows are deliberately excluded from this context.

## Frontend tools

The CopilotKit agent can invoke four browser actions:

1. `selectFinanceDimension`
2. `drillIntoFinanceCategory`
3. `goBackOneFinanceDrillLevel`
4. `resetFinanceAnalysisScope`

Dimension and category values are checked against the current deterministic result before a UI action is applied. These tools do not modify source data or financial calculations.

## Runtime modes

### Self-hosted runtime

The repository includes `services/copilotkit-runtime`, a standalone Express runtime using CopilotKit v2. This is the initial recommended mode because it supports an approved hosted model, an enterprise OpenAI-compatible gateway, or a private Ollama-compatible endpoint.

The current self-hosted runner stores thread state in memory. Restarts clear history.

### Managed CopilotKit Intelligence

Managed Intelligence can be evaluated later when authenticated user identity, durable threads, and organizational approval are available. It should not be enabled with one shared demo user ID because that would mix thread ownership across visitors.

## Connecting the static website

GitHub Pages cannot execute the runtime. Deploy the runtime separately behind HTTPS, then either:

- paste its URL into **Use CopilotKit agent orchestration** in the AI workspace; or
- build with `VITE_COPILOTKIT_RUNTIME_URL` and optional `VITE_COPILOTKIT_AGENT_ID`.

The browser stores only the runtime URL and agent ID. Provider credentials remain server-side.

## Local model example

```text
COPILOTKIT_MODEL=openai/fpa-variance-copilot
OPENAI_BASE_URL=http://127.0.0.1:11434/v1
OPENAI_API_KEY=ollama
```

A phone cannot reach a laptop's model through `127.0.0.1`; use an authenticated HTTPS gateway for cross-device access.

## Fallback behavior

When no CopilotKit runtime is configured, the existing deterministic Finance Guide and optional direct local/BYO LLM experience remain available. If a configured CopilotKit runtime fails during a question, the UI displays the deterministic answer and the connection failure rather than returning an empty response.

## Production boundary

Production use requires authentication, tenant isolation, row-level authorization, DLP/redaction policy, model allowlists, persistent threads, audit logs, rate limits, monitoring, and an incident/rollback procedure.
