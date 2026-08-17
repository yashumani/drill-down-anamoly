# FP&A Variance Copilot — target architecture v1

## Architectural objective

The product must keep deterministic finance calculations authoritative while using AI for navigation, explanation, validation planning, and commentary drafting.

```text
React experience
      ↓
Authenticated backend-for-frontend
      ↓
Semantic service ── Investigation service ── AI orchestrator
      ↓                    ↓                     ↓
Metric catalog       Analytics providers      Evidence ledger
Fiscal calendar      Forecast/driver tools    Claim verifier
Scenario catalog     Quality tools            Model gateway
      └────────────────────┬─────────────────────┘
                           ↓
             Warehouse / public APIs / local engine
```

## Provider-neutral analytics contract

The UI must consume stable evidence contracts rather than provider-specific query shapes. Browser files, Socrata, and future warehouse adapters should implement the same investigation and time-series interfaces.

The current branch introduces `AnalyticsProvider`, `BrowserAnalyticsProvider`, provider capabilities, and timed provider-run metadata. The public adapter remains source-specific and should be migrated behind this interface in the next backend stage.

## Dataset session

Every loaded dataset receives:

- session ID and deterministic content hash;
- source metadata;
- Finance Data Contract report;
- quality report;
- inferred defaults;
- metric definition;
- time candidates.

The session is the immutable input identity for calculations and AI evidence. Contract warnings are no longer discarded after upload.

## Metric semantic layer

A metric definition separates column mapping from business meaning. It records identity, definition, owner, certification, aggregation, polarity, unit, fiscal calendar, valid dimensions, source, caveats, and semantic completeness.

Driver attribution is allowed only for supported additive, support-weighted average, or latest-period total strategies. Ratios and distinct counts require governed calculation strategies.

## Evidence-first AI

The AI path uses:

```text
User question
  ↓
Intent resolver
  ↓
Deterministic finance guide / future planner
  ↓
Evidence ledger
  ↓
Validated claims and UI actions
  ↓
Narrative
```

Each claim references known evidence IDs. UI actions are validated against allowed dimensions and categories. The LLM receives a compact evidence ledger, dataset-session summary, metric definition, and calculation run identity rather than raw rows.

## Production services still required

- authenticated backend-for-frontend;
- warehouse pushdown and provider adapters;
- governed metric/scenario/fiscal-calendar service;
- server-side model gateway and secret management;
- persisted investigation and approval workflow;
- external-event study service;
- model and data observability;
- tenant and row-level authorization.
