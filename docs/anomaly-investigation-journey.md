# Anomaly investigation journey

The interface is organized around the decisions a finance user makes, rather than around every analytical capability the application contains.

## Quick Answer

Quick Answer is the default path for a first-time, occasional, or management-review user.

```text
Data → Goal → Detect → Explain → Share
```

### 1. Data

Choose the embedded finance sample, upload CSV or JSON, or open the large public demonstration.

### 2. Goal

Choose the business question and confirm only the essential inputs:

- Actual measure;
- comparison measure or rolling baseline;
- reporting period.

Finance use case, business direction, detected time field, and aggregation assumptions remain available under progressive disclosure.

### 3. Detect

Lead with one business-impact number, four plain-language answers, and one compact trend. This stage answers what happened and whether the movement is material or unusual before suggesting a cause.

### 4. Explain

Rank the strongest supported dimensions and categories. Combined patterns and hierarchy views are available in Advanced Analysis rather than competing with the first explanation.

### 5. Share

Create a deterministic presentation, use the evidence-grounded finance guide, or open the full evidence workspace. An LLM is optional.

## Advanced Analysis

Advanced Analysis uses the same calculation state but separates specialist work into five stages:

```text
Scope → Detect → Explain → Validate → Share
```

### Scope

Set the metric, comparison, period, dimension, category, and drill population. Previewing a dimension does not filter data. Drilling changes every downstream calculation.

### Detect

Review Actual versus expectation, business impact, materiality, anomaly status, pace, and time movement.

### Explain

Choose among:

- single-dimension drivers;
- supported combined patterns;
- declared parent-child hierarchy.

These are alternative evidence views, not simultaneous dashboard sections.

### Validate

Review data readiness and test internal or external context. News and events remain hypotheses unless supported by the event-study evidence.

### Share

Create an infographic, ask follow-up questions, export the evidence snapshot, or open the detailed factor audit.

## Interaction rules

- One primary action is emphasized per stage.
- Secondary actions are grouped under contextual menus or progressive disclosure.
- Duplicate upload, theme, and model controls are removed from the top bar when the sidebar already provides them.
- Desktop and laptop layouts use contained scrolling instead of clipping controls to preserve a no-scroll illusion.
- Mobile uses the same hierarchy with a drawer, bottom navigation, stacked controls, and horizontally scrollable stage navigation.
- Deterministic calculations remain authoritative across every stage.
