import Papa from 'papaparse';
import type { DataRow } from '../types';
import { normalizeFinanceDataRows } from './financeDataContract';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_BROWSER_ROWS = 100_000;

function coerce(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'object') return JSON.stringify(value);

  const text = String(value).replace(/^\uFEFF/, '').trim();
  if (!text) return null;
  if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true';

  // Preserve common identifier forms such as ZIP codes, account numbers, and values
  // that would lose precision if converted to JavaScript numbers.
  const unsignedDigits = text.replace(/^[+-]/, '');
  if (/^0\d+$/.test(unsignedDigits) || /^\d{16,}$/.test(unsignedDigits)) return text;

  const isPercent = /^\(?[-+]?[$€£¥]?\s*[\d,.]+(?:\.\d+)?%\)?$/.test(text);
  const isFormattedNumber = /^\(?[-+]?[$€£¥]?\s*[\d,.]+(?:\.\d+)?\)?$/.test(text);
  if (isPercent || isFormattedNumber) {
    const negativeByParentheses = text.startsWith('(') && text.endsWith(')');
    const normalized = text.replace(/[()$€£¥,%\s]/g, '');
    const number = Number(normalized);
    if (Number.isFinite(number)) {
      const signed = negativeByParentheses ? -Math.abs(number) : number;
      return isPercent ? signed / 100 : signed;
    }
  }

  return text;
}

function flattenRecord(input: unknown, prefix = '', depth = 0): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return prefix ? { [prefix]: input } : {};
  const output: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(input as Record<string, unknown>)) {
    const key = String(rawKey).replace(/^\uFEFF/, '').trim();
    if (!key) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value) && depth < 2) {
      Object.assign(output, flattenRecord(value, path, depth + 1));
    } else {
      output[path] = value;
    }
  }
  return output;
}

function normalizeRows(rows: unknown[]): DataRow[] {
  if (rows.length > MAX_BROWSER_ROWS) {
    throw new Error(`This browser demo supports up to ${MAX_BROWSER_ROWS.toLocaleString()} rows. Use a backend profiling service for larger datasets.`);
  }
  return rows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`Row ${index + 1} is not an object. JSON and CSV records must be tabular objects.`);
    }
    const flat = flattenRecord(row);
    return Object.fromEntries(Object.entries(flat).map(([key, value]) => [key, coerce(value)])) as DataRow;
  });
}

function applyFinanceContract(rows: DataRow[]) {
  const normalized = normalizeFinanceDataRows(rows);
  if (normalized.report.errors.length) {
    throw new Error(`Finance Data Contract v${normalized.report.version}: ${normalized.report.errors.join(' ')}`);
  }
  return normalized.rows;
}

export async function parseDataFile(file: File): Promise<DataRow[]> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB. The public browser demo accepts files up to 25 MB.`);
  }

  const text = (await file.text()).replace(/^\uFEFF/, '');
  if (file.name.toLowerCase().endsWith('.json')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const rows = Array.isArray(parsed) ? parsed : (parsed as { data?: unknown })?.data;
    if (!Array.isArray(rows)) throw new Error('JSON must be an array of objects or an object shaped like { data: [...] }.');
    return applyFinanceContract(normalizeRows(rows));
  }

  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.replace(/^\uFEFF/, '').trim(),
  });
  if (parsed.errors.length) {
    const details = parsed.errors.slice(0, 3).map((error) => `row ${error.row ?? '?'}: ${error.message}`).join('; ');
    throw new Error(`CSV parsing found ${parsed.errors.length} issue(s): ${details}`);
  }
  if (!parsed.meta.fields?.length) throw new Error('CSV needs a header row with at least one named column.');
  const duplicateHeaders = parsed.meta.fields.filter((field, index, fields) => fields.indexOf(field) !== index);
  if (duplicateHeaders.length) throw new Error(`CSV contains duplicate header names: ${[...new Set(duplicateHeaders)].join(', ')}.`);
  return applyFinanceContract(normalizeRows(parsed.data));
}
