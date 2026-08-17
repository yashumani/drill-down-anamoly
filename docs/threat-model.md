# Threat model — FP&A Variance Copilot

## Assets

- uploaded financial extracts;
- metric definitions and planning assumptions;
- API keys and model endpoints;
- analytical results and management commentary;
- external-news and analyst context;
- investigation state and evidence snapshots.

## Trust boundaries

1. User browser and local file system.
2. Public GitHub Pages origin.
3. Public-data and news providers.
4. Local Ollama or user-configured LLM endpoint.
5. Future authenticated backend and enterprise warehouse.

## Primary threats

| Threat | Current control | Remaining action |
|---|---|---|
| Raw financial data sent to a model | Compact evidence only; outbound preview | Server-side DLP and policy gateway |
| API-key persistence | Key kept in component memory | Server-held secrets |
| Prompt injection from news/context | Untrusted-context system instructions | Structured ingestion and content isolation |
| Malicious model URL/header | URL and header validation; CSP; credentials omitted | Provider allowlist and egress proxy |
| Cross-tenant or row-level access | Not applicable in local prototype | Authentication, tenancy, RLS, policy tests |
| Incorrect finance claim | Deterministic calculations, evidence IDs, limitations | Claim verifier and approval workflow |
| Unsupported causal conclusion | Hypothesis language and AI evaluation check | Event-study service and causal review |
| Supply-chain compromise | Tests and pinned workflow action majors | Lockfile, dependency review, CodeQL, signed releases |
| Direct-to-main deployment | Branch CI and CODEOWNERS files | Repository branch-protection settings |
| Public-data outage or schema drift | Non-blocking smoke test and runtime errors | Scheduled adapter monitor and alerting |

## Security boundary

The public site must remain classified as a demonstration until authentication, tenant isolation, row-level security, DLP, audit logs, retention policy, and incident response are implemented.
