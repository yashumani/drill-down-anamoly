# Multi-Tier Reporting Assurance — 0.1.0a1

An installable Python module for existing Python and KNIME reporting workflows. Tier 1 uses deterministic rules on reporting aggregates, grouped data or transaction detail. The package runs without Node, a server, UI, model or KNIME. It has no runtime dependencies.

This is a bounded alpha release. Existing browser-app behavior and its finance contract remain separate; the Python executor is the intended authoritative rule executor for future integration. Optional AI is unimplemented. An optional local Rule Studio provides draft authoring; its browser/visual verification remains blocked in this environment. See the current release evidence in `docs/reporting-assurance-release.md`.

## Install and run

From the repository root, with Python 3.9 or newer:

```sh
python -m pip install .
python -m reporting_assurance --rules python/examples/rules.json --csv python/examples/reporting.csv --reference controls=python/examples/controls.csv --evaluation-time 2026-04-05T12:00:00Z
```

Preview is always non-gating. To exercise the fictional approved example, supply its digest from `python/examples/trusted-digest.txt` as `--trusted-digest DIGEST --mode production`. Approval is valid only when its revision and content digest match AND the caller independently trusts that digest. A JSON flag is not authentication. The example approval has no authority over real reports. Never blindly trust a digest read from an untrusted bundle.

CLI output is JSON on stdout; exit codes are 0 for pass or preview, 1 for a failed gate, 2 for a blocked gate or invalid input. `--digest-only --rules PATH` prints the candidate content digest for the caller's approval process. Production does not sign, authenticate, or approve a bundle for you.

```python
from pathlib import Path
from reporting_assurance import load_bundle, read_csv, evaluate

config = load_bundle(Path('python/examples/rules.json').read_text(encoding='utf-8'))
types = {f: s['type'] for f, s in config['rules'][1]['params']['fields'].items()}
rows = read_csv('python/examples/reporting.csv', types=types)
controls = read_csv('python/examples/controls.csv', types={
    'period': 'date', 'scenario': 'string', 'currency': 'string', 'unit': 'string',
    'scale': 'string', 'snapshot': 'string', 'amount': 'decimal'})
report = evaluate(rows, config, references={'controls': controls},
                  evaluation_time='2026-04-05T12:00:00Z')
assert report['gate'] == 'non_gating'
```

Run `python python/examples/run_api.py` for the complete approved synthetic API example. A thin KNIME Python Script example is in `python/examples/knime_script.py`; actual KNIME compatibility is unverified unless stated in release evidence.

## Inputs, semantics and limits

The in-memory table is a list or tuple of plain dicts with string column names. Supported cells are None, str, int, bool, finite Decimal, date and aware datetime. Binary floats are rejected to prevent hidden precision loss. Decimal rules and tolerances use strings or integers in JSON; JSON fractional numbers are rejected. The API performs no numeric coercion. Dates are strict Gregorian `YYYY-MM-DD`; timestamps require `T`, seconds and an explicit UTC offset. No locale guessing or hidden clock reads occur. Use consistent key representations in primary and reference tables; a date object and a date string are distinct keys.

CSV preserves identifiers and leading zeros by default, converts only explicitly typed columns, leaves invalid typed cells as strings for validation, and preserves blank strings. Its default null token is literal `\N`. Set `null_token` explicitly for another source convention, including `null_token=""` for empty-string null. A column cannot represent the literal null token without a separate escaping convention; choose a token outside your data domain. Input files are local caller-selected paths. No URL or reference fetching occurs. Reference tables are provided by the caller; their independence and authority are caller responsibilities.

Hard limits: 1 MiB config, 128 rules, nesting 16, 100,000 config nodes, 100,000 primary rows, 256 columns, 2,000,000 present cells per table, 4,096 characters per scalar string, 100 decimal digits and exponent magnitude 100, 32 reference tables with 100,000 rows total, 50,000,000 present-cell/rule evaluations, 10,000 expected keys per rule, 64 MiB CSV. Diagnostics opt-in is limited to 20 zero-based row indices and never outputs cell values. Checks do not mutate inputs. These are local memory bounds, not streaming or distributed processing.

The structural JSON Schemas ship in `reporting_assurance/schemas/`. `validate_bundle` additionally enforces semantic constraints, literal numeric bounds, unique IDs, dependencies and cycle/resource limits. No executable expressions, SQL, imports, shell commands, URL fetching, or callbacks can be selected by the contract.

## Gate meaning

Every check has pass/fail/not_evaluated/error, independently of info/warning/critical severity. A blocking failure fails the gate. A required check that is unavailable or errors blocks a passing gate. An unavailable optional check does not block other required checks. At least one required check is necessary. Preview is non-gating; production also needs a valid caller-trusted approval. No average score overrides a blocker.

Reconciliation requires a selected nonoverlapping row level, all six declared semantic roles (period, scenario, currency, unit, scale, snapshot), compatible contexts and caller-supplied independent controls. Declare an explicit neutral value for a truly inapplicable role. A missing role produces not_evaluated. Flow sums and period-end balances are distinct; unsupported ratio sums and balance sums are rejected. Period-end reconciliation selects one latest record per declared group and compares its date to the control date; declare sufficiently fine groups for separate balance series and require coverage/uniqueness rules. No automatic FX or scale conversion is performed.

Matching internal or independent synthetic totals proves only the configured identity. It never proves source completeness or transaction accuracy from aggregates. Required scope, business limits, references and dependencies remain owner-declared. Observed values are facts about the supplied data, not valid business boundaries.

## Verify locally

```sh
PYTHONPATH=python/src python -m unittest discover -s python/tests -v
python -m build --outdir python/dist
python scripts/verify_python_wheel.py
```

PowerShell: set `$env:PYTHONPATH="$PWD/python/src"` before running tests from source. CI runs an isolated wheel install plus tests. Runtime compatibility is claimed only for the versions/platforms actually verified in release evidence, despite the package's minimum-version metadata. No registry publication is part of this release.

## Bounded Tier 2 and draft suggestions

`analyze(rows, bundle, spec, ...)` re-runs Tier 1 on those exact inputs. Version `1.0` analysis specs choose only `ratio_of_sums`, `variance`, `summary` or `period_end`, name Tier 1 prerequisites, and declare row level, six semantic fields, expected periods and grouping. Each analysis skips only when its own prerequisites or required evidence are unavailable. Tier 2 never overrides the Tier 1 gate. In production, the spec must also be embedded as the bundle's `analysis` field before approval; edits invalidate the same digest. The CLI runs it only with `--include-analysis`; exit status still represents the Tier 1 gate, and callers must inspect each Tier 2 outcome.

Ratios use declared numerator (one field, optionally minus one cost field) and denominator components, never an unweighted average of rates. Verification of a reported ratio requires one explicitly selected record per output group. Zero/missing denominators return not_evaluated; negative denominators need a future explicit domain policy. Variance uses declared Actual/Plan scenario and snapshot selections, a separate baseline measure, matching units and a caller-provided closed/complete calendar. A zero baseline preserves absolute delta while explicitly marking its relative delta unavailable. Grouped variance gives descriptive drill-down contributions; it does not establish causation. Period-end selects a unique latest record per group. Summary exposes population statistics, with no inferred anomaly thresholds.

Exact sums/subtractions use bounded Decimal precision sufficient for supported inputs. Ratios, means and standard deviations are descriptive numeric strings rounded to 34 significant digits, with the Decimal rounding mode set to half-even. Numeric Tier 2 evidence is explicit opt-in; group values are omitted and represented by deterministic group indices. Large grouped results are bounded to 1,000 groups. Default Tier 1 reports remain counts-only.

`suggest_rules(rows)` returns observed count metadata separately from a draft rule bundle. It proposes only presence/type review, with nullable=True and optional, nonblocking rules. It never converts observed categories, ranges or uniqueness into valid business boundaries or approved grain. There is no approval UI, authenticated approval service or AI explanation in this release. See `python/examples/run_analysis.py` for synthetic calculations and editable draft JSON export.

The independent four-sector acceptance adapter is `python/tests/fixture_adapter.py`. It maps catalog types and declared selections into the exact v1 JSON contract, preserves the pack's synthetic provenance, and replaces exactly one named file for each fault. The fixture explanatory statuses `unverified` and `skipped` map to `not_evaluated`, with distinct evidence/prerequisite reasons. Internal parent/child identities use `control_scope=internal`; separately supplied company and source-line controls use caller-declared `independent` scope. The engine does not authenticate that declaration.

The package layout and script entry point follow the [Python Packaging User Guide](https://packaging.python.org/en/latest/guides/writing-pyproject-toml/). The distribution name is provisional and no name reservation or registry publication is claimed.

## Optional local Rule Studio

```sh
reporting-assurance studio --port 0
```

Open the printed loopback URL. The Studio profiles counts, proposes editable nonblocking draft rules, previews through the same Python executor, and exports the exact validated JSON in the editor. It never approves a bundle or executes a production gate. Its server binds only 127.0.0.1, rejects foreign Host/Origin requests, uses no remote assets/models, and retains no saved table between requests. Temporary CSV adapter files are removed. The Studio caps CSV at 1 MiB and requests at 2 MiB; use the API/CLI for larger documented inputs. Core import and evaluation do not start or require the server.

Seven HTTP integration tests cover the profile → draft → preview → export-validation flow, API parity, exact bundle digest, declared date types, malformed requests and cross-origin rejection. Actual browser rendering, keyboard/mobile behavior and browser download completion remain unverified: this executor's computer-use runtime exits with a missing Windows platform-directory error. KNIME remains unverified; the known KNIME folder contains only a quickstart PDF, not a runnable installation.

## Reference CSV types

Reference schemas are independent of the primary table. Optional `reference_types` in the v1 bundle declares column types by reference name:

```json
"reference_types": {
  "plan": {"budget": "decimal", "period": "string"},
  "calendar": {"complete": "boolean", "period_state": "string", "period": "string"}
}
```

These declarations are included in the approved bundle digest. Editing them invalidates approval. Registered operations also require their native reference types: reconciliation control measures and variance baseline measures are decimals; calendar `complete` is boolean and `period_state` is string. Conflicting declarations are rejected. This is conversion prescribed by the contract's typed roles, not inference from observed data. Only literal CSV `true`/`false` convert to booleans; invalid or missing calendar/baseline values remain unavailable evidence. CLI and Studio share this adapter. In-memory API callers still supply native typed scalars.

Studio export captures one immutable editor snapshot before validation. The same text is sent for validation and downloaded after the response, even if editing continues. A changed editor is explicitly called out; the downloaded snapshot is never replaced with later unvalidated text. A delayed-response JavaScript unit test covers this race. It does not substitute for actual browser/visual verification.
