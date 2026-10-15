# Offline Windows handoff

Unzip the pack into a local work folder. No installation, network, secret, API key or third-party Python library is required for the fixture tools. These commands require an available Python 3 interpreter; `python` may be replaced with the local interpreter command.

- Verify an extracted pack: `python verify_fixture_arithmetic.py`
- Rebuild fixture data in a new or empty directory: `python generate_synthetic_fixtures.py --output C:\work\mtra-fixtures`
- Verify the rebuilt data: `python C:\work\mtra-fixtures\verify_fixture_arithmetic.py`

The generator refuses to overwrite a nonempty directory. It reproduces data CSVs, catalogs, context, fault manifest, oracle, README and verifier. The broader research blueprint, this handoff note, the generator itself and packaging checksum files are distribution materials, not regenerated data. The verifier writes its receipt after checking the data. This is artifact tooling, not the planned validator or repository implementation.

If download is unavailable, transferring the single plain-text `generate_synthetic_fixtures.py` is enough to recreate the dataset and its verification instructions. The generator contains only standard-library code and literal synthetic specifications. It does not infer data from real reports.

## Plain generation specification

All domains use 2026-01, 2026-02 and 2026-03. Two groups contain two records each every month. Transaction identifiers are `<first-three-domain-letters>-<month-two-digits>-<ordinal-three-digits>`. Event days are 05, 06, 07 and 08. Every Actual row is USD, amount scale 1, snapshot s1, loaded_at 2026-04-04T12:00:00Z. Injected run clock is 2026-04-05T12:00:00Z.

January record vectors, in group order:

- Telecom: (service_revenue, line_months, disconnects) = (40,1,0), (60,1,0), (300,3,1), (600,5,0); groups north/south
- Retail: (net_sales, cost_of_sales, units_sold) = (40,32,1), (60,48,1), (300,150,3), (600,300,6); groups east/west
- Manufacturing: (production_cost, units_started, good_units) = (40,50,45), (60,50,45), (300,400,360), (600,500,450); groups plant_a/plant_b
- SaaS: (recognized_revenue, paid_seat_months, support_tickets) = (40,1,2), (60,1,1), (300,3,2), (600,5,3); groups small/large

Multiply financial amounts only by month ordinal 1, 2 or 3; retail cost_of_sales also scales. Operational counts/exposures stay unchanged. Group each pair; add company parent from the two groups. Ratios use summed numerator/denominator, with retail numerator net_sales minus cost_of_sales. Keep six decimals. Primary company financial Plan is 1100 times month ordinal, snapshot p1. Company controls are independently declared January constants (1000,10,1), (1000,530,11), (1000,1000,900), (1000,10,8), scaled using the same explicit financial-only policy. January line controls pin primary amounts 40,60,300,600. Coverage roster lists two groups for each month explicitly.

Separate SaaS ARR balances are January 100, February 120, March 140; quarter-end is 140. Their unit is annualized USD run rate, not recognized revenue. Calendar months are closed and complete. The fault manifest replaces one file per variant; `expected_findings.csv` documents each exact mutation and its evidence boundary.

Reproducibility was checked by regenerating into a fresh directory and byte-comparing all 57 generated files after the audit on the cloud host. Windows newline differences can change byte hashes without changing parsed records. No Windows execution is claimed until it is actually run there.
