export type LayoutMode = 'phone' | 'tablet' | 'desktop';

export const PHONE_LAYOUT_MAX_WIDTH = 640;
export const TABLET_LAYOUT_MAX_WIDTH = 1024;

export function layoutModeForWidth(width: number): LayoutMode {
  const normalized = Number.isFinite(width) && width > 0 ? width : TABLET_LAYOUT_MAX_WIDTH + 1;
  if (normalized <= PHONE_LAYOUT_MAX_WIDTH) return 'phone';
  if (normalized <= TABLET_LAYOUT_MAX_WIDTH) return 'tablet';
  return 'desktop';
}
