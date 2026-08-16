import type { DataRow } from '../types';
import { parseTimeValue } from './timeIntelligence';
import type { TimeWindow } from './timeIntelligence';

const DAY_MS = 86_400_000;

function fiscalYearStart(date: Date, fiscalYearStartMonth: number) {
  const month = Math.max(1, Math.min(12, fiscalYearStartMonth)) - 1;
  const year = date.getUTCMonth() >= month ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return new Date(Date.UTC(year, month, 1));
}

function fiscalQuarterStart(date: Date, fiscalYearStartMonth: number) {
  const yearStart = fiscalYearStart(date, fiscalYearStartMonth);
  const monthsSinceStart = (date.getUTCFullYear() - yearStart.getUTCFullYear()) * 12 + date.getUTCMonth() - yearStart.getUTCMonth();
  const output = new Date(yearStart);
  output.setUTCMonth(yearStart.getUTCMonth() + Math.floor(monthsSinceStart / 3) * 3);
  return output;
}

function cutoffFor(latest: Date, window: TimeWindow, fiscalYearStartMonth: number) {
  if (window === 'all') return new Date(-8_640_000_000_000_000);
  if (window === 'mtd') return new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth(), 1));
  if (window === 'qtd') return fiscalQuarterStart(latest, fiscalYearStartMonth);
  if (window === 'ytd') return fiscalYearStart(latest, fiscalYearStartMonth);
  const cutoff = new Date(latest);
  if (window === '90d') cutoff.setTime(cutoff.getTime() - 89 * DAY_MS);
  if (window === '8w') cutoff.setTime(cutoff.getTime() - 7 * 7 * DAY_MS);
  if (window === '13w') cutoff.setTime(cutoff.getTime() - 12 * 7 * DAY_MS);
  if (window === '15m') cutoff.setUTCMonth(cutoff.getUTCMonth() - 14, 1);
  if (window === '24m') cutoff.setUTCMonth(cutoff.getUTCMonth() - 23, 1);
  return cutoff;
}

export function filterRowsByTimeWindow(rows: DataRow[], timeField: string, window: TimeWindow, fiscalYearStartMonth = 1) {
  if (!timeField || window === 'all') return rows;
  const parsed = rows.map((row) => ({ row, parsed: parseTimeValue(row[timeField]) }));
  const validDates = parsed.filter((item) => item.parsed).map((item) => item.parsed!.date.getTime());
  if (!validDates.length) return rows;
  const latest = new Date(Math.max(...validDates));
  const cutoff = cutoffFor(latest, window, fiscalYearStartMonth).getTime();
  return parsed.filter((item) => item.parsed && item.parsed.date.getTime() >= cutoff).map((item) => item.row);
}
