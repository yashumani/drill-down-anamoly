import { useEffect, useId, useRef, useState } from 'react';

const INFO_TIP_OPEN_EVENT = 'fpa-info-tip-open';

export function InfoTip({ text, label = 'More information', side = 'top' }: {
  text: string;
  label?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  const tooltipId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const closeWhenAnotherTipOpens = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail !== tooltipId) setOpen(false);
    };
    document.addEventListener(INFO_TIP_OPEN_EVENT, closeWhenAnotherTipOpens as EventListener);
    return () => document.removeEventListener(INFO_TIP_OPEN_EVENT, closeWhenAnotherTipOpens as EventListener);
  }, [tooltipId]);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  function toggleTip() {
    setOpen((current) => {
      const next = !current;
      if (next) document.dispatchEvent(new CustomEvent<string>(INFO_TIP_OPEN_EVENT, { detail: tooltipId }));
      return next;
    });
  }

  return <span
    ref={rootRef}
    className={`info-tip info-tip-${side}`}
    data-open={open ? 'true' : 'false'}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}
  >
    <button
      ref={triggerRef}
      type="button"
      className="info-tip-trigger"
      aria-label={`${label}. ${open ? 'Close help' : 'Open help'}.`}
      aria-expanded={open}
      aria-controls={tooltipId}
      aria-describedby={tooltipId}
      onClick={toggleTip}
    >i</button>
    <span id={tooltipId} role="tooltip" className="info-tip-popover" aria-hidden={!open}>{text}</span>
  </span>;
}
