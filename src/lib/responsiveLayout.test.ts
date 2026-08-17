import { describe, expect, it } from 'vitest';
import { layoutModeForWidth } from './responsiveLayout';

describe('responsive layout mode', () => {
  it('uses phone, tablet, and desktop breakpoints deterministically', () => {
    expect(layoutModeForWidth(390)).toBe('phone');
    expect(layoutModeForWidth(640)).toBe('phone');
    expect(layoutModeForWidth(641)).toBe('tablet');
    expect(layoutModeForWidth(1024)).toBe('tablet');
    expect(layoutModeForWidth(1025)).toBe('desktop');
  });

  it('fails safe to desktop for invalid widths', () => {
    expect(layoutModeForWidth(0)).toBe('desktop');
    expect(layoutModeForWidth(Number.NaN)).toBe('desktop');
  });
});
