# Finance Data Contract v1

The dashboard accepts arbitrary CSV/JSON through automatic profiling, but **contract-compliant files are the preferred path** because they remove ambiguity and let the application populate Actual, Plan, time-series, KPI, and driver views consistently.

## Recommended wide format

Use one metric per file and one row per reporting grain/dimension combination.

| Column | Requirement | Meaning |
|---|---|---|
| `period_date` | Required | ISO date such as `2025-03-31` |
| `actual_value` | Required | Observed Actual value |
| `plan_value` | Recommended | Budget or approved plan value |
| `forecast_value` | Optional | Latest forecast or outlook |
| `prior_year_value` | Optional | Prior-year comparable value |
| `metric_name` | Recommended | Business metric name; one distinct metric per file |
| `metric_polarity` | Recommended | `higher_is_better` or `lower_is_better` |
| `aggregation_method` | Recommended | `sum`, `average`, or `period_end` |
| `currency` | Optional | ISO currency such as `USD` |
| `metric_unit` | Optional | USD, units, FTE, hours, etc. |
| `fiscal_year_start_month` | Optional | Integer 1–12 |
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

## Supported long format

The application also recognizes:

```text
period_date,scenario,value,metric_name,dim_region,...
```

Supported scenario labels include:

```text
actual / actuals / reported / observed
plan / budget / target / expected
forecast / outlook / latest_estimate
prior_year / prior / py / last_year
```

Long-format rows are pivoted into the internal `actual`, `target`, `forecast`, and `prior_year` measures before analysis.

## Current accuracy guardrails

- Contract v1 accepts **one metric per file**. Multi-metric files are rejected rather than silently summed across unlike units.
- The detailed driver engine is strongest for additive metrics. Ratios should be supplied as governed numerator and denominator measures in a future semantic-contract version.
- `plan_value` is strongly recommended. When it is absent, the dashboard uses a clearly labeled rolling historical baseline rather than claiming an official plan variance.
- Date values should use ISO format to avoid locale ambiguity.
- Each row should represent a consistent business grain.

A downloadable CSV example is available from the live Executive Overview and Method & Source pages.
