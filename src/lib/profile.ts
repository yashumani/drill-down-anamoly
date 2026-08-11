import type { DataRow, FieldProfile } from '../types';

const DATE_RE = /^\d{4}[-/]\d{1,2}([-/]\d{1,2})?$/;

export function profileFields(rows: DataRow[]): FieldProfile[] {
  if (!rows.length) return [];
  const keys = Object.keys(rows[0]);
  return keys.map((name) => {
    const values = rows.map((r) => r[name]).filter((v) => v !== null && v !== undefined && v !== '');
    const distinctCount = new Set(values.map(String)).size;
    const nullCount = rows.length - values.length;
    const numericCount = values.filter((v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)))).length;
    const booleanCount = values.filter((v) => typeof v === 'boolean' || v === 'true' || v === 'false').length;
    const dateCount = values.filter((v) => typeof v === 'string' && DATE_RE.test(v)).length;
    let kind: FieldProfile['kind'] = 'categorical';
    if (values.length && numericCount / values.length > 0.95) kind = 'numeric';
    else if (values.length && booleanCount / values.length > 0.95) kind = 'boolean';
    else if (values.length && dateCount / values.length > 0.9) kind = 'date';
    else if (distinctCount / Math.max(rows.length, 1) > 0.92) kind = 'identifier';
    return { name, kind, distinctCount, nullCount };
  });
}
