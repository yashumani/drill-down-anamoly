# Drill-Down Anomaly Research

Research workspace for a React-based multidimensional anomaly investigation experience with agentic AI.

## Core product idea

The visualization tree is a navigation surface, not the analytical engine.

At every drill-down node, the backend re-evaluates **all eligible dimensions** against the currently filtered cohort, ranks dimensions and values, searches selected cross-dimensional interactions, and returns a compact set of recommended next branches plus a complete dimension-score landscape.

This avoids the main weakness of a conventional decomposition tree: selecting `Region` first must not cause `Product`, `Channel`, `Customer Type`, or the other dimensions to be ignored.

## Proposed interaction loop

1. Detect an anomaly or unfavorable/favorable target variance at the root scope.
2. Scan all eligible dimensions.
3. Score every dimension for impact, surprise, support, stability, compactness, and redundancy.
4. Return the top recommended dimensions and top category values.
5. User selects a branch such as `Region = West`.
6. Apply that predicate to create a new cohort.
7. **Re-run the entire all-dimension scan** inside that cohort.
8. Search high-value 2-way / 3-way combinations using pruning rather than brute force.
9. Generate evidence-backed AI insights and suggested next drill paths.
10. Preserve parallel branches so users can compare alternative explanations.

## UI concept

The investigation workspace should combine:

- Dynamic investigation tree / branch graph
- Current-node anomaly summary
- Recommended next dimensions
- All-dimension score landscape
- Top multidimensional segments
- Contribution view
- Persistence / trend view
- Evidence table
- AI insight and conversational analytics panel

See `docs/all-dimension-investigation-tree.md` for the detailed design.
