from pathlib import Path
import re


def require(condition: bool, message: str):
    if not condition:
        raise RuntimeError(message)

# Replace the incomplete hierarchy contract with the tested implementation.
template = Path('scripts/arc-hierarchyContract.ts').read_text().replace("../src/types", "../types")
Path('src/lib/hierarchyContract.ts').write_text(template)

# Load the new visual style layer last.
main = Path('src/main.tsx')
text = main.read_text()
if "./arc-explorer.css" not in text:
    anchor = "import './mobile.css';"
    text = text.replace(anchor, anchor + "\nimport './arc-explorer.css';") if anchor in text else text.replace("import './final-enhancements.css';", "import './final-enhancements.css';\nimport './arc-explorer.css';")
main.write_text(text)

# Keep the slideshow tests aligned with the hierarchy page introduced in the prior release.
flow_test = Path('src/lib/presentationFlow.test.ts')
text = flow_test.read_text()
text = text.replace("it('moves through overview, trend, drivers, AI, and method pages'", "it('moves through overview, trend, drivers, hierarchy, AI, and method pages'")
text = text.replace("expect(nextLiveDemoSlide('drivers')).toBe('ai');", "expect(nextLiveDemoSlide('drivers')).toBe('hierarchy');\n    expect(nextLiveDemoSlide('hierarchy')).toBe('ai');")
flow_test.write_text(text)

# Consolidate the live public demo controls and add an animated-arc / org-chart switch.
live = Path('src/components/LivePublicFinanceDemo.tsx')
text = live.read_text()
if "./LiveHierarchyArcExplorer" not in text:
    text = text.replace("import { LivePublicAiPanel } from './LivePublicAiPanel';", "import { LivePublicAiPanel } from './LivePublicAiPanel';\nimport { LiveHierarchyArcExplorer } from './LiveHierarchyArcExplorer';")
state_anchor = "  const [selectedDimension, setSelectedDimension] = useState(LIVE_PUBLIC_DIMENSIONS[0].field);"
if "selectedLiveCategory" not in text:
    require(state_anchor in text, 'Live demo dimension state marker not found')
    text = text.replace(state_anchor, state_anchor + "\n  const [selectedLiveCategory, setSelectedLiveCategory] = useState('');\n  const [hierarchyView, setHierarchyView] = useState<'arc' | 'org'>('arc');")
current_marker = "  const current = result?.currentMonth ?? null;"
if "selectedSummary?.values.some" not in text:
    require(current_marker in text, 'Live demo current-period marker not found')
    effect = """  useEffect(() => {
    const values = selectedSummary?.values ?? [];
    if (!values.some((item) => item.value === selectedLiveCategory)) setSelectedLiveCategory(values[0]?.value ?? '');
  }, [selectedSummary?.field, selectedSummary?.values, selectedLiveCategory]);

"""
    text = text.replace(current_marker, effect + current_marker)
start = text.find('    <div className="live-demo-controls live-presentation-controls">')
end = text.find('\n\n    <div className="live-stage">', start)
if start >= 0 and end >= 0:
    controls = """    <section className="live-explore-bar" aria-label="Live data exploration controls">
      <div className="live-explore-intro"><span className="deck-kicker">EXPLORE</span><strong>One place for scope, focus, drill, and hierarchy navigation.</strong><small>{filter ? `Current drill: ${humanize(filter.field)} = ${filter.value}` : 'Current drill: all categories'}</small></div>
      <div className="live-explore-fields">
        <label>Scope<select value={scope} onChange={(event) => { setScope(event.target.value as LiveDemoScope); setFilter(null); }}><option value="all">All records</option><option value="24m">Latest 24 months</option><option value="current_fy">Latest fiscal year</option></select></label>
        <label>Explore by<select value={selectedDimension} onChange={(event) => { setSelectedDimension(event.target.value); setSelectedLiveCategory(''); }}>{LIVE_PUBLIC_DIMENSIONS.map((dimension) => <option key={dimension.field} value={dimension.field}>{dimension.label}</option>)}</select></label>
        <label>Category<select value={selectedLiveCategory} onChange={(event) => setSelectedLiveCategory(event.target.value)}><option value="">Choose a category</option>{selectedSummary?.values.map((item) => <option key={item.value} value={item.value}>{item.value}</option>)}</select></label>
      </div>
      <div className="live-explore-actions">
        <button type="button" className="quiet-button" onClick={() => setSlide('drivers')} disabled={!selectedSummary}>Focus</button>
        <button type="button" onClick={() => selectedSummary && selectedLiveCategory && setFilter({ field: selectedSummary.field, value: selectedLiveCategory })} disabled={!selectedSummary || !selectedLiveCategory}>Drill down</button>
        <button type="button" className="quiet-button" onClick={() => setSlide('hierarchy')}>Arc hierarchy</button>
        <button type="button" className="quiet-button" onClick={() => setFilter(null)} disabled={!filter}>Reset</button>
      </div>
      <details className="live-token-settings"><summary>API token</summary><label>Socrata token<input type="password" value={appToken} onChange={(event) => setAppToken(event.target.value)} placeholder="Not saved" autoComplete="off" /></label><small>Click Refresh after entering a token. It remains only in page memory.</small></details>
    </section>"""
    text = text[:start] + controls + text[end:]
if 'hierarchy-view-switch' not in text:
    match = re.search(r'(<LiveHierarchyOrgChart\b[^>]*/>)', text)
    require(match is not None, 'LiveHierarchyOrgChart render marker not found')
    original = match.group(1)
    replacement = """<><div className="hierarchy-view-switch" role="group" aria-label="Hierarchy visualization"><button type="button" className={hierarchyView === 'arc' ? 'active' : ''} onClick={() => setHierarchyView('arc')}>Animated arc</button><button type="button" className={hierarchyView === 'org' ? 'active' : ''} onClick={() => setHierarchyView('org')}>Org chart</button></div>{hierarchyView === 'arc' ? <LiveHierarchyArcExplorer result={result} scope={scope} appToken={appToken} /> : %s}</>""" % original
    text = text[:match.start()] + replacement + text[match.end():]
live.write_text(text)

# Install one novice-first exploration bar in Advanced Analysis and replace the opaque interaction list.
app = Path('src/AppShell.tsx')
text = app.read_text()
text = text.replace("import { ContributionBars, DimensionLandscape, DrillTree, InteractionList } from './components/Visuals';", "import { ContributionBars, DimensionLandscape, DrillTree } from './components/Visuals';\nimport { CombinationExplorer } from './components/CombinationExplorer';\nimport { ExplorationControlBar } from './components/ExplorationControlBar';\nimport type { ExplorerMode } from './components/ExplorationControlBar';\nimport { HierarchyDataExplorer } from './components/HierarchyDataExplorer';")
state_anchor = "  const [selectedDimension, setSelectedDimension] = useState<string>('region');"
if "explorerMode" not in text:
    require(state_anchor in text, 'App dimension state marker not found')
    text = text.replace(state_anchor, state_anchor + "\n  const [selectedCategoryValue, setSelectedCategoryValue] = useState('');\n  const [explorerMode, setExplorerMode] = useState<ExplorerMode>('basic');\n  const [showCombinations, setShowCombinations] = useState(false);\n  const [showHierarchy, setShowHierarchy] = useState(false);")
function_marker = "  function changePalette(next: PaletteId) {"
if "selectedScore?.categories.some" not in text:
    effect = """  useEffect(() => {
    const categories = selectedScore?.categories ?? [];
    if (!categories.some((category) => category.value === selectedCategoryValue)) setSelectedCategoryValue(categories[0]?.value ?? '');
  }, [selectedScore?.dimension, selectedScore?.categories, selectedCategoryValue]);

"""
    require(function_marker in text, 'App palette function marker not found')
    text = text.replace(function_marker, effect + function_marker)
text = text.replace("    setSelectedDimension(nextQuality.dimensionCandidates[0] ?? '');", "    setSelectedDimension(nextQuality.dimensionCandidates[0] ?? '');\n    setSelectedCategoryValue('');")
text = text.replace("data-layout={layoutMode} data-dataset-session", "data-layout={layoutMode} data-explorer-mode={explorerMode} data-dataset-session")
start = text.find("    {(workspace === 'advanced' || workspace === 'quality') && <section className=\"controls top-controls\"")
end = text.find("\n\n    {workspace === 'guided' ?", start)
if start >= 0 and end >= 0:
    quality_controls = """    {workspace === 'quality' && <section className="controls top-controls" aria-label="Data quality controls">
      <div className="filter-scope"><span>Dataset</span><strong>{qualityReport.rowCount.toLocaleString()} rows · {qualityReport.columnCount.toLocaleString()} columns · {qualityReport.status}</strong></div>
      <button className="quiet-button" onClick={loadCleanDemo}>Reset clean demo</button>
      <button className="quiet-button" onClick={loadQualityDemo}>Load quality demo</button>
    </section>}"""
    text = text[:start] + quality_controls + text[end:]
banner_marker = "</div></div>\n\n      {(qualityReport.blockers > 0 || qualityReport.warnings > 0)"
if '<ExplorationControlBar' not in text:
    require(banner_marker in text, 'Advanced banner marker not found')
    toolbar = """</div></div>

      <ExplorationControlBar
        mode={explorerMode}
        planningLens={planningLens}
        planningOptions={planningLenses.map((lens) => ({ id: lens.id, label: lens.label }))}
        numericFields={numeric.map((profile) => profile.name)}
        actualKey={actualKey}
        expectedKey={expectedKey}
        metricPolarity={metricPolarity}
        timeWindow={timeWindow}
        dimensions={result.dimensionScores.map((dimension) => dimension.dimension)}
        selectedDimension={selectedScore?.dimension ?? selectedDimension}
        categoryValues={selectedScore?.categories.map((category) => category.value) ?? []}
        selectedCategory={selectedCategoryValue}
        predicates={predicates}
        onMode={setExplorerMode}
        onPlanningLens={(next) => setPlanningLens(next as PlanningLens)}
        onActual={(next) => { setActualKey(next); setPredicates([]); }}
        onExpected={(next) => { setExpectedKey(next); setPredicates([]); }}
        onPolarity={(next) => { setMetricPolarity(next); setPredicates([]); }}
        onWindow={(next) => { setTimeWindow(next); setPredicates([]); }}
        onDimension={(next) => { setSelectedDimension(next); setSelectedCategoryValue(''); }}
        onCategory={setSelectedCategoryValue}
        onFocus={() => document.querySelector('.driver-split')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        onDrill={() => selectedScore && selectedCategoryValue && drill([{ dimension: selectedScore.dimension, value: selectedCategoryValue }])}
        onCombinations={() => { setShowCombinations(true); window.setTimeout(() => document.getElementById('combined-drivers')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }}
        onHierarchy={() => { setShowHierarchy(true); window.setTimeout(() => document.getElementById('hierarchy-data-explorer')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }}
        onReset={() => { setPredicates([]); setSelectedCategoryValue(''); }}
      />

      {(qualityReport.blockers > 0 || qualityReport.warnings > 0)"""
    text = text.replace(banner_marker, toolbar, 1)
metric_marker = "      <section className=\"executive-metrics\">"
if 'id="hierarchy-data-explorer"' not in text:
    require(metric_marker in text, 'Executive metrics marker not found')
    hierarchy = """      <details id="hierarchy-data-explorer" className="hierarchy-data-details" open={showHierarchy} onToggle={(event) => setShowHierarchy(event.currentTarget.open)}>
        <summary><span>Hierarchy explorer</span><strong>Map parent-child columns and open the animated arc tree</strong></summary>
        <HierarchyDataExplorer rows={analysisRows} />
      </details>

"""
    text = text.replace(metric_marker, hierarchy + metric_marker, 1)
text = text.replace("<ContributionBars score={selectedScore} onDrill={(predicate) => drill([predicate])} />", "<ContributionBars score={selectedScore} onDrill={(predicate) => { setSelectedDimension(predicate.dimension); setSelectedCategoryValue(predicate.value); }} />")
text = text.replace('<details className="more-analysis"><summary>More analysis</summary>', '<details className="more-analysis" open={showCombinations} onToggle={(event) => setShowCombinations(event.currentTarget.open)}><summary>More analysis</summary>')
text = text.replace('<Panel title="Combined patterns" subtitle="Groups where several characteristics appear together inside the selected finance window."><InteractionList interactions={result.interactions} onDrill={drill} /></Panel>', '<Panel title="Combined drivers" subtitle="Values that become important when they occur together inside the selected finance window."><CombinationExplorer interactions={result.interactions} onDrill={drill} /></Panel>')
app.write_text(text)

Path('docs/arc-explorer-phase-one.md').write_text("""# Arc explorer and simplified exploration controls

This release keeps the product centered on direct data exploration.

- One compact exploration bar owns scope, dimension, category, focus, drill, combined-driver, hierarchy, and reset actions.
- Basic mode exposes only business selections; Advanced mode adds metric and comparison settings.
- The hierarchy arc is an animated visual tree, not a machine-learning decision tree.
- Parent-child exploration remains optional and is enabled only when node and parent columns are present or explicitly mapped.
- Leaf commentary always starts with deterministic evidence. A configured local Ollama model can add concise narrative without changing the calculation.
- Combined drivers use an impact-versus-concentration bubble chart and a plain-language selected-path card.
""")
