import { useState } from 'react';

interface AnalysisJourneyNavProps {
  onOpenQuality: () => void;
  onOpenPresentation: () => void;
}

type JourneyStep = 'overview' | 'trend' | 'drivers' | 'hierarchy' | 'trust' | 'share';

const steps: Array<{ id: JourneyStep; number: string; label: string; helper: string }> = [
  { id: 'overview', number: '01', label: 'Scope', helper: 'Confirm metric and population' },
  { id: 'trend', number: '02', label: 'Detect', helper: 'Find material movement' },
  { id: 'drivers', number: '03', label: 'Explain', helper: 'Rank dimensions and categories' },
  { id: 'hierarchy', number: '04', label: 'Drill', helper: 'Follow parent-child paths' },
  { id: 'trust', number: '05', label: 'Validate', helper: 'Review data readiness' },
  { id: 'share', number: '06', label: 'Share', helper: 'Create management output' },
];

const selectorMap: Record<Exclude<JourneyStep, 'trust' | 'share'>, string[]> = {
  overview: ['.ow-workspace-summary', '.dataset-contract-banner', '.controls'],
  trend: ['.time-series-cockpit', '.time-cockpit', '[aria-label*="time series" i]', '[aria-label*="CFO pulse" i]'],
  drivers: ['.exploration-control-bar', '.driver-landscape', '.dimension-landscape', '[aria-label*="driver" i]'],
  hierarchy: ['.uploaded-hierarchy-explorer', '.hierarchy-arc-shell', '.hierarchy-org-shell', '[aria-label*="hierarchy" i]'],
};

const headingKeywords: Record<Exclude<JourneyStep, 'trust' | 'share'>, string[]> = {
  overview: ['executive', 'overview', 'setup'],
  trend: ['time', 'trend', 'pulse', 'period'],
  drivers: ['driver', 'dimension', 'contribution', 'factor'],
  hierarchy: ['hierarchy', 'org chart', 'arc tree'],
};

function findTarget(step: Exclude<JourneyStep, 'trust' | 'share'>) {
  for (const selector of selectorMap[step]) {
    const match = document.querySelector<HTMLElement>(selector);
    if (match) return match;
  }
  const headings = [...document.querySelectorAll<HTMLElement>('h1,h2,h3,h4')];
  const heading = headings.find((item) => headingKeywords[step].some((keyword) => item.textContent?.toLowerCase().includes(keyword)));
  return heading?.closest<HTMLElement>('section,article') ?? heading ?? null;
}

export function AnalysisJourneyNav({ onOpenQuality, onOpenPresentation }: AnalysisJourneyNavProps) {
  const [active, setActive] = useState<JourneyStep>('overview');

  function activate(step: JourneyStep) {
    setActive(step);
    if (step === 'trust') {
      onOpenQuality();
      return;
    }
    if (step === 'share') {
      onOpenPresentation();
      return;
    }
    const target = findTarget(step);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return <nav className="analysis-journey-nav" aria-label="Anomaly investigation journey">
    <div className="analysis-journey-heading">
      <span>Investigation journey</span>
      <strong>Move from signal to management action.</strong>
    </div>
    <div className="analysis-journey-steps">
      {steps.map((step) => <button
        type="button"
        key={step.id}
        className={active === step.id ? 'active' : ''}
        aria-current={active === step.id ? 'step' : undefined}
        title={step.helper}
        onClick={() => activate(step.id)}
      >
        <span>{step.number}</span>
        <span><strong>{step.label}</strong><small>{step.helper}</small></span>
      </button>)}
    </div>
  </nav>;
}
