# Live Large Public Finance Dataset Demo

## Source

The application now includes a live demonstration backed by the City of Los Angeles Controller `LA_PROCUREMENT` dataset (`v5c4-aqci`). The source contains procurement payments for contract, blanket, and one-time purchase orders.

Official source links:

- Dataset page: `https://controllerdata.lacity.org/Purchasing/LA_PROCUREMENT/v5c4-aqci`
- API documentation: `https://dev.socrata.com/foundry/controllerdata.lacity.org/v5c4-aqci`
- Aggregate endpoint used by the app: `https://controllerdata.lacity.org/resource/v5c4-aqci.json`

## Validated scale

The deployment workflow executed a live public-data smoke test on 2026-08-16 and received:

- **3,843,032 live records**
- **61 source columns**
- **10 verified finance dimensions**
- A successful fiscal-month aggregate response

The smoke script is `scripts/live-public-smoke.mjs`. It validates the live row count, metadata schema, required dimension fields, and a monthly aggregation before the GitHub Pages production build. The step is non-blocking so a temporary third-party provider outage does not prevent deployment of the rest of the application.

## Finance dimensions

The live workspace models these ten public-source dimensions:

1. Department
2. Vendor
3. Government Activity
4. Fund Group
5. Fund Type
6. Fund
7. Account
8. Expenditure Type
9. Authority
10. Settlement / Judgment

## Large-data architecture

The browser does **not** download 3.84 million transaction rows. It sends SoQL aggregation queries to the public source and receives only small analytical result sets:

- Exact source and selected-scope row count
- Exact selected-scope payment total
- Minimum and maximum transaction dates
- Latest fiscal year
- Monthly payment totals and transaction counts
- Top-eight payment categories for each modeled dimension

This pattern demonstrates the production direction for enterprise data:

```text
React workspace
  -> governed query service / warehouse
  -> aggregate result contract
  -> time-series, concentration, materiality, and drill UI
```

The public demo calls Socrata directly because the data is public. Private enterprise deployments should route queries through a secured backend with authorization, row-level policy, caching, audit logs, workload controls, and warehouse pushdown.

## Interactive behavior

The new **Live public demo** workspace supports:

- All-record, latest-24-month, and latest-fiscal-year scopes
- Live monthly actual spend versus a six-period rolling benchmark
- Lower-is-better expense interpretation
- Materiality and robust anomaly flags
- Trailing-12-month spend and impact
- Top-category concentration for each of ten dimensions
- Focus drilling: selecting a category reruns the totals, monthly pulse, and all ten dimension aggregations for that live cohort
- Optional in-memory Socrata app token for better rate-limit reliability
- Query progress, retry, timeout, partial-dimension error handling, runtime, and request-count evidence

## Interpretation limits

- The source contains actual procurement payments but does not contain an approved budget or forecast measure. The live workspace therefore uses a rolling historical benchmark, not an official plan variance.
- The source documentation notes that some older payment history may be summarized.
- The dimension panels intentionally show the eight largest categories by total payment amount.
- The live workspace demonstrates scalable aggregation and exploration; it does not claim causal attribution.

## Validation and release

The production workflow now performs:

1. Unit and analytical regression tests
2. Live public-data smoke test
3. TypeScript and Vite production build
4. GitHub Pages artifact upload
5. GitHub Pages deployment

The release containing the live-data workspace passed all 14 regression tests, the public-data smoke test, the production build, and GitHub Pages deployment.
