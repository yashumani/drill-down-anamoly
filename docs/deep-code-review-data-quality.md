# Deep Code Review and Data Quality Architecture

## Executive assessment

The repository has evolved from a static anomaly-visualization prototype into a useful browser-based investigation demonstrator. Its strongest design decision is still valid: every drill creates a cohort, and all remaining eligible dimensions are rescored. The application also now distinguishes internal data evidence from external-news hypotheses and supports a user-provided LLM endpoint.

Before this review, however, several implementation details could materially distort an analysis. The most important were silent conversion of invalid measures to zero, a no-target baseline that mathematically forced total variance and anomaly score to zero, inconsistent null drill behavior, field profiling based only on the first row, and the absence of a quality gate before anomaly ranking.

This review corrected those defects and introduced a full Data Quality Explorer. The production boundary remains clear: this GitHub Pages version is an interactive research/demo application. Enterprise-scale profiling, governed rules, secrets, row-level security, reference-data validation, historical drift, and large-data computation belong in backend services.

## Review scope

The review covered:

- CSV and JSON ingestion
- schema and type inference
- data-quality profiling and analytical eligibility
- anomaly/variance calculation
- dimension and category scoring
- multidimensional interaction search
- semantic hierarchy metadata
- conversational analytics
- bring-your-own LLM integration
- external public-news integration
- React state and user flow
- chart rendering and accessibility
- GitHub Pages build and deployment
- testability, maintainability, security, and production scalability

## Findings by severity

### Critical findings corrected

#### Invalid and missing measures were converted to zero

The original numeric helper returned `0` whenever a value was missing or not numeric. That changed business totals, category contributions, anomaly scores, and interaction rankings without warning.

**Correction:** rows with invalid Actual or Expected values are now excluded from the calculation and counted explicitly. The result contract reports valid rows, excluded rows, and warnings.

#### The no-target baseline forced the overall anomaly to zero

The original no-target method used the current cohort mean as the expected value for every row. By definition, the sum and mean of residuals around that same mean are zero. Consequently, the overall variance and anomaly score were always zero when no target was selected.

**Correction:** the exploratory fallback now uses a robust median baseline and clearly labels it as a non-forecast approximation. A production system still needs a seasonal, peer, or predictive expected-value model.

#### Null category drill paths did not reconcile

Grouping represented missing categories as a custom label, while predicate filtering compared `String(null)`. Clicking a missing-value bar could therefore create an empty cohort.

**Correction:** grouping and predicate evaluation share one canonical `(missing)` representation.

#### Analysis ran without a data-quality gate

The previous application ranked all automatically inferred fields regardless of missingness, mixed types, high cardinality, identifiers, or constant distributions.

**Correction:** a dedicated quality engine now assigns analytical roles. Only quality-approved measures and dimensions enter the anomaly engine, while identifiers and unsuitable fields remain available for traceability in the quality workspace.

### High findings corrected

#### Profiling considered only the first row's schema

Fields appearing later in JSON or ragged CSV records could be invisible.

**Correction:** the profiler uses the union of keys across all records. The quality engine separately identifies ragged records and missing fields.

#### Ingestion could corrupt identifiers

Leading-zero codes and long account-like numbers could be coerced into JavaScript numbers, losing formatting or precision.

**Correction:** leading-zero digit strings and 16+ digit values remain strings. Currency, accounting parentheses, and percentages are handled explicitly.

#### Synthetic hierarchy metadata did not match the sample data

The prior sample generated Region, Market, Product Tier, Brand, Channel subtype, and customer attributes independently while the semantic model described them as formal parent-child paths. This made hierarchical chat recommendations look valid even when the data did not support them.

**Correction:** the demo now contains coherent Time, Geography, Channel, Product, and Customer hierarchies. Attribute-like fields are no longer presented as structural child levels.

#### LLM context lacked data-quality evidence

The model could explain calculated anomalies without knowing that the source had blockers, duplicate records, or excluded measures.

**Correction:** the compact LLM context includes the quality score, readiness state, blockers, warnings, missingness, duplicates, sensitive-column names, calculation warnings, valid-row counts, and top quality issues. The system instruction requires the model to lead with quality limitations.

#### External context could contain prompt-injection text

Article titles, snippets, and analyst notes are untrusted input.

**Correction:** the LLM instruction explicitly treats external context as data, never as executable instructions; limits context length; and forbids revealing secrets or raw sensitive values.

### Medium findings corrected

- Added browser file-size and row-count limits with clear errors.
- Added nested JSON flattening for shallow analytical records.
- Added duplicate-header and parse-error reporting.
- Added robust MAD-based residual scale.
- Added minimum-support weighting and a cardinality penalty to driver scores.
- Replaced unstable near-zero interaction lift denominator with mean absolute residual.
- Added LLM endpoint validation, HTTPS enforcement, timeout, and output limits.
- Resynchronized chat suggestions when dashboard context changes.
- Added a deliberately imperfect quality-demo dataset.

## Remaining production risks

### No automated test suite

The build provides TypeScript validation but no unit, property, component, end-to-end, or regression tests. Priority tests should cover:

- ingestion coercion and identifier preservation
- null/missing cohort drills
- target and robust-median calculations
- exact contribution reconciliation
- category support thresholds
- interaction deduplication
- quality score boundaries
- duplicate/ragged-row detection
- sensitive-field heuristics
- semantic hierarchy validity
- deterministic chat intents
- LLM payload redaction
- news normalization and query construction

### No committed package lock

The workflow uses `npm install`, so dependency resolution can move between builds. Commit `package-lock.json` and switch CI to `npm ci`.

### Metric semantics remain incomplete

The app still needs a governed metric catalog containing:

- business label and definition
- additive, semi-additive, ratio, average, or distinct-count behavior
- numerator and denominator for rates
- favorable polarity: higher-is-better or lower-is-better
- valid aggregation grain
- target/forecast grain
- formatting, units, currency, and scaling
- allowed dimensions and sensitive exclusions

Without polarity metadata, a negative cost variance can be incorrectly presented as unfavorable. Without target-grain validation, a detailed attribution may look precise even when the target exists only at an aggregate level.

### No production expected-value model

The robust median is a transparent fallback, not anomaly forecasting. Production options include:

- seasonal median by weekday/month
- prior comparable period
- peer-group expectation
- forecast with prediction interval
- tree-based expected-value model
- business-planning target

Target variance and statistical anomaly should remain separate signals.

### Browser computation will not scale to enterprise data

Client-side profiling and combinatorial interaction search are appropriate for demonstrations and moderate extracts, not millions of records or 100+ high-cardinality dimensions. Move these capabilities to:

- a query/aggregation API
- columnar engine or warehouse
- cached investigation service
- background profile jobs
- Web Worker only as an intermediate browser improvement

### External providers need a backend gateway

Browser calls can fail because of CORS, plan restrictions, quotas, or credential exposure. A production gateway should provide:

- provider allowlist
- server-side secrets
- retry and rate limiting
- source deduplication
- entity disambiguation
- source credibility weighting
- audit logging
- retention controls

### Heuristic news sentiment is not decision-grade

Keyword sentiment can misclassify negation, quotations, sarcasm, or an article discussing a competitor. It should be labeled as a triage signal. A stronger pipeline should classify entity, event, geography, product, date window, materiality, source reliability, and whether the event is direct or market-wide.

### Accessibility and chart theming need dedicated testing

The app uses semantic labels and text signs, but Canvas charts need:

- keyboard-equivalent data tables
- screen-reader summaries
- visible focus states
- color-contrast testing for every palette
- non-color encodings for favorable/unfavorable states
- reduced-motion handling

## Comprehensive data quality concept framework

No single snapshot can prove every quality dimension. The correct product behavior is to calculate what can be observed, request configuration for business-specific rules, and label unverified dimensions explicitly.

| Concept | What it asks | Current coverage | Production extension |
|---|---|---|---|
| Completeness | Are required rows and values present? | Null cells, empty rows, per-column missingness, co-missing patterns | Conditional requiredness and expected row coverage |
| Uniqueness | Are rows and keys unintentionally duplicated? | Exact row duplicates and identifier candidates | Configured composite business keys and entity resolution |
| Validity | Can values be parsed and do they match expected types/formats? | Mixed types, numeric usability, date parsing, future dates | Regex, schema, domain and custom validators |
| Accuracy | Do values match verified reality? | Explicitly unverified | Golden sources, reconciliation datasets, sampling and stewardship approval |
| Consistency | Do equivalent fields agree within/across sources? | Case/spacing variants and near dependencies | Cross-source comparison and cross-field rules |
| Conformity / standardization | Are units, labels, encodings and representations standardized? | Whitespace, casing, text variants | Unit conversion, currency, timezone, locale and code-set rules |
| Integrity | Is the record structure internally sound? | Ragged rows, duplicate structure, optional configured keys | Primary-key, foreign-key and hierarchy constraints |
| Referential integrity | Do foreign keys resolve to valid reference records? | Not provable from isolated file | Reference-table upload/connection and orphan checks |
| Timeliness | Did data arrive within the agreed SLA? | Supported when a freshness SLA is supplied | Pipeline event timestamps and per-source SLAs |
| Freshness / currency | How old is the latest usable business record? | Date-range profiling; SLA configuration required | Source watermark and late-arrival monitoring |
| Granularity / grain | Does one row represent the intended analytical unit? | Duplicate/ragged clues only | Declared grain, composite keys, target-grain compatibility |
| Precision | Are numeric values captured at appropriate scale and decimals? | Numeric distribution displayed | Decimal-scale and rounding rules |
| Reasonableness / plausibility | Are values possible and believable? | IQR outliers, zeros, negatives, future dates | Business min/max, ratios and cross-field logic |
| Distribution quality | Are frequency, skew, concentration and balance acceptable? | Quartiles, spread, outliers, constants, top values | Approved distribution bands and category balance rules |
| Drift / stability | Has schema, volume, missingness or distribution changed? | Marked as requiring baseline | Stored profile snapshots and drift alerts |
| Schema evolution | Did columns/types change unexpectedly? | Current schema only | Versioned contracts and schema-diff history |
| Volume | Is row count within the expected range? | Current row count | Historical expected volume and source partition coverage |
| Temporal continuity | Are dates/periods missing, duplicated or out of order? | Date min/max and invalid dates | Calendar completeness and gap checks |
| Reconciliation / balancing | Do totals agree with control totals or ledgers? | Not configured | Control totals, accounting balances and source-to-target checks |
| Cross-field rules | Do related fields make sense together? | Dependency suggestions only | Configurable expressions, e.g. end >= start |
| Domain/reference validity | Are values in approved code lists? | Top values visible | Accepted-value lists and master-data reference checks |
| Coverage / representativeness | Are all expected populations represented? | Category frequencies visible | Expected population mix, market coverage and sampling weights |
| Bias / fairness | Are groups systematically missing or distorted? | Not scored | Protected-group review, fairness metrics and governance |
| Privacy / sensitivity | Does the dataset contain restricted or personal information? | Name/value heuristics; no raw values sent to LLM | Classification labels, masking, DLP and policy enforcement |
| Security / access | Are only authorized users and systems able to access data? | Outside static demo scope | Authentication, authorization, encryption, audit and row-level policy |
| Lineage / provenance | Can the source and transformations be traced? | Explicitly unverified | Source IDs, job/commit versions, owners and transformation graph |
| Observability | Can failures, freshness, volume, schema and quality incidents be monitored? | On-demand snapshot | Scheduled checks, alerts, incident ownership and trend dashboard |
| Discoverability / documentation | Can users understand fields and metrics? | Semantic labels and definitions for demo fields | Catalog, glossary, ownership, examples and certifications |
| Analysis readiness | Are reliable measures and dimensions available for the intended task? | Quality-approved role assignment and blocker gate | Use-case-specific readiness policies |
| ML label/feature quality | Are labels, features and train/serve data reliable? | Outside current scope | Leakage, label noise, feature drift and train/serve skew |
| External-data quality | Are news/external events relevant, credible and timely? | Active/passive split, dedupe, basic tags | Entity resolution, credibility, materiality and event-time alignment |

## Data Quality Explorer delivered in this review

The application now contains two first-class workspaces: **Insights** and **Data quality**.

The quality workspace includes:

1. **Overview** — overall score, readiness, blockers, warnings, completeness, duplicates, ragged rows, sensitive-field flags, and all quality dimensions.
2. **Column explorer** — every field, inferred type, analytical role, missingness, cardinality, uniqueness, top values, numeric quartiles/outliers, date coverage, text conformity, and field-level issues.
3. **Relationships** — strong numeric correlations, candidate functional dependencies/hierarchies, and common missingness patterns.
4. **Data preview** — a searchable sample of the loaded records with missing values shown explicitly.
5. **Quality framework** — a catalog distinguishing measured concepts from those requiring rules, baselines, or reference data.
6. **Export** — a downloadable JSON quality report.
7. **Demo modes** — a clean analytical dataset and an intentionally messy dataset with duplicates, missingness, invalid dates, mixed types, category variants, outliers, ragged rows, and PII-like fields.

The Insights workspace now surfaces the quality score and warnings, excludes unfit fields from driver ranking, reports excluded measure rows, and passes quality evidence to deterministic chat and the optional LLM.

## Recommended delivery roadmap

### Immediate engineering quality

1. Add Vitest unit/property tests and Playwright smoke tests.
2. Commit a package lock and use `npm ci`.
3. Add ESLint, formatting, dependency review, CodeQL, and a build-size budget.
4. Split the large application and quality engine into smaller tested modules.
5. Add an error boundary and structured telemetry.

### Data contracts and rules

1. Add a rule builder for required fields, keys, accepted values, ranges, regex patterns, and cross-field expressions.
2. Add reference-table upload/connectors for domain and referential-integrity checks.
3. Add metric polarity, aggregation type, numerator/denominator, units, and target-grain metadata.
4. Store quality profiles and compare them over time for drift, freshness and volume incidents.

### Production architecture

1. Move profiling, group-bys and interaction search to a secured backend.
2. Add authentication, authorization, row-level security and tenant isolation.
3. Proxy LLM/news calls through an approved gateway.
4. Store reproducible investigation snapshots with query ID, source version, profile version and calculation version.
5. Add analyst feedback, issue ownership, remediation workflow and quality-SLA monitoring.

## Review conclusion

The current build is substantially safer and more analytically defensible than the pre-review prototype. It now prevents several silent data-corruption paths, makes data quality visible before interpretation, and provides broad data exploration in the same application. It should still be described as a research-grade browser application until the remaining testing, metric semantics, governed rules, historical baselines, reference checks, backend scale and security controls are completed.
