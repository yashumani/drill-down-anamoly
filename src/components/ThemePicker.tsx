const palettes = [
  { id: 'midnight', label: 'Midnight', swatches: ['#07101d', '#70ddff', '#61e5ab'] },
  { id: 'slate', label: 'Slate', swatches: ['#15191f', '#9cc4ff', '#9ee6b4'] },
  { id: 'warm', label: 'Warm', swatches: ['#18130f', '#ffbd70', '#9de0bd'] },
  { id: 'light', label: 'Light', swatches: ['#f5f7fa', '#2463eb', '#138a63'] },
] as const;

export type PaletteId = typeof palettes[number]['id'];

export function ThemePicker({ value, onChange }: { value: PaletteId; onChange: (value: PaletteId) => void }) {
  return <div className="theme-picker" aria-label="Color palette">
    {palettes.map((p) => <button key={p.id} type="button" className={value === p.id ? 'active' : ''} onClick={() => onChange(p.id)} title={p.label} aria-label={`Use ${p.label} palette`}>
      <span className="palette-dots">{p.swatches.map((c) => <i key={c} style={{ background: c }} />)}</span><span>{p.label}</span>
    </button>)}
  </div>;
}
