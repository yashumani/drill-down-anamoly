# Exploration UI visual-fit audit

## Scope

This pass changes presentation, spacing, chart fit, button labeling, and contextual help only. It does not change finance calculations, hierarchy queries, anomaly scoring, data filtering, LLM evidence, or public-source behavior.

## Viewports reviewed

The source layout was evaluated against these product targets:

- 1920 × 1080 desktop
- 1366 × 768 laptop
- 1024 × 768 tablet landscape
- 768 × 1024 tablet portrait
- 390 × 844 phone

The presentation workspaces retain page-by-page navigation. Specialist workspaces may scroll when their analytical depth requires it.

## Problems corrected

1. The live demo contained six pages while the progress navigation still reserved five columns.
2. Hierarchy arc and org-chart canvases used a fixed 520-pixel chart inside a viewport-constrained slide with hidden overflow.
3. Headings, breadcrumbs, level rails, help text, source notes, and the leaf-insight panel competed with the chart for the same fixed height.
4. Exploration actions could wrap or crop without explaining the difference between Focus, Drill down, Combined drivers, Hierarchy arc, and Reset.
5. Short laptop screens reduced the chart before reducing decorative chrome.
6. KPI and setup labels did not explain the meaning or analytical boundary of the metric.
7. Mobile tooltips needed a touch- and keyboard-readable presentation.

## Design corrections

- Added accessible information tips that work with hover, keyboard focus, and touch-sized mobile presentation.
- Consolidated exploration controls into a compact progressive layout with Basic and Advanced modes.
- Added concise native button titles for every exploration action.
- Allocated the remaining live-slide height to hierarchy visualizations and moved long evidence into contained scrolling.
- Reduced redundant hierarchy chrome only in the desktop no-scroll presentation; supporting detail remains available on mobile and in advanced analysis.
- Added six-column desktop live navigation with responsive tablet and phone arrangements.
- Added a short-laptop media mode that reduces header and control height rather than clipping the chart.
- Made combined-driver semantics explicit: horizontal position is concentration, vertical position is business impact, and bubble size is support.
- Preserved reduced-motion behavior and visible focus states.

## Acceptance criteria

- No primary action is clipped at 1366 × 768, 1920 × 1080, tablet, or phone widths.
- The full hierarchy chart area, selected leaf panel, and navigation are reachable in the active slide.
- Every non-obvious metric or control has contextual help or an explanatory title.
- Basic users see dimension, category, period, and action choices before advanced finance assumptions.
- Calculations and source queries are unchanged.
- Vitest, TypeScript, production build, bundle budget, dependency audit, and CodeQL pass before merge.
