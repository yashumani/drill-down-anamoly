# Presentation Studio

Presentation Studio converts the current FP&A investigation into a finance-ready 16:9 infographic without requiring an LLM.

## Deterministic source of truth

The slide model is built from:

- the active dataset session;
- the selected metric and comparison;
- the current reporting period and drill scope;
- Actual, comparison, variance, and business impact;
- material or unusual periods;
- leading supported drivers and interactions;
- data-quality and analysis-health scores;
- the calculation run ID and dataset-session ID.

No raw data rows are included in the export model.

## Presets

### Executive infographic

A one-page management summary containing KPI cards, leading drivers, the executive callout, and the core FP&A questions already answered.

### Anomaly register

A compact register of the strongest material or unusual periods with the leading supported driver priorities.

### Questions answered

A finance-review slide organized around:

1. Why are we off plan?
2. Are we on track?
3. What changed over time?
4. What is driving the result?
5. Can the result be trusted?

## Export formats

- SVG for editable vector placement in PowerPoint, Keynote, or Google Slides.
- 1920 × 1080 PNG for direct slide insertion.
- Browser print for PDF workflows.
- Evidence JSON for audit and reproduction.

## Optional LLM design assistance

The LLM receives the locked slide model and current design plan. It may return only these design fields:

```text
title
subtitle
theme
 density
emphasis
callout
```

It cannot return or modify Actual, comparison, variance, impact, anomaly, support, quality, or evidence values. The deterministic slide remains fully functional when no model is configured.

## Product boundary

Presentation Studio is a reporting-output layer. It does not recalculate the investigation, choose a new metric, change the drill population, or create causal conclusions.
