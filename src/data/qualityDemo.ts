import type { DataRow } from '../types';
import { createSampleData } from './sampleData';

export const QUALITY_DEMO_SOURCE_LABEL = 'Masked data quality demonstration';
export const QUALITY_DEMO_ACTION_LABEL = 'Masked quality-issue demo';

/**
 * Creates an intentionally imperfect, deterministic, synthetic, and masked dataset for
 * demonstrating the Data Quality Explorer. It includes missing values, mixed types,
 * whitespace/case variants, invalid dates, outliers, ragged rows, duplicates, and a
 * sensitive-looking field whose populated values are all an explicit mask token.
 */
export function createQualityDemoData(rows = 900): DataRow[] {
  const base = createSampleData(rows).map((row, index) => {
    const next: DataRow = {
      ...row,
      sourceSystem: 'CRM-DEMO',
      regionCopy: row.region,
      customerEmail: index % 19 === 0 ? '[MASKED_EMAIL]' : null,
      optionalNote: null,
    };

    if (index % 37 === 0) next.market = null;
    if (index % 53 === 0) next.region = ` ${String(next.region).toLowerCase()} `;
    if (index % 61 === 0) next.channel = String(next.channel).toUpperCase();
    if (index % 71 === 0) next.month = index % 142 === 0 ? 'not-a-date' : '2026-13';
    if (index % 89 === 0) next.actual = 'unknown';
    if (index % 113 === 0) next.target = -100;
    if (index % 127 === 0) delete next.offer;
    if (index === 7) next.actual = 250_000;
    if (index === 11) next.units = 0;
    return next;
  });

  // Exact duplicates intentionally violate the expected row grain.
  const duplicates = base.slice(0, 10).map((row) => ({ ...row }));
  return [...base, ...duplicates];
}
