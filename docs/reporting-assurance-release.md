# Multi-Tier Reporting Assurance: bounded alpha release evidence

Target: October 15, 2026 12:00 UTC. Repository: `yashumani/drill-down-anamoly`; canonical checkout: `D:\Projects\drill-down-anamoly`; feature branch: `codex/multi-tier-reporting-assurance`; baseline: `3ed155481780b4b22b9b9ae4f760beb8477397dc`. Draft PR: https://github.com/yashumani/drill-down-anamoly/pull/23.

This is an installable, bounded alpha alongside the existing app. It is not full-product completion. No merge, deployment, registry publication, repository rename or security-setting change has been performed. All acceptance data is fictional.

| Acceptance outcome | Evidence / limitation |
| --- | --- |
| Python package, API and CLI | Distribution `multi-tier-reporting-assurance` 0.1.0a1; import `reporting_assurance`; zero runtime dependencies. Clean wheel installs verified on Windows Python 3.9.21 and 3.12.14, including installed CLI subprocesses. |
| Tier 1 rules | Ten registered typed operators: required_fields, types, unique, allowed_values, range, coverage, freshness, consistency, row_level, reconcile. No eval, callbacks, dynamic imports, SQL/shell, URL fetching or hidden input mutation. |
| Strict versioned rule contract | JSON v1 rejects unknown fields/operators, duplicate JSON keys, invalid literals, dependencies/cycles and resource violations. Reference schemas are explicit and approval-bound; required native reference types come from registered roles. |
| Approval and gate | Separate outcome, severity and gate; preview is non-gating. Production requires matching approval content plus a digest trusted by the caller. Edits invalidate approval. This does not authenticate a person or independent source. Missing/error required checks prevent a passing gate. |
| Semantics and completeness | Declared grain, expected groups, partition freshness, scenario/currency/unit/scale/snapshot checks, explicit detail selection and independent/internal control scope. Missing business context or controls gives not_evaluated. Internal consistency does not prove completeness; aggregates do not prove transactions. |
| Safe reports and determinism | Counts-only defaults; no raw rows or top-value strings. Diagnostics opt into at most 20 row indices. Exact Decimal sums, fixed arithmetic context, explicit evaluation time, bounded inputs/work and no clock/network/IO inside checks. |
| Independent synthetic acceptance | Original 61-file four-sector pack preserved byte-for-byte. Four clean sectors and all minimum expected findings from 15 isolated replacement faults pass through the explicit v1 adapter. ZIP SHA-256: `62fcf3fe720e9438400434c88c7b6c0681db363417d77e6bab0843c051626c28`. |
| Bounded Tier 2 | Declared ratio of sums, closed/complete-period Actual/Plan variance, population summary and unique period-end selection. Own prerequisite failures skip only dependent analyses. No causal, learned-anomaly or transaction-level claims. |
| Draft suggestions | Observed metadata is separate from optional, nonblocking presence/type proposals. Observed categories/ranges/uniqueness never become approved boundaries or grain. |
| Thin KNIME example | Delivered and explicitly unverified. Inspected known KNIME folder contains a quickstart PDF; no runnable installation or matching uninstall entry was found. |
| Optional local Studio | Profiles counts, suggests editable drafts, previews through the same Python executor and exports the exact validated JSON snapshot. Seven HTTP integration methods plus seven JavaScript race/invalidation unit tests pass. Actual browser/visual/keyboard/mobile/download completion remains unverified. |
| Existing app | 81 JavaScript tests, TypeScript/production build and unchanged bundle budgets pass locally after narrow dependency/type/Windows-path repairs. Connected Copilot runtime behavior and model operation remain unverified. Python Tier 3 remains unimplemented. |

## Current local acceptance

- `PYTHONPATH=python/src python -m unittest discover -s python/tests -q`: **76 methods pass**, including the four-sector oracle, 100 generated decimal/permutation cases, 100k rows, malformed/hostile input, privacy/no IO and resource bounds.
- `python -m build --no-isolation --outdir python/dist`: wheel and source distribution built.
- `python scripts/verify_python_wheel.py`: isolated venv, `--no-index --no-deps`, unrelated working directory, all 76 methods, API/module-CLI/installed-entrypoint parity, optional Tier 2 CLI, and zero runtime dependencies pass on Windows **3.9.21 and 3.12.14**.
- `python scripts/verify_python_schemas.py`: independent jsonschema checks pass for rule bundles, Tier 1 and Tier 2 reports.
- `npm test`: **31 files / 81 tests pass**. JavaScript Studio tests run actual inline application code in a Node VM with a controlled delayed response; this is not browser verification.
- `npm run build`: TypeScript and Vite production build pass with no configured Copilot runtime. Large-chunk warning remains. No runtime/model call was made.
- `npm run check:bundle`: passes existing limits (1,800,000 bytes total JS, 1,300,000 largest JS chunk, 176,000 CSS); limits were not raised. The Windows file-URL conversion bug was reproduced and repaired using fileURLToPath.
- `npm ls --all`: passes. `npm audit --audit-level=high`: exit 0, with **0 high/critical, 1 moderate ECharts and 7 low optional SDK dependency findings**. This is not a clean full audit.
- All workflow YAML parses; embedded legacy setup Python compiles without execution. Only its broken YAML literal indentation was repaired; original trigger and permissions were explicitly checked unchanged.

## Reproduced defects repaired after the first alpha

At `71d4ef49dbe06713d7cd7e32cf7fe25e7510bfc3`, real installed CLI processes incorrectly skipped valid quarter variance: calendar `complete` remained text and a separate baseline measure remained untyped. Delayed-response JavaScript testing also showed Studio exporting text edited after validation began. Commit `269fa7f6b8eaf238a85a797cb6589f03ef109655` repaired both using shared approval-bound reference typing and one immutable export snapshot.

This follow-up rejects false/empty invalid CSV conversion options, invalidates stale previews after edits or changed requests, includes reference tables in the conservative 50,000,000-cell-check work limit, and restores the existing app build. Independent regressions failed before the fixes. The real evidence ledger identity is ledgerId; the installed SDK requires distinct local and runtime agent identities for a pinned thread. Exact dependency versions already named by the repository's setup workflow were installed with scripts disabled. No type suppression was added.

## Durable remote evidence and identity

Remote runs must be attributed to both event and actual checkout. A PR merge checkout is not the feature branch source commit. CI now records event, checked-out SHA and GITHUB_SHA and asserts identity. Feature-branch push CI verifies the Python matrix and full existing application/Studio test/build/budget checks. Current follow-up push results are recorded in the draft PR and implementation handoff after inspection.

Verified earlier source-push checkpoints:

| Source commit | Push evidence |
| --- | --- |
| `c8e85cb28e131a4e9da83c07826ef599951cac56` | Python run https://github.com/yashumani/drill-down-anamoly/actions/runs/38657578917 : all eight Ubuntu/Windows x Python 3.9/3.12/3.13/3.14 jobs passed. |
| `71d4ef49dbe06713d7cd7e32cf7fe25e7510bfc3` | Exact-head Python push run was 38659452365. Run38659457325 was PR merge-commit CI, not exact-source evidence. |
| `269fa7f6b8eaf238a85a797cb6589f03ef109655` | Python https://github.com/yashumani/drill-down-anamoly/actions/runs/38665457275 : all eight jobs passed. Studio JavaScript https://github.com/yashumani/drill-down-anamoly/actions/runs/38665457371 passed. |

The supported platform/version claim is limited to verified matrix/local combinations; macOS, actual KNIME and other Python releases are not claimed compatible. Prior existing-app and invalid-workflow failures are preserved in history, not suppressed.

## Current artifact identities

Local artifacts are development builds; no registry upload or name reservation is claimed.

- `python/dist/multi_tier_reporting_assurance-0.1.0a1-py3-none-any.whl`: SHA-256 `6a608753b1ceeb05f0c40e799f39685085b80e365e599c85d287ded273b99961`.
- `python/dist/multi_tier_reporting_assurance-0.1.0a1.tar.gz`: SHA-256 `fd96d6bcdb7a1893c1ddfa073b8158693367c8b44c21fc0f99d6501a09792d47`.

## Remaining work and boundaries

Actual Studio browser/visual/download verification is blocked by the provided computer-use runtime's missing Windows platform-directory error (0x80070003); no alternative automation bypass was used. Actual KNIME validation requires its environment. Optional AI explanation, authenticated approval integration and broader Tier 2 methods are not implemented. The original browser app is not yet integrated with the authoritative Python executor. The moderate ECharts advisory requires a major migration; low SDK/KaTeX findings require upstream or separately verified compatibility work. The SDK dependency graph is large and remains isolated from the dependency-free Python runtime.

The synthetic source-line controls cover January only. Fixtures do not certify a real source population, business policy, permission system or full transaction history. The corrected margin example is revenue 100+900 and cost 80+450: aggregate margin 47%, segment margins 20% and 50%, unweighted mean 35%.
