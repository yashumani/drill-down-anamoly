import type { MetricPolarity, Predicate } from '../types';
import type { TimeWindow } from '../lib/timeIntelligence';
import { InfoTip } from './InfoTip';

export type ExplorerMode = 'basic' | 'advanced';

const humanize = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const windows: Array<{ value: TimeWindow; label: string }> = [
  { value: '90d', label: 'Last 90 days' },
  { value: '13w', label: 'Last 13 weeks' },
  { value: '15m', label: 'Last 15 months' },
  { value: '24m', label: 'Last 24 months' },
  { value: 'mtd', label: 'MTD' },
  { value: 'qtd', label: 'QTD' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all', label: 'All periods' },
];

export function ExplorationControlBar({
  mode, planningLens, planningOptions, numericFields, actualKey, expectedKey, metricPolarity, timeWindow,
  dimensions, selectedDimension, categoryValues, selectedCategory, predicates, onMode, onPlanningLens,
  onActual, onExpected, onPolarity, onWindow, onDimension, onCategory, onFocus, onDrill, onCombinations,
  onHierarchy, onReset,
}: {
  mode: ExplorerMode;
  planningLens: string;
  planningOptions: Array<{ id: string; label: string }>;
  numericFields: string[];
  actualKey: string;
  expectedKey: string;
  metricPolarity: MetricPolarity;
  timeWindow: TimeWindow;
  dimensions: string[];
  selectedDimension: string;
  categoryValues: string[];
  selectedCategory: string;
  predicates: Predicate[];
  onMode: (mode: ExplorerMode) => void;
  onPlanningLens: (value: string) => void;
  onActual: (value: string) => void;
  onExpected: (value: string) => void;
  onPolarity: (value: MetricPolarity) => void;
  onWindow: (value: TimeWindow) => void;
  onDimension: (value: string) => void;
  onCategory: (value: string) => void;
  onFocus: () => void;
  onDrill: () => void;
  onCombinations: () => void;
  onHierarchy: () => void;
  onReset: () => void;
}) {
  const drillPath = predicates.length ? predicates.map((predicate) => `${humanize(predicate.dimension)}: ${predicate.value}`).join(' → ') : 'All data';
  return <section className={`exploration-control-bar ${mode}`} aria-label="Analysis scope controls">
    <div className="exploration-control-intro">
      <span className="deck-kicker">ANALYSIS SCOPE <InfoTip text="Choose one dimension and value, preview the evidence, then drill only when the population change is intentional." label="About the analysis scope" /></span>
      <strong title={drillPath}>{drillPath}</strong>
      <small>Preview does not filter. Drill changes every downstream calculation.</small>
    </div>

    <div className="exploration-mode-toggle" role="group" aria-label="Scope control detail">
      <button type="button" title="Show only the controls needed for normal exploration." className={mode === 'basic' ? 'active' : ''} onClick={() => onMode('basic')}><strong>Basic</strong></button>
      <button type="button" title="Also show metric, comparison, lens, and business-direction settings." className={mode === 'advanced' ? 'active' : ''} onClick={() => onMode('advanced')}><strong>Advanced</strong></button>
    </div>

    <div className="exploration-primary-controls">
      <label><span className="control-label">Explore by <InfoTip text="Select a business dimension such as Region, Product, Channel, Vendor, or Cost Center." label="Explore by" /></span><select value={selectedDimension} onChange={(event) => onDimension(event.target.value)}>{dimensions.map((dimension) => <option key={dimension} value={dimension}>{humanize(dimension)}</option>)}</select></label>
      <label><span className="control-label">Value <InfoTip text="Choose one category inside the selected dimension. Preview changes the visual focus; Drill changes the analytical population." label="Selected value" /></span><select value={selectedCategory} onChange={(event) => onCategory(event.target.value)}><option value="">Choose a value</option>{categoryValues.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label><span className="control-label">Period <InfoTip text="Controls the date population used by both trend and driver analysis." label="Reporting period" /></span><select value={timeWindow} onChange={(event) => onWindow(event.target.value as TimeWindow)}>{windows.map((window) => <option key={window.value} value={window.value}>{window.label}</option>)}</select></label>
    </div>

    {mode === 'advanced' && <div className="exploration-advanced-controls">
      <label><span className="control-label">Finance use case</span><select value={planningLens} onChange={(event) => onPlanningLens(event.target.value)}>{planningOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <label><span className="control-label">Actual measure</span><select value={actualKey} onChange={(event) => onActual(event.target.value)}>{numericFields.map((field) => <option key={field} value={field}>{humanize(field)}</option>)}</select></label>
      <label><span className="control-label">Compare with</span><select value={expectedKey} onChange={(event) => onExpected(event.target.value)}><option value="">Rolling typical value</option>{numericFields.filter((field) => field !== actualKey).map((field) => <option key={field} value={field}>{humanize(field)}</option>)}</select></label>
      <label><span className="control-label">Business direction</span><select value={metricPolarity} onChange={(event) => onPolarity(event.target.value as MetricPolarity)}><option value="higher_is_better">Higher is better</option><option value="lower_is_better">Lower is better</option></select></label>
    </div>}

    <div className="exploration-actions">
      <button type="button" title="Preview this dimension in the driver view without changing the population." className="quiet-button" onClick={onFocus} disabled={!selectedDimension}>Preview</button>
      <button type="button" title="Filter the analysis to the selected value and rescan every remaining business dimension." onClick={onDrill} disabled={!selectedDimension || !selectedCategory}>Drill into value</button>
      <button type="button" title="Remove the current drill path and return to all data in the selected period." className="quiet-button" onClick={onReset} disabled={!predicates.length}>Clear path</button>
      <details className="exploration-view-menu">
        <summary>More views</summary>
        <div>
          <button type="button" onClick={onCombinations}><strong>Combined drivers</strong><span>Values that become important together</span></button>
          <button type="button" onClick={onHierarchy}><strong>Hierarchy explorer</strong><span>Parent-child tree and animated arc</span></button>
        </div>
      </details>
    </div>
  </section>;
}
