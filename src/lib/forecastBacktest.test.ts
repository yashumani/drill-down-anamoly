import { describe, expect, it } from 'vitest';
import { backtestBaselineForecasts } from './forecastBacktest';

function stableSeries(length: number) {
  return Array.from({ length }, (_, index) => ({
    key: String(index + 1),
    label: `P${index + 1}`,
    actual: 100 + (index % 3 - 1) * 2,
  }));
}

describe('forecast baseline backtesting', () => {
  it('selects a champion from out-of-sample folds and returns an interval', () => {
    const result = backtestBaselineForecasts(stableSeries(24));
    expect(result.champion).not.toBeNull();
    expect(result.evaluatedPeriods).toBeGreaterThanOrEqual(4);
    expect(result.nextForecast).toBeGreaterThan(90);
    expect(result.nextForecast).toBeLessThan(110);
    expect(result.predictionInterval80).not.toBeNull();
    expect(result.scores.some((score) => score.eligible)).toBe(true);
  });

  it('does not pretend sparse history supports a forecast', () => {
    const result = backtestBaselineForecasts(stableSeries(7));
    expect(result.status).toBe('insufficient');
    expect(result.champion).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
