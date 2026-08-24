import { useId } from 'react';

export function InfoTip({ text, label = 'More information', side = 'top' }: {
  text: string;
  label?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  const tooltipId = useId();
  return <span className={`info-tip info-tip-${side}`}>
    <span
      className="info-tip-trigger"
      tabIndex={0}
      role="button"
      aria-label={`${label}. ${text}`}
      aria-describedby={tooltipId}
    >i</span>
    <span id={tooltipId} role="tooltip" className="info-tip-popover">{text}</span>
  </span>;
}
