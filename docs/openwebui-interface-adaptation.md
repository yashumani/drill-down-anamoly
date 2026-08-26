# Open WebUI-inspired interface adaptation

## Objective

The application uses a workspace shell inspired by Open WebUI interaction patterns while retaining the FP&A Variance Copilot's own product identity, calculations, terminology, visualizations, and evidence contracts.

The first shell release solved product fragmentation but still exposed too many controls at once and inherited presentation-layout rules that could crop or overlap content on common laptop displays. The current refinement separates navigation from analysis and organizes the anomaly workflow by user decision.

## Application shell

- Persistent desktop navigation for the four primary workspaces.
- Compact top bar showing workspace, dataset context, data readiness, and Presentation Studio.
- One upload entry point and one theme entry point in the sidebar instead of duplicate controls across the page.
- Central scroll-managed canvas for active work.
- Collapsible desktop sidebar, mobile drawer, and mobile bottom navigation.
- Persistent current-analysis summary with dataset, metric, comparison, period, row count, and dataset-session ID.

## Product journeys

### Quick Answer

```text
Data → Goal → Detect → Explain → Share
```

This path keeps setup to three essential business choices and presents one management-ready answer before deeper evidence.

### Advanced Analysis

```text
Scope → Detect → Explain → Validate → Share
```

Each stage exposes one coherent class of work. Single drivers, combined patterns, and hierarchy are subviews of Explain rather than separate competing sections.

See `docs/anomaly-investigation-journey.md` for the complete interaction contract.

## What was deliberately not copied

The implementation does not copy Open WebUI source code, branding, logos, wording, or product-specific assets. It adapts familiar workspace-shell and progressive-disclosure patterns to a finance investigation workflow.

## Preserved finance behavior

The interface refinement does not alter:

- Actual, Plan, Budget, Target, Forecast, or prior-period calculations;
- metric polarity or aggregation rules;
- MTD, QTD, YTD, rolling-window, materiality, and anomaly logic;
- all-dimension driver scanning or combined-pattern search;
- hierarchy queries, org charts, or animated arc behavior;
- public Socrata aggregation;
- data-quality scoring;
- evidence-ledger identifiers;
- deterministic chat behavior;
- optional local or OpenAI-compatible model boundaries;
- Presentation Studio values or exports.

## Laptop and responsive behavior

### Desktop and laptop

The sidebar narrows on standard laptop widths, secondary top-bar context is progressively hidden, and analytical pages use stage navigation plus contained scrolling. Short-height displays reduce chrome before reducing chart space.

### Tablet

The sidebar collapses to an icon rail, analytical grids reflow, and the investigation stage remains visible without compressing action labels into overlapping controls.

### Phone

The sidebar becomes a drawer, primary workspaces remain in bottom navigation, stage navigation scrolls horizontally, and actions stack into touch-safe rows.

## Design consolidation

The Open WebUI-inspired stylesheet is authoritative for the shell and journey layouts. Obsolete guided-workflow CSS is no longer loaded, and legacy palette/app-shell rules were removed from the presentation layer to prevent conflicting grid and viewport behavior.

## Accessibility and usability

- Navigation uses semantic buttons and `aria-current`.
- The mobile drawer supports Escape-to-close and a dismissible backdrop.
- Controls retain visible focus states and descriptive titles.
- Reduced-motion preferences disable nonessential transitions.
- Information tips and chart descriptions remain available.
- Preview and drill are explicitly differentiated so users understand whether they are changing a view or changing the analytical population.

## Release acceptance criteria

- All analytical and journey regression tests pass.
- TypeScript and Vite production builds pass.
- The production bundle remains within budget.
- No horizontal document overflow appears at 1366 × 768, 1440 × 900, 1024 × 768, or 390 × 844.
- The five Quick Answer stages and five Advanced Analysis stages are reachable without clipped controls.
- Upload and Presentation Studio remain one action away.
- Financial results before and after the UI change are identical for the same dataset and configuration.
