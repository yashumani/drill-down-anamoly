# FP&A Variance Copilot

An evidence-first FP&A workspace for Actual-versus-Plan analysis, finance time intelligence, multidimensional driver attribution, hierarchy exploration, data-readiness checks, a multi-million-row public demonstration, grounded conversational analytics, and deterministic presentation output.

Live application: `https://yashumani.github.io/drill-down-anamoly/`

## Interface and user journey

The application uses an Open WebUI-inspired workspace shell adapted to FP&A analysis. It keeps persistent workspace navigation, a compact analysis-context bar, responsive mobile navigation, data upload, and direct access to Presentation Studio while preserving its own finance terminology, calculations, evidence contracts, and brand identity. No Open WebUI source code, logos, or branding are copied.

### Quick Answer

The default path is organized around five business decisions:

```text
Data → Goal → Detect → Explain → Share
```

1. Choose sample data, upload CSV/JSON, or open the live public demonstration.
2. Choose the management question and confirm Actual, comparison, and reporting period.
3. Review one business-impact result, four plain-language answers, and one compact trend.
4. Inspect the strongest supported drivers.
5. Create a deterministic presentation or use the optional evidence-grounded finance guide.

### Advanced Analysis

Specialist work is separated into five stages:

```text
Scope → Detect → Explain → Validate → Share
```

- **Scope:** choose metric, comparison, period, dimension, category, and drill population.
- **Detect:** review trend, materiality, pace, and unusual periods.
- **Explain:** switch between single drivers, combined patterns, and parent-child hierarchy.
- **Validate:** review data readiness and evaluate internal or external context as hypotheses.
- **Share:** create a slide, ask follow-up questions, export evidence, or inspect the factor audit.

See `docs/openwebui-interface-adaptation.md` and `docs/anomaly-investigation-journey.md`.

## Product workspaces

### Quick Answer

A simplified five-step workflow designed for first-time users, finance managers, and operating reviews.

### Explore & Analyze

The full specialist workspace contains:

- Actual versus Plan, Budget, Target, Forecast, prior period, or a clearly labeled rolling baseline;
- daily, weekly, monthly, quarterly, MTD, QTD, YTD, rolling 15-month, and rolling 24-month windows;
- sum, support-weighted average, and period-end attribution;
- higher-is-better and lower-is-better business-impact polarity;
- all-dimension scans and supported multidimensional interactions;
- time-aligned driver attribution, finance alerts, run-rate monitoring, and calculation evidence;
- parent-child mapping, org-chart exploration, and animated hierarchy arcs;
- public-news and analyst-entered external hypothesis context;
- deterministic conversational analytics and optional OpenAI-compatible or local Ollama models;
- Presentation Studio for finance-ready infographic export.

### Live Public Demo

A six-page live demonstration backed by the City of Los Angeles procurement dataset. The public source contains more than 3.8 million payment records. Counts, sums, monthly groups, dimension groups, waterfall inputs, heatmap inputs, and hierarchy branches are calculated at the source; raw transaction rows are not downloaded into the browser.

### Data Quality

A supporting trust workspace for schema, completeness, validity, uniqueness, consistency, distribution, timeliness, identifiers, privacy, and anomaly-readiness checks.

## Presentation Studio

The current deterministic investigation can be converted into a 16:9 executive infographic without AI.

Presets:

- Executive infographic;
- Anomaly register;
- Questions answered.

Exports:

- editable SVG;
- 1920 × 1080 PNG;
- browser print/PDF;
- evidence JSON containing calculation-run and dataset-session linkage.

An optional LLM may propose title, subtitle, theme, density, emphasis, and callout changes. It cannot modify Actual, comparison, variance, business impact, anomaly scores, driver values, quality scores, evidence IDs, calculation run IDs, or dataset-session IDs.

See `docs/presentation-studio.md`.

## Finance Data Contract v1

General CSV and JSON files are automatically profiled. Contract-compliant data is preferred because it deterministically maps finance concepts.

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

Long-format `period_date, scenario, value, ...` files are also recognized and pivoted. Contract v1 accepts one metric identity per file and rejects multi-metric inputs rather than silently combining unlike units.

See `docs/finance-data-contract-v1.md`.

## Analytical authority

```text
Dataset session
      ↓
Metric semantics + quality report
      ↓
Time-intelligence and attribution engines
      ↓
Evidence ledger
      ↓
Quick Answer / Explore & Analyze / Presentation Studio
      ↓
Deterministic finance guide / optional grounded LLM
```

The LLM explains verified evidence or proposes presentation-design fields. It does not calculate the financial result, choose unrestricted SQL, convert news into causal proof, or change exported numbers.

### Attribution behavior

- `sum` reconciles additive Actual and comparison totals;
- `average` uses support-weighted contributions;
- `period_end` selects the latest dated population;
- ratios and distinct counts remain disabled for detailed attribution until governed calculation strategies are supplied.

Dimension scores are investigation-priority heuristics, not causal probabilities or statistical significance values. News and analyst notes are untrusted hypothesis material unless supported by structured validation evidence.

## Local private model

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

This is a technical-user same-device mode. Enterprise deployment should use an authenticated model gateway.

## Development

```bash
npm ci
npm run dev
```

Validation:

```bash
npm test
npm run build -- --base=/drill-down-anamoly/
npm run check:bundle
```

## Security boundary

This public repository is suitable for demonstrations and controlled masked-data pilots, not unreviewed confidential production finance data. Production still requires authentication, tenant isolation, row-level security, server-held secrets, DLP, audit logging, persistence, retention controls, and incident response.

## Remaining enterprise work

- authenticated analytics backend and warehouse execution;
- tenant and row-level authorization;
- persisted investigation and commentary approval workflow;
- governed metric, scenario, fiscal-calendar, and hierarchy service;
- production model gateway and telemetry;
- ratio and distinct-count attribution;
- production forecast and external-event calibration;
- full browser E2E, accessibility, device, and load testing;
- protected main branch and release approvals.

See `docs/architecture-remediation-status.md`.
