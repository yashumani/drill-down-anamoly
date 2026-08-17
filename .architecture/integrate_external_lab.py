from pathlib import Path


def replace_once(path: str, old: str, new: str):
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Expected block not found in {path}: {old[:100]}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    'src/AppShell.tsx',
    "import { FpaInsightPanel } from './components/FpaInsightPanel';",
    "import { FpaInsightPanel } from './components/FpaInsightPanel';\nimport { ExternalFactorValidationPanel } from './components/ExternalFactorValidationPanel';",
)
replace_once(
    'src/AppShell.tsx',
    "      <FpaInsightPanel rows={analysisRows} predicates={predicates} result={result} dataQuality={qualityReport} planningLens={planningLens} newsAnalysis={newsAnalysis} timeSeries={timeSeries} />",
    """      <FpaInsightPanel rows={analysisRows} predicates={predicates} result={result} dataQuality={qualityReport} planningLens={planningLens} newsAnalysis={newsAnalysis} timeSeries={timeSeries} />

      <ExternalFactorValidationPanel
        rows={rows}
        result={result}
        predicates={predicates}
        actualKey={actualKey}
        expectedKey={expectedKey || undefined}
        metricPolarity={metricPolarity}
        timeField={activeTimeField}
        defaultEventDate={timeSeries?.currentPeriod?.periodStart}
      />""",
)

css = Path('src/final-enhancements.css')
css.write_text(css.read_text() + """

/* External event-study validation lab. */
.external-validation-panel { margin:16px 0; border:3px solid var(--ink); border-radius:18px; padding:16px; background:var(--surface); box-shadow:4px 5px 0 var(--ink); }
.external-validation-head { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; }
.external-validation-head h2 { margin:4px 0 6px; }
.external-validation-head p { margin:0; max-width:920px; }
.external-validation-head > button { min-height:42px; border:3px solid var(--ink); border-radius:10px; padding:8px 13px; background:var(--lime); color:#111; font-weight:950; white-space:nowrap; }
.external-validation-controls { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin:14px 0; }
.external-validation-controls label { display:grid; gap:4px; font-size:.63rem; font-weight:900; letter-spacing:.05em; text-transform:uppercase; }
.external-validation-controls input,.external-validation-controls select { width:100%; min-width:0; padding:8px!important; }
.external-validation-result { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
.external-validation-result > article { border:2px solid var(--ink); border-radius:12px; padding:11px; background:var(--surface2); }
.external-validation-result article span,.external-validation-result article strong,.external-validation-result article small { display:block; }
.external-validation-result article span { font-size:.6rem; font-weight:950; letter-spacing:.06em; text-transform:uppercase; }
.external-validation-result article strong { margin:7px 0 4px; font-size:1.25rem; }
.external-validation-verdict.supported { background:var(--lime)!important; color:#111; }
.external-validation-verdict.contradicted { background:var(--coral)!important; color:#111; }
.external-validation-verdict.weak { background:var(--yellow)!important; color:#111; }
.external-validation-notes { grid-column:1/-1; display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.external-validation-notes section,.external-validation-empty { border:2px solid var(--ink); border-radius:12px; padding:11px; background:var(--surface2); }
.external-validation-notes h3 { margin:0 0 6px; font-size:.82rem; }
.external-validation-notes p,.external-validation-empty p { margin:4px 0; font-size:.72rem; line-height:1.4; }
.external-validation-empty { text-align:center; }
@media (max-width:1000px) { .external-validation-controls,.external-validation-result { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:620px) { .external-validation-head { display:grid; } .external-validation-controls,.external-validation-result,.external-validation-notes { grid-template-columns:1fr; } }
""")
