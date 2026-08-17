# FP&A Variance Copilot

An evidence-first FP&A investigation workspace for Actual-versus-Plan analysis, finance time intelligence, multidimensional driver attribution, data-readiness checks, public-data demonstrations, and grounded conversational analytics.

Live application: `https://yashumani.github.io/drill-down-anamoly/`

## Product workspaces

### Quick Answer

A page-by-page finance workflow that avoids a long scrolling dashboard:

1. choose data;
2. choose the business question;
3. confirm the finance setup;
4. receive the management answer;
5. inspect the strongest drivers;
6. ask the finance guide or an optional LLM.

### Advanced Analysis

The full specialist workspace contains:

- Actual versus Plan, Budget, Target, Forecast, prior period, or rolling baseline;
- daily, weekly, monthly, quarterly, MTD, QTD, YTD, rolling 15-month, rolling 24-month, and custom analytical windows;
- sum, support-weighted average, and period-end attribution strategies;
- business-impact polarity for higher-is-better and lower-is-better metrics;
- quality-approved all-dimension scans and supported multidimensional interactions;
- time-aligned driver attribution, finance alerts, run-rate monitoring, and calculation evidence;
- public-news and analyst-entered external hypothesis context;
- deterministic conversational analytics and optional OpenAI-compatible/local Ollama models.

### Live Public Demo

A five-page live demonstration backed by the City of Los Angeles procurement dataset. The public source contains more than 3.8 million payment records. Counts, sums, monthly groups, dimension groups, waterfall inputs, and heatmap inputs are calculated at the source; raw transaction rows are not downloaded into the browser.

### Data Quality

A supporting trust workspace for schema, completeness, validity, uniqueness, consistency, distribution, timeliness, identifier, privacy, and anomaly-readiness checks. Data quality informs the confidence and limitations supplied to the finance guide and optional LLM.

## Finance Data Contract v1

The browser accepts general CSV and JSON through automatic profiling. Contract-compliant data is preferred because it deterministically maps finance concepts.

Recommended wide format:

```text
period_date
actual_value
plan_value or budget_value or target_value
forecast_value                  optional
prior_year_value                optional
metric_id
metric_name
metric_definition               recommended
metric_owner                    recommended
metric_certification            recommended
metric_polarity                 higher_is_better | lower_is_better
aggregation_method              sum | average | period_end
planning_lens                   revenue | opex | capex | marketing | corporate | workforce
currency / metric_unit
fiscal_year_start_month
dim_<business_dimension>        any number of dimensions
```

Long-format `period_date, scenario, value, ...` files are also recognized and pivoted. Contract v1 accepts one metric identity per file; it rejects multi-metric inputs rather than silently combining unlike units.

See `docs/finance-data-contract-v1.md` for the complete contract and limitations.

## Analytical authority

The architecture keeps deterministic calculations authoritative:

```text
Dataset session
      ↓
Metric semantics + quality report
      ↓
Time-intelligence and attribution engines
      ↓
Evidence ledger
      ↓
Deterministic finance guide / optional grounded LLM
      ↓
Claims, evidence IDs, limitations, and validated UI actions
```

The LLM explains verified evidence. It does not calculate variance, choose unrestricted SQL, or convert news into causal proof.

### Aggregation-aware attribution

- `sum` reconciles additive Actual and comparison totals;
- `average` uses support-weighted group contributions so category impacts reconcile to the selected-scope average impact;
- `period_end` selects the latest dated population before attribution;
- ratios and distinct counts are recognized as governed semantic types but detailed driver attribution is disabled until numerator/denominator or distinct-count strategies are supplied.

### Driver scoring

Dimension scores are investigation-priority heuristics based on grouped movement, distinctiveness, concentration, support, and cardinality. They are not causal probabilities or statistical significance values.

### External context

News and analyst notes are treated as untrusted hypothesis material. The application distinguishes observed internal evidence from possible external explanations and includes limitations in the evidence ledger.

## Evidence-first AI

The deterministic agent returns a structured response containing:

```text
intent
answer
claims
evidence IDs
confidence
validated UI actions
suggested questions
limitations
calculation run ID
evidence-ledger ID
```

Optional LLM calls receive compact finance, metric, quality, time, driver, interaction, and limitation evidence—not raw uploaded rows by default. An outbound-evidence preview is available before model use.

### Local private model

The repository includes a versioned Ollama profile:

```bash
ollama pull llama3.2
ollama create fpa-variance-copilot -f local-ai/ollama/Modelfile
OLLAMA_ORIGINS=https://yashumani.github.io ollama serve
```

Dashboard settings:

```text
Endpoint: http://127.0.0.1:11434/v1/chat/completions
Model:    fpa-variance-copilot
API key:  blank
```

This is a technical-user local mode, not a hosted zero-setup model. Enterprise deployments should use an authenticated model gateway.

## Dataset sessions and reproducibility

Every loaded dataset receives:

- a session ID and deterministic content hash;
- source metadata;
- retained Finance Data Contract report;
- data-quality report;
- inferred finance defaults;
- metric semantic definition;
- time-field candidates.

Calculations carry versions, run IDs, aggregation methods, attribution bases, reconciliation status, warnings, and evidence IDs.

## Provider-neutral direction

`AnalyticsProvider` and `BrowserAnalyticsProvider` establish a provider-neutral boundary for investigation and time-series evidence. The next backend stage will place Socrata and enterprise warehouse adapters behind the same contract.

See `docs/target-architecture-v1.md` and `docs/adr/` for the target platform and architecture decisions.

## Security boundary

This repository is a public product prototype. It is suitable for public demonstrations and controlled masked-data pilots—not unreviewed confidential production finance data.

Current safeguards include:

- browser-session data handling for uploaded files;
- compact outbound LLM evidence rather than raw rows;
- in-memory API keys;
- HTTPS-only external endpoints except explicit localhost development;
- untrusted-context instructions;
- Content Security Policy, referrer policy, permissions policy, threat model, model card, CODEOWNERS, and pull-request checklist.

Production still requires authentication, tenant isolation, row-level security, server-held secrets, DLP, audit logging, provider policy, persistence, retention controls, and incident response.

See `SECURITY.md` and `docs/threat-model.md`.

## Development

```bash
npm ci
npm run dev
```

Validation:

```bash
npm test
npm run build
```

The test suite covers calculation correctness, time intelligence, Finance Data Contract behavior, data quality, aggregation-aware attribution, metric semantics, dataset sessions, evidence-first agent responses, AI evaluation checks, routing, public-data queries, dimension matrices, palettes, and presentation navigation.

## Repository structure

```text
src/
  AppShell.tsx                  # workspace, dataset-session, and calculation orchestration
  components/                   # slideshow, advanced, public, quality, charts, chat
  data/                         # demo data, themes, semantic labels
  lib/
    anomaly.ts                  # aggregation-aware variance and driver attribution
    timeIntelligence.ts         # finance time aggregation and monitoring
    financeDataContract.ts      # canonical finance input mapping
    datasetSession.ts           # dataset identity and retained contract/quality state
    metricSemantics.ts          # governed metric-definition scaffold
    analyticsProvider.ts        # provider-neutral analytical interface
    evidenceLedger.ts           # claim-addressable evidence
    agentOrchestrator.ts        # intent, claims, evidence, action validation
    aiEval.ts                   # groundedness and run-linkage checks
    llm.ts                      # optional evidence-grounded model client
    dataQuality.ts              # dataset and field profiling
    livePublicFinance.ts        # current Socrata public-data adapter
local-ai/                       # versioned Ollama model profile
services/                       # reserved for future authenticated APIs/gateways
docs/adr/                       # architecture decisions
```

## Remaining enterprise work

The code-level hardening branch closes the highest-risk prototype gaps. The following require deployed services, administrative controls, or governed business ownership:

- authenticated backend-for-frontend and warehouse execution;
- tenant and row-level authorization;
- persisted investigation, commentary approval, and audit history;
- governed metric/scenario/fiscal-calendar service;
- production model gateway and telemetry;
- public-adapter migration behind the provider-neutral contract;
- ratio/distinct-count attribution;
- event-study causality testing and backtested forecasting;
- browser E2E, accessibility, security scanning, and performance budgets;
- repository branch-protection and release approvals.

The tracked status is maintained in `docs/architecture-remediation-status.md`.
