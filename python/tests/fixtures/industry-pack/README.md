# Multi-Tier Reporting Assurance: synthetic test-data pack

This is a standalone, entirely fictional data artifact for designing and testing reporting validation. It is not a software implementation, an approved production contract, or a description of any real company's internal operations. All values and identifiers are invented. Public reporting concepts inform the domain labels only; no real financial numbers, customers or transactions are included.

## Start here

1. Open `metric_catalog.csv`, `table_schema_catalog.json` and `run_context.json` before interpreting numbers
2. Start with one industry's `clean/.../reporting_aggregates.csv`; use `row_level=company` for company reports and `row_level=group` for group reports, never sum both
3. Add `grouped_data.csv`, `transaction_detail.csv`, `company_controls.csv` and `coverage_roster.csv` when testing cross-level evidence and coverage
4. Choose exactly one variant in `variant_manifest.json`. Resolve all files from the clean pack, replacing only its named `replaces` file with its `replacement_source`; do not concatenate the replacement with the original and do not combine variants unless deliberately designing a new case
5. Compare candidate validator results to `expected_findings.csv` or the equivalent JSON. These hand-authored outcomes are an oracle for minimum findings, not output produced by a validation engine. Cascading failures may add findings; do not assert an exact total finding count from this oracle
6. Optionally run `python verify_fixture_arithmetic.py` from this folder or by absolute path. It uses only the Python standard library and refreshes `validation_receipt.json`

The verification script audits fixture arithmetic and pins the intentional mutations. It does not implement the planned reporting-assurance package, assert its CLI exists, or establish KNIME compatibility. The separate generation script is not needed to use this pack.

## Contents and size

Four industries, January–March 2026, with three clearly named data levels per industry:

- Transaction detail: 12 rows, at transaction/recognition-line/production-batch grain
- Grouped data: 6 rows, two groups per month
- Reporting aggregates: 9 rows, two groups and one company parent per month
- Separate Plan baselines: 3 rows per industry, one company metric, snapshot p1
- Company controls: 9 rows per industry, each metric separately
- Explicit group-coverage rosters: 6 rows per industry; do not infer coverage from the observed data
- Source-line controls: four January financial-amount controls per industry, intentionally narrower than all transaction history
- SaaS-only monthly ARR balances and quarter-end ARR: separate point-in-time examples, not revenue records
- Fifteen isolated faulty/incomplete variants, with an explanatory expected-results oracle

There are 48 transaction-detail, 24 grouped-data and 36 reporting-aggregate rows in the clean pack. It is a complete three-month toy population, not a sample purporting to represent real operational distributions. Larger twelve-month or stress datasets can follow after the small fixture contract is reviewed.

## Domains and intentional simplifications

| Domain | Group grain | Financial flow | Operational components | Derived reporting metric |
| --- | --- | --- | --- | --- |
| Telecom | Service region/month | Service revenue | Line-month exposure, disconnects | Disconnects / line-months |
| Retail | Store region/month | Net sales, cost of sales | Units sold | (Net sales − cost of sales) / net sales |
| Manufacturing | Plant/month | Production cost | Started and good units | Good / started units |
| SaaS | Customer segment/month | Recognized revenue | Paid seat-months, support tickets | Recognized revenue / seat-months |

The telecom rate is a toy exposure-based rate, not an assertion of a particular issuer's churn convention. Retail net sales are already net of returns; no return allocation or tax policy is modeled. All production batches are complete, with no WIP or rework loop, and the fixture does not equate factory production, shipments and dealer retail sales. SaaS recognition lines are neither cash receipts, billings, contracted obligations nor ARR. Monthly ARR is a deliberately separate annualized stock, with no invented identity connecting it to recognition-line revenue. No domain fixture is intended to reproduce public-company accounting policies.

## Exact arithmetic anchors

Amounts are USD units, not thousands. Month m means January=1, February=2, March=3.

- Every domain's primary financial flow totals 1,000 × m; first group is 100 × m, second is 900 × m
- Retail cost of sales totals 530 × m; company gross profit is 470 × m and margin is 0.47. Group margins are 0.20 and 0.50; their unweighted mean 0.35 is wrong
- Telecom has 10 line-months and 1 disconnect monthly; group rates are 0 and 0.125; company rate is 0.10
- Manufacturing has 1,000 started and 900 good units monthly, yield 0.90
- SaaS has 10 seat-months and 8 support tickets monthly; revenue per seat-month is 100 × m
- Plan primary financial flow is 1,100 × m, so Actual minus Plan is −100 × m only for compatible, complete periods
- Across the complete quarter, primary Actual financial flows total 6,000 versus Plan 6,600, variance −600; retail quarter sales 6,000 minus costs 3,180 gives profit 2,820 and margin 47%
- SaaS month-end ARR is 100, 120 and 140; quarter-end ARR is 140, never the sum 360

These expectations were set separately from any future engine under test. Toy controls are explicitly synthetic and are not real audited evidence. Line-level controls cover January only; February/March transaction authenticity or completeness cannot be proved from those controls. Aggregate reconciliation proves only the supplied identities and scope.

## Contract choices

CSV is UTF-8 with a header, comma delimiter, standard CSV quoting, decimal point `.` and empty-string null. Preserve identifiers as strings. Dates are ISO Gregorian, months `YYYY-MM`, timestamps explicit UTC `Z`. No guessed numeric/date normalization. All money uses Decimal arithmetic; amount comparisons are exact here. Ratios are stored to six decimal places with absolute tolerance 0.000001. Blank denominator means unverified computation; zero denominator must also return null/unverified rather than zero or infinity. No zero-denominator fault is included in this first pack.

- Actual snapshot s1 and Plan snapshot p1 are selected explicitly; scenarios and snapshots are never additive
- Reporting levels overlap; only disjoint children may be summed to a parent
- Money flows and disjoint period exposures can sum over complete nonoverlapping months. Exposure sums are not distinct customer counts
- ARR is a point-in-time annualized stock; select the last approved period-end for quarter-end reporting
- No FX conversion is authorized or supplied. A currency mismatch prevents like-for-like reconciliation
- The injected run clock is April 5, 2026 at 12:00 UTC. Freshness is based on extract `loaded_at`, not historical event dates. Maximum age is 48 hours and future tolerance is zero
- The calendar is Gregorian and all clean months are closed. It is not a retail 4-4-5 or issuer-specific fiscal calendar
- The coverage roster is a declared small population; missing rows are distinct from zero

`expected_findings` uses pass/fail/unverified/skipped to describe the intended check outcome. Draft fixture rules do not authorize a production pass; a production gate remains `not_evaluated` until the real owner's contract and approval process exist. V12's skipped comparison names incomplete-period prerequisites; V10's missing baseline is unverified, not a fabricated zero. V15 has both a structural failure and unavailable ratio evidence.

## What the fault cases teach

V01 overlapping subtotal double-count; V02 offsetting coverage/duplicate-key error invisible at company total; V03 unweighted margin; V04 mixed currency; V05 mixed scale; V06 missing group; V07 impossible date; V08 one stale partition hidden by fresh rows; V09 future timestamp; V10 missing Plan; V11 unselected snapshot; V12 incomplete period; V13 stock incorrectly summed over time; V14 offsetting transaction errors invisible at grouped/company totals; V15 missing denominator.

V11 tests selection rather than lawful restatement reconciliation: there is no approved restatement history or change control in this pack. No claim is made that all planned validator operators or production edge cases are covered. Empty tables, hostile text, schema omissions, tolerance boundaries, zero denominator and larger histories remain explicit future extensions.

## Files and provenance

- `domain_catalog.json`: compact generating assumptions and domain measure sets
- `metric_catalog.csv`: units, additivity, ratio components and stock/flow semantics
- `table_schema_catalog.json`: each clean domain table's grain, column types and nullability
- `references/calendar.csv`: expected periods and close/completeness state
- `run_context.json`: injected clock, scenario/version selection and illustrative tolerances
- `expected_findings.csv` / `.json`: independently authored expected fault explanations
- `variant_manifest.json`: deterministic replacement instructions
- `provenance.json`: synthetic origin and non-representativeness boundaries
- `validation_receipt.json`: reproducible arithmetic verification details
- `checksums.sha256`: content integrity list at packaging time; this does not establish truth or external provenance

Public source links and the broader industry taxonomy are supplied in the accompanying Multi-Industry Data Blueprint. This pack does not depend on a network call and never fetches a reference from an external URL.
