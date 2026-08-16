export type PaletteGroup = 'Editorial' | 'Brand-inspired' | 'Executive';

export interface PaletteDefinition {
  id: string;
  label: string;
  group: PaletteGroup;
  description: string;
  swatches: readonly [string, string, string];
}

export const palettes = [
  { id: 'midnight', label: 'Paper', group: 'Editorial', description: 'Warm editorial paper with lime and amber signals.', swatches: ['#F3E5CF', '#B9F126', '#F7BB3D'] },
  { id: 'slate', label: 'Ink', group: 'Editorial', description: 'Dark presentation room with aqua and amber accents.', swatches: ['#171717', '#5BC7C1', '#F7BB3D'] },
  { id: 'warm', label: 'Clay', group: 'Editorial', description: 'Warm clay, coral, and gold for management reviews.', swatches: ['#F2CFB1', '#DC5B51', '#F7BB3D'] },
  { id: 'light', label: 'Mint', group: 'Editorial', description: 'Fresh mint surfaces with lime and aqua highlights.', swatches: ['#DFF2E8', '#B9F126', '#5BC7C1'] },
  { id: 'verizon', label: 'Verizon', group: 'Brand-inspired', description: 'Crisp white, black, and high-impact red.', swatches: ['#FFFFFF', '#000000', '#EE0000'] },
  { id: 'att', label: 'AT&T', group: 'Brand-inspired', description: 'Clean white, network blue, and deep navy.', swatches: ['#FFFFFF', '#009FDB', '#0057B8'] },
  { id: 'tmobile', label: 'T-Mobile', group: 'Brand-inspired', description: 'Bold magenta, black, and soft white.', swatches: ['#F5F0F4', '#E20074', '#111111'] },
  { id: 'nvidia', label: 'NVIDIA', group: 'Brand-inspired', description: 'Technical black with vivid green signals.', swatches: ['#111111', '#76B900', '#F5F5F5'] },
  { id: 'meta', label: 'Meta', group: 'Brand-inspired', description: 'Bright blue, pale blue, and white.', swatches: ['#FFFFFF', '#0668E1', '#DCEBFF'] },
  { id: 'google', label: 'Google', group: 'Brand-inspired', description: 'White canvas with blue, red, yellow, and green cues.', swatches: ['#FFFFFF', '#4285F4', '#FABB05'] },
  { id: 'cfo-navy', label: 'CFO Navy', group: 'Executive', description: 'Boardroom navy with cyan and gold.', swatches: ['#071B33', '#45C6D4', '#F5B942'] },
  { id: 'emerald', label: 'Emerald', group: 'Executive', description: 'Deep green, mint, and cream for performance reviews.', swatches: ['#073B32', '#29C789', '#F4F1E8'] },
  { id: 'copper', label: 'Copper', group: 'Executive', description: 'Charcoal, copper, and sand for OpEx and CapEx.', swatches: ['#22201F', '#C97842', '#E8D6BD'] },
  { id: 'royal', label: 'Royal', group: 'Executive', description: 'Indigo, electric violet, and pearl.', swatches: ['#17143B', '#6E56CF', '#EEEAFE'] },
  { id: 'solar', label: 'Solar', group: 'Executive', description: 'Graphite with solar yellow and orange.', swatches: ['#202020', '#FFD21F', '#FF7A1A'] },
  { id: 'arctic', label: 'Arctic', group: 'Executive', description: 'Ice white, slate blue, and cyan.', swatches: ['#F4FAFF', '#3D5A80', '#54C7EC'] },
  { id: 'plum', label: 'Plum', group: 'Executive', description: 'Dark plum, orchid, and warm cream.', swatches: ['#2A1731', '#C56CF0', '#F6EBDC'] },
  { id: 'monochrome', label: 'Monochrome', group: 'Executive', description: 'Black, white, and neutral gray for printing and formal reviews.', swatches: ['#F7F7F5', '#111111', '#9A9A94'] },
] as const satisfies readonly PaletteDefinition[];

export type PaletteId = typeof palettes[number]['id'];

const paletteIds = new Set<string>(palettes.map((palette) => palette.id));

export function isPaletteId(value: string | null): value is PaletteId {
  return Boolean(value && paletteIds.has(value));
}

export function paletteById(id: PaletteId) {
  return palettes.find((palette) => palette.id === id) ?? palettes[0];
}
