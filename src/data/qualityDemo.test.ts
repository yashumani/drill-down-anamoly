import { describe, expect, it } from 'vitest';
import * as qualityDemo from './qualityDemo';
import { investigate } from '../lib/anomaly';
import { createDatasetSession } from '../lib/datasetSession';
import { filterRowsByTimeWindow } from '../lib/timeWindow';

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/;
const PHONE_PATTERN = /\b(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]\d{3}[-.\s]\d{4}\b/;
const SENSITIVE_FIELD_PATTERN = /(?:e-?mail|ssn|social.?security|phone|telephone|mobile|cell)/i;
const ALLOWED_MASKS = new Set(['[MASKED_EMAIL]', '[MASKED_SSN]', '[MASKED_PHONE]']);

function runMaskedQualityDemo() {
  const rows = qualityDemo.createQualityDemoData();
  const session = createDatasetSession({
    rows,
    source: { kind: 'embedded', name: 'Masked data quality demonstration' },
  });
  const timeField = session.timeCandidates[0]?.field ?? '';
  const timeFields = new Set(session.timeCandidates.map((candidate) => candidate.field));
  const dimensions = session.qualityReport.dimensionCandidates.filter((field) => !timeFields.has(field));
  const scopedRows = filterRowsByTimeWindow(
    rows,
    timeField,
    '15m',
    session.defaults.fiscalYearStartMonth,
  );
  const investigation = investigate(
    scopedRows,
    dimensions,
    session.defaults.actualKey,
    session.defaults.expectedKey || undefined,
    [],
    session.defaults.metricPolarity,
    { aggregationMethod: session.defaults.aggregation, timeField },
  );

  return { rows, session, timeField, dimensions, scopedRows, investigation };
}

describe('masked data quality demonstration', () => {
  it('contains only the explicit email mask and no raw email, SSN, or phone values', () => {
    const { rows } = runMaskedQualityDemo();
    const populatedEmails = rows
      .map((row) => row.customerEmail)
      .filter((value): value is string => typeof value === 'string');
    const sensitiveNamedValues = rows.flatMap((row) => Object.entries(row)
      .filter(([field, value]) => SENSITIVE_FIELD_PATTERN.test(field) && value !== null && value !== undefined)
      .map(([field, value]) => ({ field, value })));
    const serializedRows = JSON.stringify(rows);

    expect(populatedEmails).toHaveLength(49);
    expect(new Set(populatedEmails)).toEqual(new Set(['[MASKED_EMAIL]']));
    expect(sensitiveNamedValues.length).toBeGreaterThan(0);
    expect(sensitiveNamedValues.every(({ value }) => typeof value === 'string' && ALLOWED_MASKS.has(value))).toBe(true);
    expect(serializedRows).not.toMatch(EMAIL_PATTERN);
    expect(serializedRows).not.toMatch(SSN_PATTERN);
    expect(serializedRows).not.toMatch(PHONE_PATTERN);
  });

  it('keeps sensitive and identifier fields out of candidate dimensions and blocks analysis', () => {
    const { session, dimensions } = runMaskedQualityDemo();

    expect(session.qualityReport.sensitiveColumns).toContain('customerEmail');
    expect(session.qualityReport.identifierCandidates).toContain('recordId');
    const ineligibleDimensions = new Set([
      ...session.qualityReport.sensitiveColumns,
      ...session.qualityReport.identifierCandidates,
    ]);
    expect(dimensions.filter((field) => ineligibleDimensions.has(field))).toEqual([]);
    expect(session.qualityReport.analysisReady).toBe(false);
  });

  it('repeats the same 15-month investigation with measured row and run evidence', () => {
    const first = runMaskedQualityDemo();
    const second = runMaskedQualityDemo();
    const summarize = (demo: ReturnType<typeof runMaskedQualityDemo>) => ({
      rowCount: demo.rows.length,
      contentHash: demo.session.contentHash,
      timeField: demo.timeField,
      scopedRows: demo.scopedRows.length,
      validRows: demo.investigation.validRowCount,
      excludedRows: demo.investigation.excludedMeasureRows,
      dimensionsScanned: demo.investigation.dimensionsScanned,
      actual: Number(demo.investigation.actual.toFixed(2)),
      expected: demo.investigation.expected,
      runId: demo.investigation.runId,
      warnings: demo.investigation.warnings,
    });

    expect(first.rows).toEqual(second.rows);
    expect(summarize(first)).toEqual(summarize(second));
    expect(summarize(first)).toEqual({
      rowCount: 910,
      contentHash: '45068c7a',
      timeField: 'month',
      scopedRows: 547,
      validRows: 540,
      excludedRows: 7,
      dimensionsScanned: 30,
      actual: 599432.39,
      expected: 602183,
      runId: 'drv-4263bbb0',
      warnings: [
        '7 rows were excluded because the selected measure or comparison was missing or not numeric, or because they were outside the selected period-end population.',
      ],
    });
  });

  it('publishes stable masked-demo labels for the source and action', () => {
    const labels = qualityDemo as unknown as Record<string, unknown>;

    expect(labels.QUALITY_DEMO_SOURCE_LABEL).toBe('Masked data quality demonstration');
    expect(labels.QUALITY_DEMO_ACTION_LABEL).toBe('Masked quality-issue demo');
  });
});
