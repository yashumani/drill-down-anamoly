# Drill-down Anomaly Lab

A research prototype for **all-dimension anomaly investigation**. The app treats every drill as a cohort filter, then re-scores every remaining eligible dimension and searches for cross-dimensional interactions. The tree is the investigation history — not a fixed hierarchy.

## What it demonstrates

- Works with tabular **CSV or JSON** datasets.
- Profiles fields and automatically classifies numeric measures, categorical dimensions, dates, booleans, and high-cardinality identifiers.
- Lets the user choose an **Actual** numeric measure and an optional **Expected / Target** measure.
- If no target exists, uses the current cohort mean as a basic baseline for exploratory anomaly detection.
- Re-evaluates every eligible dimension after every drill.
- Shows an all-dimension driver landscape, category contribution bars, dynamic drill path, interaction segments, KPI cards, and an exhaustive audit table.
- Includes deterministic synthetic sample data with **26 categorical dimensions** plus date, identifier, and numeric measures.
- Injects known anomalies such as `West + Store + Device`, `Promo B + 0-3m tenure`, and `Backorder + Device`, plus favorable patterns for validation.

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Supported data contract

The prototype is intentionally schema-agnostic for **tabular data**. It cannot meaningfully analyze literally every possible data type. For a useful RCA/anomaly result, provide:

1. At least one numeric measure (`actual`).
2. Optionally another numeric measure (`target`, `forecast`, or expected value).
3. Two or more categorical/date/boolean columns that can serve as dimensions.

CSV must have a header row. JSON can be either an array of objects or `{ "data": [...] }`.

## Analytical model

For the selected cohort:

1. Calculate row residual = `actual - expected` (or `actual - cohortMean` without a target).
2. Group every eligible dimension independently.
3. Score dimensions using impact, residual surprise, concentration of variance, and support.
4. Rank category values by absolute variance contribution.
5. Build top 2-way and 3-way interactions from leading dimensions/categories with support pruning.
6. Clicking any category/intersection creates a new cohort and repeats the complete scan.

This is a client-side research implementation. For large enterprise data, keep the React API contract but move group-bys, statistical scoring, interaction search, authorization, and row-level evidence to the backend.

## Important limitations

- Current scoring is an interpretable research heuristic, not a causal model.
- Client-side interaction search is intentionally pruned and should not be used on millions of rows.
- Exact additive variance attribution assumes Actual and Target exist at compatible grain.
- Rates/ratios need numerator/denominator-aware attribution before production use.
- A negative variance is displayed as unfavorable in the demo; real implementations need metric polarity metadata because lower can be better for cost/error metrics.

## Project structure

```text
src/
  App.tsx                 # investigation UI + state
  components/
    EChart.tsx            # reusable ECharts wrapper
    Visuals.tsx           # tree, all-dimension bars, contribution, interactions
  data/
    sampleData.ts         # 26-dimension deterministic demo dataset
  lib/
    anomaly.ts            # generic analytical engine
    io.ts                 # CSV / JSON parser
    profile.ts            # schema inference
  types.ts                # shared contracts
```

See `docs/all-dimension-investigation-tree.md` for the design research and `docs/prototype-architecture.md` for implementation notes.
