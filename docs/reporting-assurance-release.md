# Multi-Tier Reporting Assurance: release evidence and completion checklist

Target: bounded first release by October 15, 2026 12:00 UTC. Repository history/URL remain `yashumani/drill-down-anamoly`. Development checkout: `D:\Projects\drill-down-anamoly`; branch: `codex/multi-tier-reporting-assurance`; baseline: `3ed155481780b4b22b9b9ae4f760beb8477397dc`.

This record distinguishes package readiness from the pre-existing browser application and full product. No merge, deployment, registry publication or security-setting change is authorized or performed.

| Acceptance outcome | Current status / evidence |
| --- | --- |
| Installable dependency-free Python package, API and CLI | Verified locally from wheel in clean environments on Windows Python 3.9.21 and 3.12.14; current clean wheel checks repeat after source changes |
| Versioned strict declarative JSON and safe result schema | v1 schemas ship in wheel; runtime rejects unknown fields/operators, cyclic/unknown dependencies, unsupported literals and resource-limit violations; independent JSON Schema validation passes |
| Required fields, strict types/nullability, composite grain | Independent golden and malformed-input tests pass |
| Owner-declared categories/ranges, expected coverage, partition freshness | Golden and four-sector tests pass; missing references/context remain not_evaluated |
| Scenario/currency/unit/scale/snapshot consistency and subtotal protection | Golden and held-out variants pass; explicit row-level selection prevents summing subtotal plus children |
| Like-for-like flow and period-end reconciliation | Golden and held-out controls pass; internal identities remain distinct from caller-declared independent controls |
| Outcomes, severity, gate and approval boundaries | Separate pass/fail/not_evaluated/error; no score; trusted digest plus matching approval required in production; edits invalidate approval |
| Synthetic acceptance evidence | Original 61-file pack preserved under python/tests/fixtures/industry-pack; source ZIP SHA-256 62fcf3fe720e9438400434c88c7b6c0681db363417d77e6bab0843c051626c28; four clean sectors and all minimum findings of 15 isolated faults verified through explicit v1 adapter |
| Privacy, determinism, precision, scale and packaging | Counts-only defaults; opt-in <=20 row indices; no raw values/top strings; no IO/network inside executor; generated invariants and 100k-row test pass |
| Thin KNIME example | Delivered, explicitly unverified in actual KNIME; no KNIME environment detected or exercised |
| Bounded Tier 2 and deterministic draft suggestions | Ratio components, complete-period variance/group contributions, unique period-end and descriptive statistics verified; draft suggestions do not infer approved business limits |
| Committed/pushed branch, draft PR, remote CI | Pending milestone commit/push and remote verification |
| Rule-generation UI / optional AI | Unimplemented; no readiness claim |

## Current validation

Commands run from repository root, with explicit local Python executables:

- `python -m unittest discover -s python/tests -q`: 58 methods pass, including 100 generated decimal/permutation cases, four-sector clean fixtures and all 15 fault variants.
- Same suite passed on Windows Python 3.9.21 and 3.12.14 including final arithmetic-context and output-boundary refinements.
- `python -m build --no-isolation --outdir python/dist`: wheel and source distribution build successfully.
- `python scripts/verify_python_wheel.py`: verifies installed wheel, 0 runtime dependencies, API/module-CLI/installed-entrypoint parity, full suite and API example from an unrelated temporary directory.
- `python scripts/verify_python_schemas.py`: independent `jsonschema` validator passes bundle and report schemas.
- Python CI matrix is configured for Ubuntu/Windows, Python 3.9/3.12/3.13/3.14. Its remote results remain unverified until runs finish. macOS, KNIME and other Python releases are not claimed compatible.

The four-sector arithmetic oracle is independent test data, not a certificate of real source completeness. It covers a small declared synthetic population. It does not model real accounting policies, permission systems or complete transaction histories. Source-line controls cover January only.

## Existing UI baseline and dependency findings

At the baseline, `npm test`: 30 files / 74 tests passed. `npm run build` fails in existing CopilotKit integration: missing `@copilotkit/react-core/v2` and `zod`, `EvidenceLedger.id` mismatch and implicit-any callbacks. These failures are reproduced, isolated from the Python package and not suppressed. The optional CopilotKit path remains unverified.

The baseline `npm audit` reports source-map-js high DoS GHSA-68fv-2mgg-jv7q and three moderate findings. Compatible locked updates to source-map-js and Vitest remove the high finding and Vitest findings; all 74 existing tests still pass. A moderate ECharts advisory GHSA-fgmj-fm8m-jvvx remains and requires a major-version migration. `npm audit --audit-level=high` now exits successfully; this does not mean a clean full audit. Existing UI build CI remains expected to fail until the old CopilotKit dependency/type defects are repaired.

## Remaining full-product work

Rule profiling/edit/preview/export UI integrated with the authoritative Python executor; broader Tier 2 statistical methods with approved semantics; optional AI explanation with verified-evidence boundaries; actual KNIME validation; wider runtime/platform testing; production approval/authentication integration owned by callers. None is implied complete by this alpha package. Naming is provisional. The repository has no newly granted distribution license or registry reservation; publication is outside this task's authorization.
