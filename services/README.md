# Production service boundary

The GitHub Pages client remains a public prototype. Enterprise deployment requires independently deployable services behind authenticated endpoints.

## Services

### analytics-api

Owns investigation state, provider routing, warehouse pushdown, calculation snapshots, row-level authorization, and supporting evidence retrieval.

### semantic-service

Owns governed metric definitions, scenarios, fiscal calendars, hierarchies, certification, lineage, target grain, and allowed drill dimensions.

### ai-gateway

Owns model/provider credentials, model allowlists, prompt and tool-schema versions, DLP, rate limits, telemetry, retention policy, and claim-validation handoff.

### external-events

Normalizes news and business events, maps events to finance levers, and runs pre/post or affected-versus-control validation before an external factor is labeled supported.

## Non-negotiable production controls

- SSO and tenant identity at the gateway;
- row-level and metric-level authorization enforced server-side;
- idempotency keys for write operations;
- immutable calculation and evidence versions;
- no raw API keys in browser code;
- no unrestricted generated SQL;
- no causal claim without a structured event-study result;
- auditable model, prompt, tool, and evidence versions;
- explicit retention, deletion, and incident ownership.

The OpenAPI files in each service directory define the intended contracts. They are scaffolds, not deployed services.
