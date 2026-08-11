# All-Dimension Investigation Tree

## Problem

A conventional decomposition tree chooses one dimension at a time. That is useful for navigation but dangerous for high-dimensional anomaly analysis because choosing one branch can make analysts forget that other dimensions may still carry stronger explanatory power.

The proposed design separates **analysis** from **navigation**.

- The tree shows the current investigation path.
- The analytical engine evaluates every eligible dimension at every node.
- The UI exposes both the recommended next branches and the full dimension score landscape.
- Cross-dimensional combinations are searched separately so interactions are not lost.

## 1. Node semantics

Each node represents an analytical cohort, not simply a dimension value.

Example:

```text
ROOT
Metric: Actual Sales
Period: July 2026
Comparison: Target
Variance: -12.4M
Filters: Consumer
```

Selecting `Region = West` creates:

```text
NODE N1
Parent: ROOT
Predicate: Region = West
Inherited filters: Consumer
Variance: -6.8M
```

At N1, the engine does **not** merely ask "what is the next level under Region?" It asks:

> Given the currently selected cohort, which values across every remaining eligible dimension best explain the unfavorable/favorable movement?

## 2. All-dimension rescan

For node `n`, with cohort `C_n`, evaluate every eligible dimension `d`.

For each category value `v`:

```text
impact(d,v,n)     = signed variance attributable to rows matching d=v in C_n
support(d,v,n)    = rows / population represented
surprise(d,v,n)   = difference from expected or historical distribution
stability(d,v,n)  = persistence across adjacent periods / resamples
compactness(d,n)  = how much dimension d explains with few values
redundancy(d,n)   = similarity to already-used or equivalent dimensions
```

A practical score:

```text
value_score =
    impact_score
  * surprise_score
  * support_score
  * stability_score

DimensionScore =
    top-value explanatory power
  + distribution shift
  + compactness
  - redundancy penalty
```

The exact score should be versioned and configurable.

## 3. What the tree should render

Do not render all 100 dimensions as branches. The tree should render the **top-K recommended choices** while visibly proving that the full search occurred.

Example node:

```text
Region = West                         -6.8M
│
├─ Recommended next splits
│  1. Channel             score 94
│  2. Product Family      score 91
│  3. Customer Segment    score 84
│  4. Tenure Band         score 76
│
└─ 104 / 104 dimensions evaluated
```

A user can click `View all dimensions` to open the Dimension Landscape.

## 4. Dimension Landscape

The companion view prevents dimensions from being ignored.

Recommended table / matrix:

| Rank | Dimension | Score | Unfavorable impact | Favorable offset | Surprise | Support | Stability | Redundancy |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Channel | 94 | -4.2M | +0.8M | 0.91 | 0.88 | 0.93 | 0.10 |
| 2 | Product Family | 91 | -3.7M | +0.3M | 0.87 | 0.82 | 0.94 | 0.08 |
| 3 | Customer Segment | 84 | -2.9M | +0.6M | 0.83 | 0.95 | 0.77 | 0.14 |

Controls:

- Search dimension
- Group by business domain
- Sort by impact / surprise / stability / combined score
- Hide redundant dimensions
- Toggle `all`, `unused`, `used`, `restricted`
- Pin a dimension for comparison

The tree shows **where the user went**. The landscape shows **what the engine considered**.

## 5. Interaction search

Single-dimension ranking does not capture combinations such as:

```text
Region = West
AND Channel = Store
AND Product = Device X
```

Do not brute-force all combinations.

Use beam search / branch-and-bound style pruning:

```text
Step A: score every single-value predicate.
Step B: retain top B candidates.
Step C: extend retained candidates with values from other dimensions.
Step D: reject low-support and redundant combinations.
Step E: score remaining pairs.
Step F: retain top B pairs and optionally extend to triples.
Step G: stop when marginal explanatory gain is below threshold.
```

Suggested defaults:

```text
single candidate pool: 20-30
beam width: 10-20
max interaction depth: 3
min support: metric dependent
max returned segments: 5-10
```

## 6. Dynamic insight generation

Each drill event should trigger two pipelines in parallel.

### Deterministic analytics pipeline

```text
apply cohort predicates
  -> calculate node variance/anomaly
  -> scan all dimensions
  -> rank dimension values
  -> search combinations
  -> compare with parent
  -> compare with historical periods
  -> persist evidence references
```

### Agent insight pipeline

The LLM receives only structured analytical results and metadata.

It produces:

```text
1. What changed at this node?
2. What became more / less important versus parent?
3. Which dimensions currently explain the largest movement?
4. Are there meaningful favorable offsets?
5. Is the pattern persistent or isolated?
6. Which cross-dimensional segments are stronger than any single dimension?
7. What are the best next 3-5 drill directions?
8. What caveats should the analyst know?
```

Example insight:

```text
Inside West, Store channel is the strongest single-dimension driver,
accounting for 3.9M of unfavorable movement. However, the combination
Store + Device X is more concentrated: it represents 12% of the West
population but 31% of its gross unfavorable impact. Product Family
rose from rank 6 at the parent node to rank 2 inside West, suggesting
that the West anomaly has a product-specific component.
```

## 7. Branch management

A single linear path can hide alternative explanations.

Support parallel branches:

```text
ROOT
├─ Region = West
│  ├─ Channel = Store
│  └─ Product = Device X
│
├─ Channel = Store
│  └─ Customer Segment = New
│
└─ Product = Device X
   └─ Region = West
```

Equivalent cohorts should be canonicalized so paths that resolve to the same predicate set can be recognized as equivalent.

Example:

```text
Region=West -> Channel=Store
```

and

```text
Channel=Store -> Region=West
```

represent the same final cohort and should share cached calculations.

## 8. Suggested React layout

```text
┌────────────────────────────────────────────────────────────────────┐
│ Metric / Period / Comparison / Global Filters                     │
├────────────────────────────────────────────┬───────────────────────┤
│ Investigation Tree                         │ AI Investigator        │
│                                            │                       │
│ ROOT -12.4M                                │ Current insight       │
│   └ West -6.8M                             │ Evidence              │
│       ├ Store -4.2M                        │ Suggested drills      │
│       └ Device X -3.7M                     │ Chat                  │
│                                            │                       │
├────────────────────────────────────────────┴───────────────────────┤
│ Current Node                                                        │
│ [Contribution] [All Dimensions] [Interactions] [Trend] [Evidence] │
├────────────────────────────────────────────────────────────────────┤
│ Dimension Landscape / selected analytical panel                    │
└────────────────────────────────────────────────────────────────────┘
```

## 9. API contracts

### Analyze a node

```http
POST /api/investigations/{id}/nodes/analyze
```

```json
{
  "parentNodeId": "root",
  "predicates": [
    { "dimension": "region", "operator": "eq", "value": "West" }
  ],
  "comparison": "target"
}
```

Response:

```json
{
  "node": {
    "id": "node-west",
    "actual": 84700000,
    "expected": 91500000,
    "variance": -6800000,
    "anomalyScore": 3.8
  },
  "scan": {
    "eligibleDimensions": 104,
    "evaluatedDimensions": 104,
    "dimensionScores": [],
    "recommendedDimensions": [],
    "topInteractions": []
  },
  "parentComparison": {},
  "evidenceRef": "ev-123",
  "calculationVersion": "rca-v1"
}
```

### Node insight

```http
POST /api/investigations/{id}/nodes/{nodeId}/insight
```

The agent receives the analytical response plus metric and dimension metadata and returns structured claims rather than raw visualization code.

## 10. React state model

```ts
interface InvestigationNode {
  id: string;
  parentId?: string;
  predicates: Predicate[];
  summary: NodeSummary;
  recommendedDimensions: DimensionScore[];
  dimensionScores: DimensionScore[];
  interactions: SegmentScore[];
  insight?: InsightBundle;
}

interface InvestigationState {
  investigationId: string;
  rootNodeId: string;
  activeNodeId: string;
  nodes: Record<string, InvestigationNode>;
  expandedNodeIds: string[];
  selectedDimension?: string;
  activePanel:
    | "contribution"
    | "dimensions"
    | "interactions"
    | "trend"
    | "evidence";
}
```

## 11. Key visualization recommendation

Use a **hybrid tree + analytical workspace**, not a single giant tree.

The tree should remain cognitively small and answer:

> Where am I and how did I get here?

The all-dimension landscape answers:

> What did the engine evaluate at this exact scope?

The interaction panel answers:

> Which combinations of dimensions explain more than individual dimensions?

The AI panel answers:

> What is materially important and what should I investigate next?

Together, these satisfy the requirement to analyze all dimensions without attempting to draw 100+ dimensions and thousands of values simultaneously.

## Research anchors

- Adtributor (Microsoft / NSDI 2014): multidimensional RCA using explanatory power, surprise and succinctness.
- CMMD (Microsoft / KDD 2022): multidimensional RCA and combination search in complex KPI systems.
- Intelligent Drill-Down (2026): LLM-driven visual drill-down, path recommendation, branch management and insight generation.
- Smart Drill-Down / visualization recommendation literature: prune the combinatorial decision space rather than rendering every possible branch.
