import { describe, expect, it } from 'vitest';
import type { DataRow } from '../types';
import { analyzeDataQuality } from './dataQuality';

describe('data quality engine', () => {
  it('profiles the union of fields across sparse records', () => {
    const rows: DataRow[] = [
      { actual: 100, region: 'West' },
      { actual: 110, region: 'East', optionalField: 'present later' },
    ];
    const report = analyzeDataQuality(rows);
    expect(report.columns.map((column) => column.name)).toContain('optionalField');
    expect(report.raggedRows).toBeGreaterThan(0);
  });

  it('detects exact duplicate rows', () => {
    const row: DataRow = { actual: 100, target: 95, region: 'West' };
    const report = analyzeDataQuality([row, { ...row }, { actual: 105, target: 95, region: 'East' }]);
    expect(report.duplicateRows).toBe(1);
    expect(report.issues.some((issue) => issue.title === 'Duplicate rows')).toBe(true);
  });

  it('flags obvious sensitive fields without exposing raw values', () => {
    const report = analyzeDataQuality([
      { actual: 100, target: 90, customerEmail: 'person@example.com', region: 'West' },
      { actual: 105, target: 90, customerEmail: 'other@example.com', region: 'East' },
    ]);
    expect(report.sensitiveColumns).toContain('customerEmail');
    expect(report.columns.find((column) => column.name === 'customerEmail')?.potentialSensitive).toBe(true);
  });
});
