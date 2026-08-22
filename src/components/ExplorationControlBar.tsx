import type { MetricPolarity, Predicate } from '../types';
import type { TimeWindow } from '../lib/timeIntelligence';

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
  return <section className={`exploration-control-bar ${mode}`} aria-label="Explore data controls">
    <div className="exploration-control-intro"><span className="deck-kicker">EXPLORE THE DATA</span><strong>Choose a branch, preview it, then drill only when the result makes sense.</strong><small>Current path: {drillPath}</small></div>
    <div className="exploration-mode-toggle" role="group" aria-label="Exploration experience">
      <button type="button" className={mode === 'basic' ? 'active' : ''} onClick={() => onMode('basic')}><strong>Basic</strong><span>Dimension + value</span></button>
      <button type="button" className={mode === 'advanced' ? 'active' : ''} onClick={() => onMode('advanced')}><strong>Advanced</strong><span>Metric + period</span></button>
    </div>
    <div className="exploration-primary-controls">
      <label>Explore by<select value={selectedDimension} onChange={(event) => onDimension(event.target.value)}>{dimensions.map((dimension) => <option key={dimension} value={dimension}>{humanize(dimension)}</option>)}</select></label>
      <label>Category / branch<select value={selectedCategory} onChange={(event) => onCategory(event.target.value)}><option value="">Choose a value</option>{categoryValues.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Reporting period<select value={timeWindow} onChange={(event) => onWindow(event.target.value as TimeWindow)}>{windows.map((window) => <option key={window.value} value={window.value}>{window.label}</option>)}</select></label>
    </div>
    {mode === 'advanced' && <div className="exploration-advanced-controls">
      <label>Finance use case<select value={planningLens} onChange={(event) => onPlanningLens(event.target.value)}>{planningOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <label>Actual measure<select value={actualKey} onChange={(event) => onActual(event.target.value)}>{numericFields.map((field) => <option key={field} value={field}>{humanize(field)}</option>)}</select></label>
      <label>Compare with<select value={expectedKey} onChange={(event) => onExpected(event.target.value)}><option value="">Rolling typical value</option>{numericFields.filter((field) => field !== actualKey).map((field) => <option key={field} value={field}>{humanize(field)}</option>)}</select></label>
      <label>Business direction<select value={metricPolarity} onChange={(event) => onPolarity(event.target.value as MetricPolarity)}><option value="higher_is_better">Higher is better</option><option value="lower_is_better">Lower is better</option></select></label>
    </div>}
    <div className="exploration-actions">
      <button type="button" className="quiet-button" onClick={onFocus} disabled={!selectedDimension}>Focus</button>
      <button type="button" onClick={onDrill} disabled={!selectedDimension || !selectedCategory}>Drill down</button>
      <button type="button" className="exploration-combination-action" onClick={onCombinations}>Combined drivers</button>
      <button type="button" className="quiet-button" onClick={onHierarchy}>Hierarchy arc</button>
      <button type="button" className="quiet-button" onClick={onReset} disabled={!predicates.length}>Reset</button>
    </div>
    <div className="exploration-help-strip">
      <span><strong>Focus</strong> previews one dimension without changing the population.</span>
      <span><strong>Drill down</strong> filters the population to one branch.</span>
      <span><strong>Combined drivers</strong> finds groups of values that occur together.</span>
      <span><strong>Hierarchy arc</strong> uses explicit parent-child columns when they exist.</span>
    </div>
  </section>;
}
