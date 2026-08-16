# CFO / SVP BI, Data Science, and MLOps Rescan

## Executive assessment

The application is now positioned as an FP&A variance-explanation workspace rather than a generic anomaly dashboard. This rescan reviewed the system as if it were supporting a CFO, SVP Finance, corporate FP&A, revenue finance, OpEx, CapEx, workforce planning, and marketing finance operating cadence.

The most important gap found was analytical scope misalignment: driver attribution could scan all loaded rows while a finance user believed they were looking at a rolling period such as the last 15 months, YTD, or QTD. Time fields could also appear as business drivers even though time should be analyzed separately from causal business dimensions. The release corrects both problems.

## Material improvements delivered

### Finance time intelligence

The application now detects candidate date, day, week, month, quarter, fiscal-period, and year fields and supports:

- Daily, weekly, monthly, and quarterly aggregation.
- Last 90 days, 8 weeks, 13 weeks, 15 months, 24 months, MTD, QTD, YTD, and all-period views.
- Calendar or configurable fiscal-year start month.
- Sum aggregation for flows such as revenue, bookings, expense, and CapEx.
- Average aggregation for exploratory averages, with an explicit warning that finance ratios require governed numerator and denominator definitions.
- Period-end aggregation for balances and headcount, with an explicit grain assumption.
- Actual, plan/expected, raw variance, business impact, pace, materiality, and robust period-level anomaly monitoring.
- MTD, QTD, YTD, trailing-period, prior-period, and prior-year context.
- Daily month-end run-rate projection when the current month is incomplete.
- Forecast/plan bias, normalized volatility, recent momentum, and distribution-drift monitoring.

### Executive and CFO presentation

The new CFO Pulse view provides:

- Latest-period actual and plan.
- Current-period, QTD, YTD, and trailing business impact.
- Actual-versus-plan time-series visualization with business-impact bars.
- Material and statistically unusual executive alerts.
- Run-rate projection for eligible daily flow data.
- A finance evidence table for every displayed period.
- A downloadable calculation snapshot.

### Scope alignment

Driver analysis is now filtered to the same selected finance window used by the time-series view. Time fields are excluded from the business-driver landscape so that Month, Quarter, and Year do not compete with operational dimensions such as Product, Region, Cost Center, Vendor, Channel, Project, or Customer Segment.

### Data-science safeguards

- Period anomaly scores use only prior period history and a robust median/MAD scale where enough observations exist.
- Materiality is independent from statistical unusualness; a period can be material without being statistically anomalous and vice versa.
- Metric polarity is applied before favorable/unfavorable classification.
- Rolling-median expectations are labeled exploratory when no plan or expected measure exists.
- Seasonality readiness is reported instead of pretending a short history supports a seasonal forecast.
- Model-health scoring covers time parsing, valid-measure coverage, plan coverage, period depth, and drift.

### MLOps and reproducibility

Every finance time run now includes:

- Calculation version.
- Deterministic run identifier.
- Generated timestamp.
- Selected time field, grain, window, aggregation, fiscal calendar, baseline, polarity, and materiality threshold.
- Data coverage and exclusion counts.
- Model-health score and reasons.
- Monitoring warnings.
- Exportable period evidence.

The GitHub Pages pipeline now runs analytical regression tests before the production build and deployment.

### Conversational FP&A

Deterministic chat and the optional LLM can now answer:

- How are we pacing MTD, QTD, or YTD?
- Are we pacing to hit month-end?
- What changed over time?
- What is the recent trend, volatility, or forecast bias?
- Can the time analysis be trusted?
- Which business factors drive the selected finance window?
- Could an external event be a plausible why-factor?

The LLM receives compact, verified time intelligence, model health, data-quality evidence, material periods, business drivers, and external context. It is instructed to distinguish deterministic observations from hypotheses, respect metric polarity, and disclose when aggregation or seasonality assumptions are weak.

## Regression tests added

Automated tests now cover:

- Monthly time-field detection.
- 15-month aggregation.
- QTD and YTD calculations.
- Metric-polarity reversal.
- YTD row filtering for aligned driver analysis.
- Period-end aggregation.
- Exclusion of invalid measures.
- Canonical missing-value drilling.
- Sparse schema discovery.
- Exact duplicate detection.
- Sensitive-field heuristics.

## Remaining production gaps

### Metric semantic layer

This is intentionally still open and is the most important next stage. The system needs governed definitions for:

- Business name and definition.
- Owner and approver.
- Actual, budget, forecast, and prior-period sources.
- Additive, semi-additive, average, ratio, or distinct-count behavior.
- Numerator and denominator for rates.
- Higher-is-better or lower-is-better polarity.
- Currency, unit, scaling, and rounding.
- Fiscal calendar.
- Valid aggregation and target grain.
- Allowed dimensions and restricted fields.
- Known close, accrual, allocation, and timing caveats.

### Statistical forecasting

The current system provides robust descriptive monitoring and simple daily run-rate projection. Production forecasting requires:

- Backtested seasonal baselines.
- Prediction intervals.
- Holiday and working-day calendars.
- Missing-period handling.
- Model selection by metric behavior.
- Forecast-accuracy metrics such as WAPE, bias, and coverage.
- Champion/challenger comparison.
- Retraining and recalibration policy.

### External-factor validation

News relevance scoring is still hypothesis generation, not impact estimation. A stronger event-study workflow should include:

- Event date and effective window.
- Entity, geography, product, channel, and finance-lever mapping.
- Affected-versus-unaffected cohort comparison.
- Pre/post movement and difference-in-differences where assumptions are credible.
- Multiple-event overlap.
- Source credibility and duplicate-event clustering.
- Supported, weak, contradicted, and insufficient-evidence statuses.

### Production architecture

The GitHub Pages implementation remains a browser-based demonstration. Enterprise usage requires:

- Secured backend aggregation and model services.
- Data-warehouse pushdown.
- Row-level and tenant-level security.
- LLM/news gateway with server-held credentials.
- Persisted investigation snapshots and commentary approvals.
- Scheduled model and data monitoring.
- Incident ownership and alerting.
- Package lock and reproducible dependency installation.
- Performance testing for large datasets.

## Recommended next stage

Build the governed Metric Definition and Finance Calendar layer, then add a backtested forecast service and structured external-event study. Those three capabilities will determine whether the application can move from an executive-quality prototype to a trustworthy FP&A operating platform.
