# Architecture remediation status

## Implemented and merged

### Finance calculation and data contracts

- Aggregation-aware driver attribution for additive totals, support-weighted averages, and period-end metrics.
- Reconciled category contributions and explicit attribution basis, population date, calculation version, run ID, and warnings.
- Strict ISO date parsing with invalid-calendar-date rejection and regression tests.
- Finance Data Contract v1 with retained mapping report, deterministic dataset-session identity, and content hash.
- Metric semantic definition scaffold covering identity, definition, ownership, certification, aggregation, polarity, unit, fiscal calendar, allowed dimensions, source, and caveats.
- Explicit rejection of unsupported ratio or distinct-count attribution until a governed strategy is supplied.

### Forecasting and external-factor validation

- Out-of-sample baseline-model backtesting across naive, rolling-median, and 12-period seasonal-naive candidates.
- WAPE, bias, fold count, empirical prediction interval, champion readiness, warnings, and CFO Pulse/AI evidence integration.
- Descriptive external-event study supporting affected-versus-control difference-in-differences or pre/post comparison.
- Pre/post evidence counts, robust standardized effect, parallel-trend diagnostic, supported/weak/contradicted/insufficient status, limitations, and a user-facing validation lab.

These are governed prototype implementations. Production model calibration, working-day/holiday features, model promotion policy, event normalization, placebo tests, concurrent-event controls, and monitoring remain tracked work.

### Evidence-first AI architecture

- Evidence ledger with stable IDs for dataset, metric, quality, scope, variance, time, forecast, driver, interaction, external-context, and limitation evidence.
- Deterministic agent tool planner and executor.
- Structured agent response contract with claims, evidence IDs, tool trace, validated UI actions, limitations, calculation run ID, and evidence-ledger ID.
- AI evaluation checks for evidence coverage, numerical grounding, causal-language risk, and calculation-run linkage.
- Outbound LLM evidence preview, local Ollama preset, BYO OpenAI-compatible provider support, and hardened request behavior.

### Platform, governance, and operational controls

- Provider-neutral browser and remote-aggregate analytics interfaces.
- Versioned investigation/evidence snapshot export.
- Deep-linkable workspace hashes.
- OpenAPI contracts for analytics, semantic, AI-gateway, and external-event services.
- CSP, Permissions Policy, Referrer Policy, security policy, threat model, AI model card, ADRs, CODEOWNERS, and pull-request checklist.
- Package lock and `npm ci` installation.
- Analytical, semantic, provider, agent, AI-evaluation, forecast, event-study, snapshot, routing, visualization, data-quality, and date regression tests.
- Vite bundle splitting and an enforced production bundle budget.
- CodeQL, locked dependency audit, and optional GitHub dependency review.
- Public Socrata adapter monitoring separated from product deployment, with retries, timeout diagnostics, scheduled execution, and optional app-token support.

## Merged releases

- PR #1: architecture hardening and evidence-first AI platform changes.
- PR #8: separate live-adapter monitoring from deterministic product deployment.
- Latest Pages and security workflows passed on `main`.

## Remaining enterprise and administrative work

These items require deployed infrastructure, organization settings, governed business ownership, or production operating processes. They are not represented as complete merely because interfaces or prototypes exist.

- Enable protected `main`, required reviews/checks, environment approval, and release/rollback governance in repository settings.
- Enable GitHub Dependency Graph so dependency-review-action can become an additional blocking pull-request gate.
- Deploy an authenticated backend-for-frontend and warehouse providers.
- Enforce tenant, role, metric, dimension, and row-level authorization server-side.
- Deploy the governed metric/scenario/fiscal-calendar/hierarchy service.
- Deploy the model gateway with server-held secrets, DLP, provider policy, model registry, evaluations, telemetry, and retention controls.
- Persist investigation snapshots and implement commentary review, approval, publication, correction, and audit workflows.
- Migrate the current Socrata implementation behind the provider-neutral service boundary.
- Implement governed ratio, distinct-count, and other metric-specific attribution strategies.
- Productionize forecast and external-event methods with calibration, model monitoring, event normalization, sensitivity testing, and operating thresholds.
- Add browser E2E, accessibility, browser/device compatibility, load, warehouse-performance, incident, and rollback validation.

## Tracking issues

- #2 — authenticated analytics BFF, warehouse providers, and row-level security.
- #3 — governed metric, scenario, fiscal-calendar, and hierarchy service.
- #4 — governed AI gateway, DLP, model registry, evaluations, and audit telemetry.
- #5 — persisted investigation snapshots and finance commentary approvals.
- #6 — production forecast and external-event calibration and monitoring.
- #7 — E2E, accessibility, performance, adapter monitoring, and release governance.
