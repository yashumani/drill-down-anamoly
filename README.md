# FP&A Variance Copilot

An evidence-first FP&A investigation workspace for Actual-versus-Plan analysis, finance time intelligence, multidimensional driver attribution, hierarchy exploration, data-readiness checks, public-data demonstrations, grounded conversational analytics, and deterministic presentation output.

Live application: `https://yashumani.github.io/drill-down-anamoly/`

## Product workspaces

### Quick Answer

A page-by-page finance workflow designed to avoid a long scrolling dashboard:

1. choose data;
2. choose the business question;
3. confirm the finance setup;
4. receive the management answer;
5. inspect the strongest drivers;
6. ask the finance guide or an optional LLM.

The Answer and Drivers pages can open Presentation Studio directly.

### Advanced Analysis

The full specialist workspace contains:

- Actual versus Plan, Budget, Target, Forecast, prior period, or a clearly labeled rolling baseline;
- daily, weekly, monthly, quarterly, MTD, QTD, YTD, rolling 15-month, and rolling 24-month analytical windows;
- sum, support-weighted average, and period-end attribution strategies;
- business-impact polarity for higher-is-better and lower-is-better metrics;
- quality-approved all-dimension scans and supported multidimensional interactions;
- time-aligned driver attribution, finance alerts, run-rate monitoring, and calculation evidence;
- parent-child hierarchy mapping, org-chart exploration, and animated hierarchy arcs;
- public-news and analyst-entered external hypothesis context;
- deterministic conversational analytics and optional OpenAI-compatible or local Ollama models;
- Presentation Studio for finance-ready infographic export.

### Live Public Demo

A six-page live demonstration backed by the City of Los Angeles procurement dataset. The public source contains more than 3.8 million payment records. Counts, sums, monthly groups, dimension groups, waterfall inputs, heatmap inputs, and hierarchy branches are calculated at the source; raw transaction rows are not downloaded into the browser.

### Data Quality

A supporting trust workspace for schema, completeness, validity, uniqueness, consistency, distribution, timeliness, identifier, privacy, and anomaly-readiness checks. Data quality informs the confidence and limitations supplied to the finance guide, optional LLM, and exported presentation evidence.

## Presentation Studio

The current deterministic investigation can be converted into a 16:9 executive infographic without AI.

Presets:

- Executive infographic: KPI cards, leading drivers, executive callout, and the core FP&A questions answered.
- Anomaly register: material or unusual periods plus the strongest supported drivers.
- Questions answered: a management-review slide organized around the questions leaders typically ask.

Exports:

- editable vector SVG;
- 1920 × 1080 PNG;
- browser print / PDF;
- evidence JSON containing the calculation-run and dataset-session linkage.

Titles, subtitles, themes, emphasis, and callouts can be changed manually. An optional local or OpenAI-compatible LLM may propose design wording and visual emphasis. Its accepted response schema contains design fields only, so it cannot modify Actual, comparison, variance, impact, anomaly, support, quality, or evidence values.

See `docs/presentation-studio.md`.

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

See `docs/finance-data-contract-v1.md`.

## Analytical authority

Deterministic calculations remain authoritative:

```text
Dataset session
      ↓
Metric semantics + quality report
      ↓
Time-intelligence and attribution engines
      ↓
Evidence ledger
      ↓
Quick Answer / Advanced Analysis / Presentation Studio
      ↓
Deterministic finance guide / optional grounded LLM
```

The LLM explains verified evidence or proposes presentation design fields. It does not calculate the financial result, choose unrestricted SQL, convert news into causal proof, or change exported numbers.

### Aggregation-aware attribution

- `sum` reconciles additive Actual and comparison totals;
- `average` uses support-weighted group contributions so category impacts reconcile to the selected-scope average impact;
- `period_end` selects the latest dated population before attribution;
- ratios and distinct counts are recognized semantic types, but detailed attribution remains disabled until governed calculation strategies are supplied.

### Driver scoring

Dimension scores are investigation-priority heuristics based on grouped movement, distinctiveness, concentration, support, and cardinality. They are not causal probabilities or statistical significance values.

### External context

News and analyst notes are treated as untrusted hypothesis material. The application distinguishes observed internal evidence from possible external explanations and includes limitations in the evidence ledger.

## Evidence-first AI

The deterministic agent returns a structured response containing intent, answer, claims, evidence IDs, confidence, validated UI actions, suggested questions, limitations, calculation-run ID, and evidence-ledger ID.

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

This is a technical-user same-device mode, not a hosted zero-setup model. Enterprise deployments should use an authenticated model gateway.

## Dataset sessions and reproducibility

Every loaded dataset receives:

- a session ID and deterministic content hash;
- source metadata;
- retained Finance Data Contract report;
- data-quality report;
- inferred finance defaults;
- metric semantic definition;
- time-field candidates.

Calculations carry versions, run IDs, aggregation methods, attribution bases, reconciliation status, warnings, and evidence IDs. Presentation exports retain the same calculation and dataset linkage.

## Security boundary

This repository is a public product prototype. It is suitable for public demonstrations and controlled masked-data pilots—not unreviewed confidential production finance data.

Current safeguards include browser-session upload handling, compact outbound LLM evidence, in-memory API keys, HTTPS-only external endpoints except explicit localhost development, untrusted-context instructions, Content Security Policy, threat modeling, CodeQL, dependency auditing, and bundle budgets.

Production still requires authentication, tenant isolation, row-level security, server-held secrets, DLP, audit logging, persistence, retention controls, and incident response.

## Development

```bash
npm ci
npm run dev
```

Validation:

```bash
npm test
npm run build
npm run check:bundle
```

## Repository structure

```text
src/
  AppShell.tsx                  # workspace and calculation orchestration
  components/                   # slides, analysis, charts, chat, presentation studio
  data/                         # demo data, themes, semantic labels
  lib/
    anomaly.ts                  # variance and driver attribution
    timeIntelligence.ts         # finance time aggregation and monitoring
    financeDataContract.ts      # canonical finance input mapping
    datasetSession.ts           # dataset identity and retained contract/quality state
    metricSemantics.ts          # metric-definition scaffold
    evidenceLedger.ts           # claim-addressable evidence
    agentOrchestrator.ts        # intent, claims, evidence, action validation
    llm.ts                      # optional evidence-grounded model client
    presentationStudio.ts       # deterministic slide model and SVG/PNG export
    dataQuality.ts              # dataset and field profiling
    livePublicFinance.ts        # Socrata public-data adapter
local-ai/                       # versioned Ollama model profile
services/                       # future authenticated APIs and gateways
docs/                           # architecture, contracts, methodology, and feature guides
```

## Remaining enterprise work

- authenticated backend-for-frontend and warehouse execution;
- tenant and row-level authorization;
- persisted investigation and commentary approval workflow;
- governed metric, scenario, fiscal-calendar, and hierarchy service;
- production model gateway and telemetry;
- ratio and distinct-count attribution;
- production forecast and external-event calibration;
- browser E2E, accessibility, device, and load testing;
- protected main branch and release approvals.

The tracked status is maintained in `docs/architecture-remediation-status.md`.
