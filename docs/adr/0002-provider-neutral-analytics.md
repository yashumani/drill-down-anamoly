# ADR 0002: Provider-neutral analytics

## Status

Accepted; migration in progress.

## Decision

The React experience consumes provider-neutral investigation, time-series, driver, interaction, and evidence contracts. Browser files, public APIs, and enterprise warehouses are adapters, not separate product architectures.

## Consequences

- Public and uploaded-data logic can converge.
- Provider-specific query and retry behavior stays inside adapters.
- The current Socrata implementation still needs migration behind the common interface.
