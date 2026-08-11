import Papa from 'papaparse';
import type { DataRow } from '../types';

function coerce(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const text = String(value).trim();
  if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true';
  const number = Number(text.replace(/[$,%]/g, ''));
  if (Number.isFinite(number) && text !== '') return number;
  return text;
}

export async function parseDataFile(file: File): Promise<DataRow[]> {
  const text = await file.text();
  if (file.name.toLowerCase().endsWith('.json')) {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : parsed.data;
    if (!Array.isArray(rows)) throw new Error('JSON must be an array of objects or { data: [...] }.');
    return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, coerce(v)])));
  }
  const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) throw new Error(parsed.errors[0].message);
  return parsed.data.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, coerce(v)])));
}
