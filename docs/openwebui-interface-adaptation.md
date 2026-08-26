# Open WebUI-inspired interface adaptation

## Objective

The application now uses a workspace shell inspired by the interaction patterns of Open WebUI while retaining the FP&A Variance Copilot's own product identity, calculations, terminology, visualizations, and evidence contracts.

The redesign addresses the previous accumulation of dashboard headers, repeated navigation, oversized control rows, and presentation-specific layouts that made the product feel fragmented.

## Adapted interaction patterns

- Persistent left navigation for the four primary workspaces.
- A compact top bar showing the current dataset, metric, quality status, presentation action, upload action, and analysis mode.
- A central content canvas for Quick Answer, Explore & Analyze, Live Public Demo, and Data Quality.
- Clear separation between deterministic financial calculations and optional model-assisted explanation.
- Compact neutral surfaces, soft borders, restrained shadows, and subtle accent colors.
- Desktop sidebar collapse, tablet behavior, mobile drawer, and mobile bottom navigation.
- One-click access to a new analysis, data upload, and Presentation Studio.
- A persistent current-analysis summary showing dataset, metric, comparison, row count, reporting period, and dataset-session identifier.

## What was deliberately not copied

The implementation does not copy Open WebUI source code, branding, logos, wording, or product-specific assets. It adapts familiar application-shell patterns to the finance investigation workflow.

## Preserved finance behavior

The interface redesign does not alter:

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

## Responsive behavior

### Desktop

The left navigation remains visible and can collapse to an icon rail. Presentation workspaces continue to use the available viewport height, while specialist analytical pages scroll inside the central content canvas.

### Tablet

The sidebar can collapse, the top bar reduces secondary context, and analytical grids reflow without hiding evidence.

### Phone

The sidebar becomes a drawer, the primary workspaces are available in a bottom navigation bar, compact upload and presentation actions remain accessible, and wide charts or tables use contained scrolling.

## Theme behavior

The existing curated palettes remain available. The Open WebUI-inspired neutral shell supplies the base light or dark canvas, while the selected palette supplies accent, favorable, unfavorable, and chart emphasis colors.

## Accessibility and usability

- Navigation uses semantic buttons and `aria-current`.
- The mobile drawer supports Escape-to-close and a dismissible backdrop.
- Controls retain visible focus states and descriptive titles.
- Reduced-motion preferences disable nonessential transitions.
- Information tips and existing chart descriptions remain available.

## Release acceptance criteria

- All existing analytical regression tests pass.
- The TypeScript and Vite production build passes.
- The production bundle remains within budget.
- The four workspaces are reachable on desktop and mobile.
- Upload and Presentation Studio remain one action away.
- Financial results before and after the redesign are unchanged for the same dataset and configuration.
