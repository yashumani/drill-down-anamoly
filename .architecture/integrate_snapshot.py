from pathlib import Path


def replace_once(path: str, old: str, new: str):
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Expected block not found in {path}: {old[:100]}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    'src/AppShell.tsx',
    "import { createDatasetSession } from './lib/datasetSession';",
    "import { createDatasetSession } from './lib/datasetSession';\nimport { buildEvidenceLedger } from './lib/evidenceLedger';\nimport { createInvestigationSnapshot, downloadInvestigationSnapshot } from './lib/investigationSnapshot';",
)
replace_once(
    'src/AppShell.tsx',
    "  const selectedScore = result.dimensionScores.find((dimension) => dimension.dimension === selectedDimension) ?? result.dimensionScores[0] ?? null;",
    """  const evidenceLedger = useMemo(() => buildEvidenceLedger({
    result,
    predicates,
    metricDefinition,
    dataQuality: qualityReport,
    timeSeries,
    datasetSession,
    externalContext,
  }), [result, predicates, metricDefinition, qualityReport, timeSeries, datasetSession, externalContext]);
  const selectedScore = result.dimensionScores.find((dimension) => dimension.dimension === selectedDimension) ?? result.dimensionScores[0] ?? null;""",
)
replace_once(
    'src/AppShell.tsx',
    "  function openAdvanced(dimension?: string) {",
    """  function exportInvestigation() {
    const snapshot = createInvestigationSnapshot({
      datasetSession,
      metricDefinition,
      actualKey,
      expectedKey: expectedKey || undefined,
      metricPolarity,
      aggregation,
      timeField: activeTimeField || undefined,
      timeGrain,
      timeWindow,
      fiscalYearStartMonth,
      materialityPercent,
      predicates,
      investigation: result,
      timeSeries,
      evidenceLedger,
    });
    downloadInvestigationSnapshot(snapshot);
  }

  function openAdvanced(dimension?: string) {""",
)
replace_once(
    'src/AppShell.tsx',
    "      <div className=\"advanced-mode-banner\"><div><span className=\"eyebrow\">ADVANCED ANALYSIS</span><strong>Every control, every evidence layer.</strong><small>Return to Quick Answer whenever the specialist detail is no longer useful.</small></div><button type=\"button\" onClick={() => setWorkspace('guided')}>← Back to slide presentation</button></div>",
    """      <div className="advanced-mode-banner"><div><span className="eyebrow">ADVANCED ANALYSIS</span><strong>Every control, every evidence layer.</strong><small>Return to Quick Answer whenever the specialist detail is no longer useful.</small></div><div className="advanced-mode-actions"><button type="button" className="quiet-button" onClick={exportInvestigation}>Export investigation</button><button type="button" onClick={() => setWorkspace('guided')}>← Back to slide presentation</button></div></div>""",
)

css = Path('src/final-enhancements.css')
css.write_text(css.read_text() + """

/* Versioned investigation snapshot action. */
.advanced-mode-actions { display:flex; align-items:center; gap:8px; }
.advanced-mode-actions button { min-height:38px; }
@media (max-width:720px) { .advanced-mode-actions { width:100%; display:grid; grid-template-columns:1fr; } }
""")
