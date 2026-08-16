const palettes = [
  { id: 'midnight', label: 'Paper', swatches: ['#f3e5cf', '#b9f126', '#f7bb3d'] },
  { id: 'slate', label: 'Ink', swatches: ['#171717', '#5bc7c1', '#f7bb3d'] },
  { id: 'warm', label: 'Clay', swatches: ['#f2cfb1', '#dc5b51', '#f7bb3d'] },
  { id: 'light', label: 'Mint', swatches: ['#dff2e8', '#b9f126', '#5bc7c1'] },
] as const;

export type PaletteId = typeof palettes[number]['id'];

export function ThemePicker({ value, onChange }: { value: PaletteId; onChange: (value: PaletteId) => void }) {
  return <div className="theme-picker" aria-label="Color palette">
    {palettes.map((palette) => <button
      key={palette.id}
      type="button"
      className={value === palette.id ? 'active' : ''}
      onClick={() => onChange(palette.id)}
      title={palette.label}
      aria-label={`Use ${palette.label} palette`}
    >
      <span className="palette-dots">{palette.swatches.map((color) => <i key={color} style={{ background: color }} />)}</span>
      <span>{palette.label}</span>
    </button>)}
  </div>;
}
