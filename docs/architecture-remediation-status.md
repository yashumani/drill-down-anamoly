# Architecture remediation status

## Implemented in architecture-hardening-v1

- aggregation-aware driver attribution for sum, average, and period-end metrics;
- reconciled support-weighted average contributions;
- latest-period population selection and explicit fallback warning;
- dataset-session identity and retained Finance Data Contract report;
- metric semantic definition and completeness scoring;
- rejection of unsupported contract aggregation methods;
- provider-neutral analytics interface and browser provider;
- evidence ledger with calculation, quality, metric, driver, interaction, and limitation evidence;
- deterministic agent response contract with evidence IDs and validated UI actions;
- AI evaluation checks for evidence, numeric grounding, causality, and run linkage;
- deep-linkable workspace hashes;
- outbound LLM evidence preview and hardened fetch behavior;
- CSP, permissions policy, security policy, threat model, model card, ADRs, CODEOWNERS, and PR checklist;
- dedicated branch CI with tests, production build, and source/dependency artifact.

## External or administrative work still required

- enable branch protection and required reviews in GitHub repository settings;
- deploy authenticated backend, warehouse provider, and model gateway;
- implement row-level/tenant authorization;
- persist investigation snapshots and approvals;
- migrate Socrata behind the provider-neutral interface;
- build governed ratio/distinct-count attribution;
- implement formal external-event study and backtested forecasting;
- add browser E2E, accessibility, security scanning, and performance budgets.
