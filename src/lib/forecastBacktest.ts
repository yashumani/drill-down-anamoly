export type BaselineForecastModel = 'naive_last' | 'rolling_median_3' | 'rolling_median_6' | 'seasonal_naive_12';

export interface ForecastObservation {
  key: string;
  label: string;
  actual: number;
}

export interface ForecastFold {
  model: BaselineForecastModel;
  key: string;
  label: string;
  actual: number;
  forecast: number;
  error: number;
  absoluteError: number;
}

export interface ForecastModelScore {
  model: BaselineForecastModel;
  folds: number;
  mae: number;
  wape: number | null;
  bias: number | null;
  residualScale: number;
  eligible: boolean;
  warnings: string[];
}

export interface ForecastBacktestResult {
  calculationVersion: 'forecast-backtest-v1';
  champion: BaselineForecastModel | null;
  scores: ForecastModelScore[];
  nextForecast: number | null;
  predictionInterval80: { lower: number; upper: number } | null;
  historyPeriods: number;
  evaluatedPeriods: number;
  status: 'ready' | 'watch' | 'insufficient';
  warnings: string[];
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values: number[], probability: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = Math.max(0, Math.min(sorted.length - 1, probability * (sorted.length - 1)));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function forecast(model: BaselineForecastModel, history: number[]) {
  if (!history.length) return null;
  if (model === 'naive_last') return history.at(-1) ?? null;
  if (model === 'rolling_median_3') return history.length >= 3 ? median(history.slice(-3)) : null;
  if (model === 'rolling_median_6') return history.length >= 6 ? median(history.slice(-6)) : null;
  return history.length >= 12 ? history.at(-12) ?? null : null;
}

function scoreModel(model: BaselineForecastModel, observations: ForecastObservation[], minimumTrainPeriods: number) {
  const folds: ForecastFold[] = [];
  for (let index = minimumTrainPeriods; index < observations.length; index += 1) {
    const predicted = forecast(model, observations.slice(0, index).map((item) => item.actual));
    if (predicted === null || !Number.isFinite(predicted)) continue;
    const observation = observations[index];
    const error = predicted - observation.actual;
    folds.push({
      model,
      key: observation.key,
      label: observation.label,
      actual: observation.actual,
      forecast: predicted,
      error,
      absoluteError: Math.abs(error),
    });
  }
  const warnings: string[] = [];
  if (model === 'seasonal_naive_12' && observations.length < 18) warnings.push('At least 18 periods are recommended before comparing a 12-period seasonal baseline.');
  if (folds.length < 4) warnings.push('Fewer than four out-of-sample forecast folds are available.');
  const actualDenominator = folds.reduce((sum, item) => sum + Math.abs(item.actual), 0);
  const absoluteError = folds.reduce((sum, item) => sum + item.absoluteError, 0);
  const signedError = folds.reduce((sum, item) => sum + item.error, 0);
  const residuals = folds.map((item) => item.error);
  const center = median(residuals);
  const mad = median(residuals.map((value) => Math.abs(value - center)));
  return {
    model,
    folds: folds.length,
    mae: folds.length ? absoluteError / folds.length : Number.POSITIVE_INFINITY,
    wape: actualDenominator ? absoluteError / actualDenominator : null,
    bias: actualDenominator ? signedError / actualDenominator : null,
    residualScale: mad * 1.4826,
    eligible: folds.length >= 4,
    warnings,
    rawFolds: folds,
  };
}

export function backtestBaselineForecasts(
  input: ForecastObservation[],
  options: { minimumTrainPeriods?: number } = {},
): ForecastBacktestResult {
  const observations = input.filter((item) => Number.isFinite(item.actual));
  const minimumTrainPeriods = Math.max(3, options.minimumTrainPeriods ?? 6);
  const models: BaselineForecastModel[] = ['naive_last', 'rolling_median_3', 'rolling_median_6', 'seasonal_naive_12'];
  const evaluated = models.map((model) => scoreModel(model, observations, minimumTrainPeriods));
  const championScore = evaluated
    .filter((item) => item.eligible && item.wape !== null)
    .sort((left, right) => (left.wape ?? Number.POSITIVE_INFINITY) - (right.wape ?? Number.POSITIVE_INFINITY))[0] ?? null;
  const champion = championScore?.model ?? null;
  const nextForecast = champion ? forecast(champion, observations.map((item) => item.actual)) : null;
  const championResiduals = championScore?.rawFolds.map((item) => item.error) ?? [];
  const interval = nextForecast === null || championResiduals.length < 4
    ? null
    : {
        lower: nextForecast - percentile(championResiduals, 0.9),
        upper: nextForecast - percentile(championResiduals, 0.1),
      };
  const warnings: string[] = [];
  if (observations.length < minimumTrainPeriods + 4) warnings.push('History is too short for a stable out-of-sample comparison.');
  if (!champion) warnings.push('No baseline model produced at least four valid backtest folds.');
  if (championScore?.wape !== null && championScore && championScore.wape > 0.3) warnings.push('Champion WAPE exceeds 30%; forecast quality is weak.');
  if (championScore?.bias !== null && championScore && Math.abs(championScore.bias) > 0.1) warnings.push('Champion absolute bias exceeds 10%.');
  const status: ForecastBacktestResult['status'] = !champion
    ? 'insufficient'
    : warnings.some((warning) => /weak|bias|short/i.test(warning))
      ? 'watch'
      : 'ready';

  return {
    calculationVersion: 'forecast-backtest-v1',
    champion,
    scores: evaluated.map(({ rawFolds: _rawFolds, ...score }) => score),
    nextForecast,
    predictionInterval80: interval,
    historyPeriods: observations.length,
    evaluatedPeriods: championScore?.folds ?? 0,
    status,
    warnings,
  };
}
