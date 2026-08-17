import { describe, expect, it } from 'vitest';
import { parseTimeValue } from './timeIntelligence';

describe('strict finance date parsing', () => {
  it('preserves every two-digit day instead of truncating it', () => {
    expect(parseTimeValue('2025-01-10')?.date.toISOString().slice(0, 10)).toBe('2025-01-10');
    expect(parseTimeValue('2025-01-31')?.date.toISOString().slice(0, 10)).toBe('2025-01-31');
    expect(parseTimeValue('2024-02-29')?.date.toISOString().slice(0, 10)).toBe('2024-02-29');
  });

  it('rejects impossible calendar dates', () => {
    expect(parseTimeValue('2025-02-29')).toBeNull();
    expect(parseTimeValue('2025-04-31')).toBeNull();
  });
});
