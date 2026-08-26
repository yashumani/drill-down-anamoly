import type { Predicate } from '../types';

export type AdvancedStage = 'scope' | 'detect' | 'explain' | 'validate' | 'share';

export const advancedStages: Array<{
  id: AdvancedStage;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  { id: 'scope', label: 'Scope', shortLabel: 'Set scope', description: 'Choose the metric, period, dimension, and population.' },
  { id: 'detect', label: 'Detect', shortLabel: 'Find movement', description: 'Review the trend, materiality, and unusual periods.' },
  { id: 'explain', label: 'Explain', shortLabel: 'Find drivers', description: 'Inspect single drivers, combinations, and hierarchy branches.' },
  { id: 'validate', label: 'Validate', shortLabel: 'Test the why', description: 'Check data readiness and evaluate business or external context.' },
  { id: 'share', label: 'Share', shortLabel: 'Communicate', description: 'Create a slide, ask the finance guide, or export evidence.' },
];

export function advancedStageIndex(stage: AdvancedStage) {
  return advancedStages.findIndex((item) => item.id === stage);
}

export function nextAdvancedStage(stage: AdvancedStage): AdvancedStage {
  const index = advancedStageIndex(stage);
  return advancedStages[Math.min(advancedStages.length - 1, index + 1)].id;
}

export function previousAdvancedStage(stage: AdvancedStage): AdvancedStage {
  const index = advancedStageIndex(stage);
  return advancedStages[Math.max(0, index - 1)].id;
}

const humanize = (value: string) => value
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[_.-]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

export function AdvancedJourneyNav({
  stage,
  predicates,
  periodLabel,
  metricName,
  onStage,
}: {
  stage: AdvancedStage;
  predicates: Predicate[];
  periodLabel: string;
  metricName: string;
  onStage: (stage: AdvancedStage) => void;
}) {
  const activeIndex = advancedStageIndex(stage);
  const path = predicates.length
    ? predicates.map((predicate) => `${humanize(predicate.dimension)} = ${predicate.value}`).join(' → ')
    : 'All data';

  return <section className="analysis-journey" aria-label="Anomaly investigation workflow">
    <div className="analysis-journey-heading">
      <div>
        <span>Investigation workflow</span>
        <strong>Scope → Detect → Explain → Validate → Share</strong>
      </div>
      <div className="analysis-journey-context" aria-label="Current investigation context">
        <span>{metricName}</span>
        <span>{periodLabel}</span>
        <span title={path}>{path}</span>
      </div>
    </div>
    <nav className="analysis-journey-steps" aria-label="Advanced analysis stages">
      {advancedStages.map((item, index) => <button
        type="button"
        key={item.id}
        className={stage === item.id ? 'active' : index < activeIndex ? 'complete' : ''}
        onClick={() => onStage(item.id)}
        aria-current={stage === item.id ? 'step' : undefined}
        title={item.description}
      >
        <span>{String(index + 1).padStart(2, '0')}</span>
        <strong>{item.label}</strong>
        <small>{item.shortLabel}</small>
      </button>)}
    </nav>
  </section>;
}

export function AdvancedStageFooter({
  stage,
  onStage,
}: {
  stage: AdvancedStage;
  onStage: (stage: AdvancedStage) => void;
}) {
  const index = advancedStageIndex(stage);
  const previous = advancedStages[index - 1];
  const next = advancedStages[index + 1];
  return <footer className="analysis-stage-footer">
    <button type="button" className="quiet-button" disabled={!previous} onClick={() => previous && onStage(previous.id)}>
      {previous ? `← ${previous.label}` : 'Start'}
    </button>
    <div>
      <strong>{advancedStages[index]?.label}</strong>
      <span>Step {index + 1} of {advancedStages.length}</span>
    </div>
    <button type="button" disabled={!next} onClick={() => next && onStage(next.id)}>
      {next ? `${next.label} →` : 'Complete'}
    </button>
  </footer>;
}
