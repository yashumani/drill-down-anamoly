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
| Thin KNIME example | Delivered, explicitly unverified in actual KNIME; no runnable KNIME installation found at the inspected path; actual execution unverified |
| Bounded Tier 2 and deterministic draft suggestions | Ratio components, complete-period variance/group contributions, unique period-end and descriptive statistics verified; draft suggestions do not infer approved business limits |
| Committed/pushed branch, draft PR, remote CI | First milestone c8e85cb28e131a4e9da83c07826ef599951cac56 pushed/fetched equal; draft PR #23; all eight Python matrix jobs and security CI passed. Optional Studio follow-up is being verified separately. |
| Optional rule-authoring UI / optional AI | Local Studio implemented and seven HTTP integration methods pass. Actual browser/visual/download checks blocked by computer-use runtime. Optional AI remains unimplemented. |

## Current validation

Commands run from repository root, with explicit local Python executables:

- `python -m unittest discover -s python/tests -q`: 65 methods pass (58 core/fixture methods plus 7 Studio HTTP adapter methods), including 100 generated decimal/permutation cases, four-sector clean fixtures and all 15 fault variants.
- Same suite passed on Windows Python 3.9.21 and 3.12.14 including final arithmetic-context and output-boundary refinements.
- `python -m build --no-isolation --outdir python/dist`: wheel and source distribution build successfully.
- `python scripts/verify_python_wheel.py`: verifies installed wheel, 0 runtime dependencies, API/module-CLI/installed-entrypoint parity, full suite and API example from an unrelated temporary directory.
- `python scripts/verify_python_schemas.py`: independent `jsonschema` validator passes bundle and report schemas.
- Python CI matrix passed all eight Ubuntu/Windows × Python 3.9/3.12/3.13/3.14 jobs on c8e85cb. The optional Studio follow-up must repeat these checks on its own head. macOS, KNIME and other Python releases are not claimed compatible.

The four-sector arithmetic oracle is independent test data, not a certificate of real source completeness. It covers a small declared synthetic population. It does not model real accounting policies, permission systems or complete transaction histories. Source-line controls cover January only.

## Existing UI baseline and dependency findings

At the baseline, `npm test`: 30 files / 74 tests passed. `npm run build` fails in existing CopilotKit integration: missing `@copilotkit/react-core/v2` and `zod`, `EvidenceLedger.id` mismatch and implicit-any callbacks. These failures are reproduced, isolated from the Python package and not suppressed. The optional CopilotKit path remains unverified.

The baseline `npm audit` reports source-map-js high DoS GHSA-68fv-2mgg-jv7q and three moderate findings. Compatible locked updates to source-map-js and Vitest remove the high finding and Vitest findings; all 74 existing tests still pass. A moderate ECharts advisory GHSA-fgmj-fm8m-jvvx remains and requires a major-version migration. `npm audit --audit-level=high` now exits successfully; this does not mean a clean full audit. Existing UI build CI remains expected to fail until the old CopilotKit dependency/type defects are repaired.

## Remaining full-product work

Actual browser/visual/download verification of the local Studio and integration with the pre-existing browser application; broader Tier 2 statistical methods with approved semantics; optional AI explanation with verified-evidence boundaries; actual KNIME validation; wider runtime/platform testing; production approval/authentication integration owned by callers. None is implied complete by this alpha package. Naming is provisional. No registry reservation or publication is claimed.

## Durable milestone and remote evidence

- First implementation commit: `c8e85cb28e131a4e9da83c07826ef599951cac56`; local/remote SHA equality proved after fetch.
- Draft PR: https://github.com/yashumani/drill-down-anamoly/pull/23
- Python CI: https://github.com/yashumani/drill-down-anamoly/actions/runs/38657578917 — all 8 jobs passed, including clean wheel, full suite, schema validation and artifacts.
- Security CI: https://github.com/yashumani/drill-down-anamoly/actions/runs/38657578921 — passed.
- Existing UI build CI: https://github.com/yashumani/drill-down-anamoly/actions/runs/38657578959 — failed at the same pre-existing CopilotKit imports/type defects; all 74 tests passed before build.

An optional narrow UI-dependency repair was attempted using the exact versions already named by the repository's integration workflow. Installation stalled; a bounded no-audit retry also did not finish promptly. Only this task's verified npm processes were cancelled, and no unverified dependency declarations were kept. The verified security lock updates remain. The temporary local Studio verification server was stopped. This is not a claim that the optional AI UI works.

PyPI JSON lookups for reporting-assurance and multi-tier-reporting-assurance returned 404 at verification time. Naming remains provisional; that observation does not reserve either name.

## Current local artifact proof

Both clean Windows Python 3.9.21 and 3.12.14 wheel runs report `Ran 65 tests` / `OK`, API/module-CLI/installed-command parity, and `runtime_dependencies: []`. Schema validation independently passes Tier 1 and Tier 2 outputs.

- Wheel: `python/dist/multi_tier_reporting_assurance-0.1.0a1-py3-none-any.whl`
- Wheel SHA-256: `bbfd5586ef1eeccf00eb25b2cf184886938038dda2deb91ce5bc3fde07f8302d`
- Source: `python/dist/multi_tier_reporting_assurance-0.1.0a1.tar.gz`
- Source SHA-256: `7836f6646ed76b82fda7b69695ce33263015ae78dd7c7612a6bb35f634cd0b8b`

The optional Studio follows the original 58-test core milestone. Its seven additional HTTP tests pass on both local runtimes. Browser/visual/download completion remains unverified due to the missing-platform-directory computer-use error.

## Reviewed corrections after 71d4ef49

Source review found two real defects, independently reproduced before fixes. Real CLI processes showed valid quarter variance incorrectly unavailable because reference calendar `complete` remained a string and a separate baseline measure remained untyped. A JavaScript test with delayed validation showed export downloading edited text that had never been validated.

The fixes share explicit approval-bound reference schemas between CLI/Studio, enforce native types required by registered operations, and capture one immutable export snapshot for validation/download. Invalid/incomplete calendar or baseline data still produces not_evaluated. Tests now cover the actual installed CLI variance path, separate baseline measure, exact 6000/6600/-600 quarter arithmetic, explicit schema validation/approval changes, shared Studio typing and editing during delayed export validation.

Local targeted/full verification at this stage: 74 Python methods pass and 75 JavaScript tests pass. Clean wheel and current push CI must be repeated after the final commit.

CI identity correction: run38659452365 was the exact-head **push** run for the alpha. Run38659457325 tested the **PR merge commit**. Those are different evidence scopes. Subsequent release checks record event, checked-out SHA and expected GITHUB_SHA, and separately inspect push-triggered runs for the exact source commit.
