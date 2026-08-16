import { describe, expect, it } from 'vitest';
import { isPaletteId, palettes } from './palettes';

describe('presentation palettes', () => {
  it('provides at least fifteen unique palettes', () => {
    expect(palettes.length).toBeGreaterThanOrEqual(15);
    expect(new Set(palettes.map((palette) => palette.id)).size).toBe(palettes.length);
  });

  it('includes every requested brand-inspired palette', () => {
    const ids = new Set(palettes.map((palette) => palette.id));
    for (const required of ['verizon', 'att', 'tmobile', 'nvidia', 'meta', 'google']) {
      expect(ids.has(required)).toBe(true);
      expect(isPaletteId(required)).toBe(true);
    }
  });

  it('defines three usable swatches for every palette', () => {
    for (const palette of palettes) {
      expect(palette.swatches).toHaveLength(3);
      expect(palette.swatches.every((swatch) => /^#[0-9A-F]{6}$/i.test(swatch))).toBe(true);
    }
  });
});
