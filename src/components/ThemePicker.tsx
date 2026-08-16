import { useRef } from 'react';
import { isPaletteId, paletteById, palettes } from '../data/palettes';
import type { PaletteGroup, PaletteId } from '../data/palettes';

export type { PaletteId } from '../data/palettes';
export { isPaletteId } from '../data/palettes';

const groups: PaletteGroup[] = ['Editorial', 'Brand-inspired', 'Executive'];

export function ThemePicker({ value, onChange }: { value: PaletteId; onChange: (value: PaletteId) => void }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const current = paletteById(value);

  function choose(id: string) {
    if (!isPaletteId(id)) return;
    onChange(id);
    detailsRef.current?.removeAttribute('open');
  }

  return <details ref={detailsRef} className="theme-picker-menu">
    <summary aria-label={`Current color theme: ${current.label}`}>
      <span className="theme-picker-copy"><small>Theme</small><strong>{current.label}</strong></span>
      <span className="palette-dots" aria-hidden="true">{current.swatches.map((color) => <i key={color} style={{ background: color }} />)}</span>
      <span className="theme-picker-chevron" aria-hidden="true">⌄</span>
    </summary>
    <div className="theme-picker-popover" role="dialog" aria-label="Choose a dashboard color theme">
      <div className="theme-picker-heading"><div><strong>Choose a presentation theme</strong><span>18 curated palettes for executive reviews, demos, and brand-aligned showcases.</span></div><button type="button" onClick={() => detailsRef.current?.removeAttribute('open')} aria-label="Close theme picker">×</button></div>
      {groups.map((group) => <section key={group} className="theme-group">
        <h4>{group}</h4>
        <div className="theme-grid">{palettes.filter((palette) => palette.group === group).map((palette) => <button
          key={palette.id}
          type="button"
          className={value === palette.id ? 'active' : ''}
          onClick={() => choose(palette.id)}
          title={palette.description}
          aria-pressed={value === palette.id}
        >
          <span className="palette-dots" aria-hidden="true">{palette.swatches.map((color) => <i key={color} style={{ background: color }} />)}</span>
          <span><strong>{palette.label}</strong><small>{palette.description}</small></span>
        </button>)}</div>
      </section>)}
      <p className="theme-trademark-note">Brand-inspired palettes use recognizable color families only. They do not use company logos and do not imply endorsement or affiliation.</p>
    </div>
  </details>;
}
