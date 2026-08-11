import type { DataRow, FieldProfile } from '../types';

function isMissing(value: unknown) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function isNumeric(value: unknown) {
  return typeof value === 'number'
    ? Number.isFinite(value)
    : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
}

function isBoolean(value: unknown) {
  return typeof value === 'boolean' || (typeof value === 'string' && /^(true|false)$/i.test(value.trim()));
}

function isDate(value: unknown) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!text || !/[T/\-:]/.test(text)) return false;
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return false;
  const year = new Date(timestamp).getUTCFullYear();
  return year >= 1900 && year <= 2200;
}

function identifierName(name: string) {
  return /(^id$|(^|_)(id|identifier|record.?id|transaction.?id|customer.?id|account.?id)($|_)|Id$)/i.test(name);
}

export function profileFields(rows: DataRow[]): FieldProfile[] {
  if (!rows.length) return [];
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  return keys.map((name) => {
    const raw = rows.map((row) => row[name]);
    const values = raw.filter((value) => !isMissing(value));
    const distinctCount = new Set(values.map((value) => `${typeof value}:${String(value)}`)).size;
    const nullCount = rows.length - values.length;
    const numericCount = values.filter(isNumeric).length;
    const booleanCount = values.filter(isBoolean).length;
    const dateCount = values.filter(isDate).length;
    const numericRate = numericCount / Math.max(values.length, 1);
    const booleanRate = booleanCount / Math.max(values.length, 1);
    const dateRate = dateCount / Math.max(values.length, 1);
    const uniquenessRate = distinctCount / Math.max(values.length, 1);

    let kind: FieldProfile['kind'] = 'categorical';
    if (identifierName(name) || (values.length > 20 && uniquenessRate >= 0.98 && distinctCount > Math.max(80, rows.length * 0.2))) kind = 'identifier';
    else if (values.length && numericRate >= 0.95) kind = 'numeric';
    else if (values.length && booleanRate >= 0.95) kind = 'boolean';
    else if (values.length && dateRate >= 0.9) kind = 'date';
    else if (values.length > 20 && uniquenessRate >= 0.92) kind = 'identifier';

    return { name, kind, distinctCount, nullCount };
  });
}
