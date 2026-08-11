# Prototype architecture

## Core idea

A drill node is a **cohort predicate set**, not a permanent hierarchy level. Selecting `region=West` causes the system to filter to West and then scan every remaining eligible dimension again.

## Static demo views included

1. **KPI strip** — row count, actual, expected, variance, anomaly score, dimensions scanned.
2. **Dynamic investigation tree** — visual history of the current predicates.
3. **All-dimension landscape** — ranked scores for up to 18 dimensions at once; the audit table contains all dimensions.
4. **Category contribution chart** — signed variance for top category values of a selected dimension.
5. **Cross-dimensional interactions** — top 2-way / 3-way segments discovered from leading dimensions.
6. **Dimension audit table** — exhaustive dimension evidence.
7. **Generated narrative** — deterministic summary suitable as a placeholder before adding an LLM/agent.

## Production path

Recommended API boundary:

```text
POST /api/investigations
POST /api/investigations/:id/drill
GET  /api/investigations/:id/dimensions
GET  /api/investigations/:id/interactions
GET  /api/investigations/:id/evidence
POST /api/investigations/:id/chat
```

The React client should pass `{metric, expectedMetric, predicates}` and receive already-scored dimension/category results. That lets the same UI work with SQL, BigQuery, Snowflake, Spark, pandas, or other analytical engines.

## Agent integration

Expose deterministic tools such as:

- `scan_all_dimensions(scope)`
- `get_dimension_breakdown(scope, dimension)`
- `find_interactions(scope, maxDepth)`
- `compare_parent_child(parentScope, childScope)`
- `get_supporting_rows(scope)`
- `get_metric_definition(metric)`

The agent should generate prose and recommended next actions from the verified tool output, rather than calculating financial/statistical results in free-form text.
