# Finance Data Contract v1

The dashboard accepts arbitrary CSV/JSON through automatic profiling, but **contract-compliant files are the preferred path** because they remove ambiguity and let the application populate Actual, Plan, time-series, KPI, driver, and FP&A-assumption views consistently.

## Recommended wide format

Use one metric per file and one row per reporting grain/dimension combination.

| Column | Requirement | Meaning |
|---|---|---|
| `period_date` | Required | ISO date such as `2025-03-31` |
| `actual_value` | Required | Observed Actual value |
| `plan_value` | Recommended | Budget or approved plan value |
| `budget_value` | Optional | Alternative approved budget field |
| `target_value` | Optional | Alternative target field |
| `forecast_value` | Optional | Latest forecast or outlook |
| `prior_year_value` | Optional | Prior-year comparable value |
| `dataset_name` | Optional | Friendly name for the uploaded dataset |
| `metric_id` | Recommended | Stable metric identifier; one distinct metric per file |
| `metric_name` | Recommended | Business-facing metric name |
| `metric_polarity` | Recommended | `higher_is_better` or `lower_is_better` |
| `aggregation_method` | Recommended | `sum`, `average`, or `period_end` |
| `planning_lens` | Optional | `revenue`, `opex`, `capex`, `marketing`, `corporate`, or `workforce` |
| `currency` | Optional | ISO currency such as `USD` |
| `metric_unit` | Optional | USD, units, FTE, hours, etc. |
| `fiscal_year_start_month` | Optional | Integer 1–12 |
| `source_system` | Optional | Originating ERP, planning, or warehouse system |
| `dim_<name>` | Recommended | Any number of business dimensions |

Examples of dimensions:

```text
dim_region
dim_business_unit
dim_product
dim_channel
dim_customer_segment
dim_cost_center
dim_department
dim_vendor
dim_project
dim_campaign
```

The importer removes the `dim_` prefix for display. For example, `dim_cost_center` becomes `Cost Center` in the dashboard.

## Automatic dashboard mapping

When the contract is detected, the importer maps fields as follows:

```text
period_date       → finance time field
actual_value      → Actual
plan/budget/target/forecast value → primary comparison
metric_polarity   → favorable/unfavorable direction
aggregation_method→ sum, average, or period-end behavior
planning_lens     → finance narrative and question set
fiscal_year_start_month → MTD/QTD/YTD fiscal calendar
dim_*             → eligible business-driver dimensions
```

The primary comparison priority is `plan_value`, `budget_value`, `target_value`, then `forecast_value`. Additional comparison fields remain available as supporting measures.

## Supported long format

The application also recognizes:

```text
period_date,scenario,value,metric_id,metric_name,dim_region,...
```

Supported scenario labels include:

```text
actual / actuals / reported / observed
plan / budget / target / expected
forecast / outlook / latest_estimate
prior_year / prior / py / last_year
```

Long-format rows are pivoted into the internal `actual`, `target`, `forecast`, and `prior_year` measures before analysis. Scenario rows are grouped by date, metric, and all `dim_*` fields.

## Current accuracy guardrails

- Contract v1 accepts **one metric per file**. Multi-metric files are rejected rather than silently summed across unlike units.
- A stable `metric_id` may coexist with one friendly `metric_name`; multiple names for the same ID are flagged for standardization.
- The detailed driver engine is strongest for additive metrics. Ratios should be supplied as governed numerator and denominator measures in a future semantic-contract version.
- `plan_value` is strongly recommended. When no comparison exists, the dashboard uses a clearly labeled rolling historical baseline rather than claiming an official plan variance.
- Date values should use ISO format to avoid locale ambiguity.
- Each row should represent a consistent business grain.
- Long-format files should use one primary Plan/Budget/Target scenario. When several comparison scenarios exist, the highest-priority one is used and the others remain supporting measures.

A downloadable CSV example is available from the live Executive Overview and Method & Source pages.
