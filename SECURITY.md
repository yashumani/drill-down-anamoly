# Security policy

## Supported status

This repository is a public FP&A analytics prototype. It is not approved for unmasked confidential, regulated, or production financial data until an authenticated backend, row-level security, server-side model gateway, audit logging, and formal security review are in place.

## Report a vulnerability

Do not open a public issue containing credentials, private data, exploitable payloads, or sensitive screenshots. Contact the repository owner privately through GitHub.

Include:

- affected commit and page;
- reproduction steps;
- data exposure or integrity impact;
- whether the issue affects uploaded files, external APIs, local Ollama, or BYO-LLM endpoints;
- recommended containment.

## Current safeguards

- Browser uploads remain in the active browser session.
- LLM calls use compact analytical evidence rather than raw uploaded rows.
- API keys are held only in component memory.
- External context is treated as untrusted evidence.
- LLM URLs require HTTPS except explicit localhost development.
- Network requests omit credentials and referrer information.
- Content Security Policy restricts script, object, worker, and connection sources.

## Known production gaps

- no authentication, tenant isolation, or row-level security;
- no server-held secrets or DLP gateway;
- no formal data-retention or model-provider policy enforcement;
- no centralized audit or incident telemetry;
- local and BYO model endpoints remain user-controlled.
