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
  return <section className={`exploration-control-bar ${mode}`} aria-label="Explore data controls">
    <div className="exploration-control-intro"><span className="deck-kicker">EXPLORE THE DATA <InfoTip text="All exploration filters and actions live here. Choose a dimension, select a category, then preview or drill without searching elsewhere on the page." label="About the exploration controls" /></span><strong>Choose a branch, preview it, then drill only when the result makes sense.</strong><small>Current path: {drillPath}</small></div>
    <div className="exploration-mode-toggle" role="group" aria-label="Exploration experience">
      <button type="button" title="Basic mode shows only the dimension, category, and reporting period needed for normal exploration." className={mode === 'basic' ? 'active' : ''} onClick={() => onMode('basic')}><strong>Basic</strong><span>Dimension + value</span></button>
      <button type="button" title="Advanced mode adds finance lens, measure, comparison, and favorable-direction assumptions." className={mode === 'advanced' ? 'active' : ''} onClick={() => onMode('advanced')}><strong>Advanced</strong><span>Metric + period</span></button>
    </div>
    <div className="exploration-primary-controls">
      <label><span className="control-label">Explore by <InfoTip text="Select the business dimension you want to inspect, such as Region, Product, Channel, Vendor, or Cost Center." label="Explore by" /></span><select value={selectedDimension} onChange={(event) => onDimension(event.target.value)}>{dimensions.map((dimension) => <option key={dimension} value={dimension}>{humanize(dimension)}</option>)}</select></label>
      <label><span className="control-label">Category / branch <InfoTip text="Choose one value inside the selected dimension. Focus previews it; Drill down filters the analytical population to it." label="Category or branch" /></span><select value={selectedCategory} onChange={(event) => onCategory(event.target.value)}><option value="">Choose a value</option>{categoryValues.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label><span className="control-label">Reporting period <InfoTip text="Controls which dates are included in the charts and driver scan. MTD, QTD, and YTD follow the configured fiscal calendar." label="Reporting period" /></span><select value={timeWindow} onChange={(event) => onWindow(event.target.value as TimeWindow)}>{windows.map((window) => <option key={window.value} value={window.value}>{window.label}</option>)}</select></label>
    </div>
    {mode === 'advanced' && <div className="exploration-advanced-controls">
      <label><span className="control-label">Finance use case <InfoTip text="Changes the language and validation prompts used for revenue, OpEx, CapEx, marketing, corporate, or workforce analysis." label="Finance use case" /></span><select value={planningLens} onChange={(event) => onPlanningLens(event.target.value)}>{planningOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <label><span className="control-label">Actual measure <InfoTip text="The observed financial measure being analyzed. The application never lets the LLM recalculate this value." label="Actual measure" /></span><select value={actualKey} onChange={(event) => onActual(event.target.value)}>{numericFields.map((field) => <option key={field} value={field}>{humanize(field)}</option>)}</select></label>
      <label><span className="control-label">Compare with <InfoTip text="The budget, plan, target, or forecast used as the reference. When none is selected, the application uses an explicitly labeled rolling historical baseline." label="Comparison measure" /></span><select value={expectedKey} onChange={(event) => onExpected(event.target.value)}><option value="">Rolling typical value</option>{numericFields.filter((field) => field !== actualKey).map((field) => <option key={field} value={field}>{humanize(field)}</option>)}</select></label>
      <label><span className="control-label">Business direction <InfoTip text="Defines whether a higher value is favorable or unfavorable. Revenue is often higher-is-better; cost, churn, and defects are often lower-is-better." label="Business direction" /></span><select value={metricPolarity} onChange={(event) => onPolarity(event.target.value as MetricPolarity)}><option value="higher_is_better">Higher is better</option><option value="lower_is_better">Lower is better</option></select></label>
    </div>}
    <div className="exploration-actions">
      <button type="button" title="Preview the selected dimension in the driver charts without filtering the underlying population." className="quiet-button" onClick={onFocus} disabled={!selectedDimension}>Focus</button>
      <button type="button" title="Filter the analysis to the selected category and rescan every remaining eligible business dimension." onClick={onDrill} disabled={!selectedDimension || !selectedCategory}>Drill down</button>
      <button type="button" title="Open supported multi-dimensional groups. Bubble position shows concentration and impact; size shows record support." className="exploration-combination-action" onClick={onCombinations}>Combined drivers</button>
      <button type="button" title="Open the animated parent-child hierarchy. It is available only when node and parent columns are present or mapped." className="quiet-button" onClick={onHierarchy}>Hierarchy arc</button>
      <button type="button" title="Return to the complete selected-period population and remove the current drill path." className="quiet-button" onClick={onReset} disabled={!predicates.length}>Reset</button>
    </div>
    <div className="exploration-help-strip" aria-label="Exploration action guide">
      <span><strong>Focus</strong> previews; it does not filter.</span>
      <span><strong>Drill down</strong> changes the population.</span>
      <span><strong>Combined drivers</strong> shows values that matter together.</span>
      <span><strong>Hierarchy arc</strong> follows explicit parent-child relationships.</span>
    </div>
  </section>;
}
