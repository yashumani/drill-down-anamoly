# ADR 0001: Evidence-first AI

## Status

Accepted for the prototype architecture.

## Decision

Financial and statistical calculations remain deterministic. AI may interpret results, plan validated tool calls, and draft commentary, but every factual claim must reference evidence IDs from an immutable evidence ledger. UI actions must pass semantic validation.

## Consequences

- The model cannot silently become the calculator.
- Claims can be audited back to a run ID.
- Local and hosted models can be compared against the same evidence contract.
- More engineering is required for evidence schemas, claim validation, and approval workflows.
