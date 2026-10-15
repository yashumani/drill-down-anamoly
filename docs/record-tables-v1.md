# Record tables contract v1.0

The public Python boundary is **record tables in, record tables out**. It does not depend on pandas, Polars, Arrow, KNIME, a UI, server or model. Dedicated KNIME integration and node execution are deferred by scope; they are not release blockers. A caller may use the module inside its own Python workflow and choose its own table containers.

Existing `evaluate()` and `analyze()` results are unchanged. `report_to_record_tables()` is an additive formatter for their verified results. `normalize_records()` is an explicit input adapter, not a replacement for required/type/business rules. See the complete runnable fictional example in [`python/examples/run_tables.py`](../python/examples/run_tables.py).

## Input boundary

Provide a list or tuple of plain dictionaries with string column names. Cells must be native `str`, `int`, `bool`, finite `Decimal`, `date`, `datetime`, or `None`, within the existing documented bounds. IDs retain leading zeros, `None` means null, and `""` remains an empty string. Record input does not interpret a CSV null token. Floating-point values, framework scalars and nested cells are rejected rather than silently rounded or stringified.

```python
from reporting_assurance import normalize_records, evaluate, report_to_record_tables

rows = normalize_records(
    [{"id": "001", "amount": "9007199254740993.00010"},
     {"id": "002", "amount": "0.00000"}],
    types={"id": "string", "amount": "decimal"},
)
# config is the caller's existing validated rule bundle; references are native records too.
report = evaluate(rows, config, evaluation_time="2026-04-05T12:00:00Z")
tables = report_to_record_tables(report, report_id="report-2026-03-run-001")
assert tables["summary"][0]["gate"] == "non_gating"
```

`normalize_records(records, *, types)` copies records and converts only explicitly declared decimal, integer and lowercase `true`/`false` boolean text. It uses the same literal conventions as the CSV adapter: decimal text is plain, without exponent notation or leading-zero integer parts. Invalid typed text stays text for the engine's `types` rule to fail. Native exact scalars remain unchanged. It never converts a number to an identifier string, fills a missing field, treats empty text as null, guesses a date, or repairs a float. Oversized numeric conversions still fail the scalar boundary. A `types` rule is required if the workflow needs invalid/null/type results; normalization does not certify values.

Date and timestamp text stays text, preserving key representation and offset intent; the engine validates it with declared rules. Use strict ISO dates and timestamps with an explicit offset and at most microsecond precision. Native `date` and date text remain distinct keys. A dataframe's timezone, missing-cell and high-resolution timestamp policies belong to the caller. Precision already lost upstream cannot be recovered by this adapter.

## Output API and joins

```python
from reporting_assurance import RECORD_TABLE_COLUMNS, report_to_record_tables

tables = report_to_record_tables(report, report_id="report-2026-03-run-001")
# If the source report already contains requested diagnostics, exposure still needs opt-in:
with_indices = report_to_record_tables(report, report_id="report-2026-03-run-001",
                                      include_diagnostics=True)
```

The result is a dictionary containing all seven table names below. Each value is a list of plain dictionaries. Every row has every versioned column in the documented order. Every cell is `str`, `int`, `bool`, or `None`: no dictionaries, lists, JSON-in-a-cell, floats or framework objects. Empty tables are `[]`; use `RECORD_TABLE_COLUMNS[name]` to retain their columns in a dataframe. The read-only columns mapping contains tuples. The packaged structural schema is [`record-tables-v1.json`](../python/src/reporting_assurance/schemas/record-tables-v1.json); `RECORD_TABLE_VERSION` and `summary.table_version` are `"1.0"`.

The caller must supply an opaque `report_id`, 1–128 characters, starting with a letter/digit and then letters/digits/`_ . : -`. Make it unique across combined outputs. It is a join key, not a dataset fingerprint or authentication claim. Rule and analysis identifiers are copied from the verified report. Group indices identify groups only within `(report_id, analysis_id)`; they do not expose source group labels or provide a join back to input rows.

| Table | Row key | Meaning |
| --- | --- | --- |
| `summary` | `report_id` | Exactly one row; original mode, gate, trust flag, evaluation time, sizes, four explicit outcome counts and analysis count |
| `checks` | `report_id, check_id` | One row per check, even when unavailable/error or its count dictionary is empty |
| `check_counts` | `report_id, check_id, count_name` | One integer per named count; missing counts produce no fabricated zero rows |
| `check_diagnostics` | `report_id, check_id, diagnostic_index` | Opt-in sample ordinal and original zero-based row index; no cell values |
| `analyses` | `report_id, analysis_id` | One row per Tier 2 analysis, including skipped analyses with zero groups |
| `analysis_groups` | `report_id, analysis_id, group_index` | Wide scalar group results; unused or unavailable fields are `None` |
| `limitations` | `report_id, scope, limitation_index` | Original ordered limitation codes, separately scoped to `tier1` or `tier2` |

Logical column schemas:

- `summary`: `report_id`, `table_version`, `report_version`, `engine_version`, `mode`, `bundle_digest`, `approval_valid_in_caller_trust` (bool), `gate`, `gate_reason`, `evaluation_time` (nullable ISO timestamp), `row_count`, `rule_count`, `pass_count`, `fail_count`, `not_evaluated_count`, `error_count`, `analysis_count` (integer counts).
- `checks`: `report_id`, `check_id`, `operator`, `outcome`, `reason`, `severity`, `required`, `blocking`, `diagnostics_available`, `diagnostics_included` (the last four are bool), `diagnostic_row_count` (nullable integer), `diagnostics_truncated` (nullable bool). Absent diagnostics have `available=False` and null count/truncation; present-but-empty diagnostics have count 0 and the original truncation flag. Excluded indices remain absent from `check_diagnostics`.
- `check_counts`: `report_id`, `check_id`, `count_name`, `count` (nonnegative integer).
- `check_diagnostics`: `report_id`, `check_id`, `diagnostic_index`, `row_index` (zero-based integers). Truncation stays on the parent check row, including when no indices are exported.
- `analyses`: `report_id`, `analysis_id`, `operator`, `outcome`, `reason`, `group_count` (integer), `mismatched_groups` (nullable integer). Missing mismatch evidence remains null, not zero.
- `analysis_groups`: `report_id`, `analysis_id`, `group_index` (integer), `count` (nullable integer), then nullable exact decimal strings `total`, `mean`, `minimum`, `maximum`, `population_stddev`, `numerator`, `denominator`, `ratio`, `actual`, `baseline`, `delta`, `relative_delta`; then nullable code strings `relative_outcome`, `relative_reason`; nullable decimal string `value`; nullable ISO date `selected_period`.
- `limitations`: `report_id`, `scope`, `limitation_index` (integer), `code` (string).

The formatter supports the existing v1 Tier 1 report and v1 Tier 2 wrapper only. For an explanation wrapper, the caller can explicitly select its `deterministic` member; no explanation/provider text is flattened. Unknown versions, extra/nested fields, duplicate identifiers, inconsistent outcome counts and unsupported numeric shapes are rejected with safe `ConfigError` codes. Validation is bounded to the existing 128 checks, 32 analyses × 1,000 groups, and 20 diagnostic indices/check. This is formatting/shape validation, not source truth, report authenticity, re-evaluation, approval or authentication. Use results from the authoritative engine.

Gate, severity and outcome remain separate. Read the original overall gate from `summary`; never infer a passing gate from an average score, a successful analysis or the existence of rows. A skipped analysis remains `not_evaluated` in `analyses` with no invented group. For zero baseline, absolute delta can be present while `relative_delta=None` and `relative_outcome="not_evaluated"`. Decimal strings are copied verbatim from the verified result. No units, currencies, group labels or business boundaries are invented. An explicit call to `analyze()` already requests aggregate numeric evidence; flattening it does not remove those values.

## Optional caller-side dataframes

The package never imports these frameworks or invokes their conversion methods. Require unique, nonempty string columns before record export: dictionaries cannot represent duplicate columns after a dataframe exporter has discarded them. Put any required business/index key in an explicit column; record export does not automatically preserve a dataframe index. Diagnostic `row_index` means zero-based input record position, not a dataframe index label. Ensure source IDs and decimal measures were preserved as strings or exact scalars before export. Do not use `astype(str)` or `Decimal(float_value)` to conceal precision already lost in a binary floating-point column. Framework missing sentinels and timestamp scalars must be mapped explicitly by the workflow owner.

For a caller-owned pandas dataframe with scalar cells, this example explicitly chooses pandas's missing-cell policy; all other floats still fail normalization:

```python
import pandas as pd  # caller dependency, not installed or required by reporting_assurance
from reporting_assurance import normalize_records, RECORD_TABLE_COLUMNS

if not input_frame.columns.is_unique or any(type(key) is not str or not key
                                             for key in input_frame.columns):
    raise ValueError("Require unique, nonempty string input columns")
source = input_frame.to_dict(orient="records")
records = [{key: None if pd.isna(value) else value for key, value in row.items()}
           for row in source]
rows = normalize_records(records, types={"id": "string", "amount": "decimal"})
# After evaluate/analyze and report_to_record_tables:
output_frames = {
    name: pd.DataFrame(records, columns=RECORD_TABLE_COLUMNS[name], dtype=object)
    for name, records in tables.items()
}
```

`dtype=object` keeps the returned Python scalars, decimal strings and `None` cells without inferring a float column, and explicit columns preserve empty tables. A caller can intentionally assign nullable integer/boolean dataframe dtypes later. See [pandas record export](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.to_dict.html) and [constructor dtype](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.html).

For a caller-owned Polars dataframe whose values are already supported native scalars/text, `normalize_records(input_frame.to_dicts(), types=...)` is the same framework-neutral path. Follow the official [Polars `to_dicts()` precision warning](https://docs.pola.rs/api/python/stable/reference/dataframe/api/polars.DataFrame.to_dicts.html): Python temporal export can truncate nanoseconds to microseconds. Preserve canonical timestamp text upstream or make an explicit precision policy before export. This contract does not claim nanosecond or universal dataframe compatibility.

Dedicated KNIME adapters, node wiring, flow variables and execution are deferred. These examples describe ordinary caller-owned Python table conversion and make no KNIME validation claim.
