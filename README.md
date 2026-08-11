# Drill-down Anomaly Lab

An interactive research application for **data-quality-aware, all-dimension anomaly investigation**. Every drill creates a cohort, then the engine rescans the remaining quality-approved dimensions, ranks category contributions, searches supported cross-dimensional patterns, and keeps the dashboard and conversational analyst in the same state.

Live demo: `https://yashumani.github.io/drill-down-anamoly/`

## Main workspaces

### Insights

- Actual versus Target/Expected analysis.
- Robust median fallback when a target is unavailable.
- All-dimension factor ranking after every drill.
- Signed category contribution bars.
- Supported two- and three-factor interaction search.
- Business-semantic hierarchy navigation.
- Conversational analytics that can change dashboard scope.
- Bring-your-own OpenAI-compatible LLM endpoint.
- Public-news context for direct company and competitor/market signals.

### Data Quality Explorer

- Overall quality score and analysis-readiness gate.
- Completeness, uniqueness, validity, conformity, consistency, integrity, distribution, privacy, and readiness checks.
- Explicit placeholders for accuracy, drift, timeliness, lineage, reference integrity, and other checks that require rules, baselines, or trusted reference data.
- Per-column type, role, missingness, cardinality, uniqueness, top values, quartiles, outliers, date coverage, text variants, and issues.
- Exact duplicate, ragged-row, empty-row, mixed-type, whitespace/case variant, invalid-date, future-date, constant/near-constant, high-cardinality, identifier, and PII-like field detection.
- Numeric correlations, candidate functional dependencies/hierarchies, and co-missingness patterns.
- Searchable raw-data preview and downloadable JSON quality report.
- Clean and intentionally messy demo datasets.

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

The browser prototype accepts tabular CSV and JSON:

- CSV requires a header row.
- JSON can be an array of objects or `{ "data": [...] }`.
- Nested JSON objects are flattened to shallow dot-path columns.
- The public browser demo limits uploads to 25 MB and 100,000 rows.
- Leading-zero and very long digit identifiers are preserved as strings.

For anomaly investigation, the quality profiler should find:

1. At least one reliable numeric measure.
2. Optionally a second numeric Target, Forecast, or Expected measure.
3. At least two quality-approved categorical, date, or boolean dimensions.

## Analytical model

For the selected cohort:

1. Invalid Actual/Expected rows are excluded and counted—not silently converted to zero.
2. Row residual is `Actual - Expected`; without Expected, the exploratory fallback is `Actual - cohort median`.
3. Every remaining eligible dimension is grouped independently.
4. Driver scoring combines grouped impact, distinctiveness, concentration, minimum support, and a cardinality penalty.
5. Categories are ranked by signed variance while preserving support and per-row movement.
6. Supported category candidates form pruned two- and three-dimensional interaction segments.
7. Every click or chat drill updates the cohort and repeats the full scan.

This is association and attribution, not proof of causation. External news and analyst notes are treated as hypotheses to validate against time, geography, product, channel, and unaffected comparison groups.

## Security and privacy boundary

- Uploaded data remains in the current browser session.
- The default deterministic chat does not call an external service.
- A user-provided LLM receives aggregated analytical and quality evidence, not the full raw dataset.
- API keys are kept only in page memory and are not persisted.
- External text is treated as untrusted context in the LLM instruction.
- Production deployments should proxy LLM and news providers through a secured backend with authentication, tenant isolation, DLP, audit logging, and secret management.

## Important limitations

- The robust median fallback is not a seasonal or predictive anomaly model.
- Metric polarity is not yet governed; real metrics need higher-is-better/lower-is-better metadata.
- Additive attribution assumes Actual and Target exist at compatible grain.
- Ratios and rates need numerator/denominator-aware attribution.
- Accuracy and referential integrity require trusted reference data.
- Drift and volume incidents require stored historical profiles.
- Browser-side combinatorial search is not suitable for warehouse-scale data.
- The repository still needs a committed package lock and automated unit/end-to-end tests.

## Project structure

```text
src/
  App.tsx                       # workspace state and integration
  components/
    ChatPanel.tsx               # deterministic + optional LLM analytics
    DataQualityPanel.tsx        # complete quality exploration workspace
    EChart.tsx                  # ECharts lifecycle wrapper
    NewsIntelPanel.tsx          # active/passive external-news context
    ThemePicker.tsx             # user palette selection
    Visuals.tsx                 # contribution, driver, tree, interaction visuals
  data/
    demoNews.ts                 # safe no-network news/context demo
    qualityDemo.ts              # intentionally imperfect quality demo
    sampleData.ts               # coherent 20+ dimension analytical demo
    semanticModel.ts            # labels, synonyms, and valid hierarchy links
  lib/
    anomaly.ts                  # quality-aware variance/anomaly engine
    chatEngine.ts               # deterministic intents and explanations
    dataQuality.ts              # dataset and column quality profiler
    io.ts                       # hardened CSV/JSON ingestion
    llm.ts                      # BYO-LLM client and grounded context
    newsIntel.ts                # public-news provider normalization
    profile.ts                  # lightweight schema inference
  data-quality.css              # quality workspace styling
  demo.css                      # demo helpers
  styles.css / ux.css           # dashboard and palettes
```

## Review documentation

- `docs/deep-code-review-data-quality.md` — full review, resolved findings, remaining risks, and comprehensive quality framework.
- `docs/all-dimension-investigation-tree.md` — investigation-tree design.
- `docs/prototype-architecture.md` — implementation architecture.
