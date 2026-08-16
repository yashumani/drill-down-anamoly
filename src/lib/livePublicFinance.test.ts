import { describe, expect, it } from 'vitest';
import {
  LIVE_PUBLIC_DIMENSIONS,
  buildMonthlyBenchmark,
  buildScopeWhere,
  buildSodaUrl,
  escapeSoqlLiteral,
} from './livePublicFinance';

describe('live public finance adapter', () => {
  it('models at least ten finance dimensions', () => {
    expect(LIVE_PUBLIC_DIMENSIONS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(LIVE_PUBLIC_DIMENSIONS.map((dimension) => dimension.field)).size).toBe(LIVE_PUBLIC_DIMENSIONS.length);
  });

  it('builds encoded Socrata aggregate URLs', () => {
    const url = new URL(buildSodaUrl({
      select: 'department_name, sum(dollar_amount) as amount',
      where: "dollar_amount is not null AND department_name = 'Public Works'",
      group: 'department_name',
      order: 'sum(dollar_amount) DESC',
      limit: 8,
    }));
    expect(url.hostname).toBe('controllerdata.lacity.org');
    expect(url.searchParams.get('$select')).toContain('sum(dollar_amount)');
    expect(url.searchParams.get('$where')).toContain("department_name = 'Public Works'");
    expect(url.searchParams.get('$limit')).toBe('8');
  });

  it('escapes apostrophes and only applies approved live filters', () => {
    expect(escapeSoqlLiteral("Mayor's Office")).toBe("Mayor''s Office");
    const where = buildScopeWhere('24m', {
      maxDate: '2026-07-28T00:00:00.000',
      maxFiscalYear: '2027',
    }, { field: 'department_name', value: "Mayor's Office" });
    expect(where).toContain("transaction_date >= '2024-08-01T00:00:00.000'");
    expect(where).toContain("department_name = 'Mayor''s Office'");

    const blocked = buildScopeWhere('all', {
      maxDate: '2026-07-28T00:00:00.000',
      maxFiscalYear: '2027',
    }, { field: 'dollar_amount', value: '0' });
    expect(blocked).not.toContain("dollar_amount = '0'");
  });

  it('creates a lower-is-better rolling spend benchmark and anomaly signal', () => {
    const rows = [100, 102, 98, 101, 99, 103, 100, 180].map((amount, index) => ({
      fiscal_year: 2025,
      fiscal_month_number: index + 1,
      period_start: `2025-${String(index + 1).padStart(2, '0')}-01T00:00:00.000`,
      period_end: `2025-${String(index + 1).padStart(2, '0')}-28T00:00:00.000`,
      amount,
      transactions: 10,
    }));
    const points = buildMonthlyBenchmark(rows, '2025-08-31T00:00:00.000');
    const latest = points.at(-1)!;
    expect(latest.expected).toBeGreaterThan(95);
    expect(latest.expected).toBeLessThan(110);
    expect(latest.variance).toBeGreaterThan(70);
    expect(latest.businessImpact).toBeLessThan(-70);
    expect(['watch', 'critical']).toContain(latest.alertSeverity);
  });
});
