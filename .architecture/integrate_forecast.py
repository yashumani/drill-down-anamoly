from pathlib import Path


def replace_once(path: str, old: str, new: str):
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Expected block not found in {path}: {old[:80]}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "src/lib/evidenceLedger.ts",
    "import type { FinanceTimeSeriesResult } from './timeIntelligence';",
    "import type { FinanceTimeSeriesResult } from './timeIntelligence';\nimport { backtestBaselineForecasts } from './forecastBacktest';",
)
replace_once(
    "src/lib/evidenceLedger.ts",
    "  | 'time-series'\n  | 'driver'",
    "  | 'time-series'\n  | 'forecast-model'\n  | 'driver'",
)
replace_once(
    "src/lib/evidenceLedger.ts",
    "    }));\n  }\n\n  for (const dimension of result.dimensionScores.slice(0, 8)) {",
    """    }));
    const forecast = backtestBaselineForecasts(time.allPoints.map((point) => ({
      key: point.key,
      label: point.label,
      actual: point.actual,
    })));
    items.push(item({
      id: `forecast:${time.runId}`,
      kind: 'forecast-model',
      title: 'Backtested baseline forecast',
      summary: forecast.champion
        ? `${forecast.champion.replaceAll('_', ' ')} selected from ${forecast.evaluatedPeriods} out-of-sample periods; status ${forecast.status}.`
        : `No forecast champion was selected; status ${forecast.status}.`,
      source: 'deterministic-calculation',
      runId: time.runId,
      payload: forecast,
    }));
  }

  for (const dimension of result.dimensionScores.slice(0, 8)) {""",
)

replace_once(
    "src/lib/agentOrchestrator.ts",
    "    explain: ['variance', 'time-series', 'driver', 'quality', 'metric-definition'],\n    time: ['time-series', 'variance', 'metric-definition', 'quality'],",
    "    explain: ['variance', 'time-series', 'forecast-model', 'driver', 'quality', 'metric-definition'],\n    time: ['time-series', 'forecast-model', 'variance', 'metric-definition', 'quality'],",
)

replace_once(
    "src/lib/llm.ts",
    "import type { DatasetSession } from './datasetSession';",
    "import type { DatasetSession } from './datasetSession';\nimport { backtestBaselineForecasts } from './forecastBacktest';",
)
replace_once(
    "src/lib/llm.ts",
    "    modelHealth: time.modelHealth,\n    coverage: time.coverage,",
    """    modelHealth: time.modelHealth,
    forecastBacktest: backtestBaselineForecasts(time.allPoints.map((point) => ({
      key: point.key,
      label: point.label,
      actual: point.actual,
    }))),
    coverage: time.coverage,""",
)
replace_once(
    "src/lib/llm.ts",
    "        'Treat time-series anomaly scores as robust descriptive monitoring unless seasonalityReady is true; never call them a forecast or causal model without supporting evidence.',",
    "        'Treat time-series anomaly scores as robust descriptive monitoring. Call a future-period estimate a forecast only when the supplied forecastBacktest contains a champion selected from out-of-sample folds, and disclose its WAPE, bias, interval, and status.',",
)

replace_once(
    "src/components/TimeSeriesCockpit.tsx",
    "import { EChart } from './EChart';",
    "import { EChart } from './EChart';\nimport { backtestBaselineForecasts } from '../lib/forecastBacktest';",
)
replace_once(
    "src/components/TimeSeriesCockpit.tsx",
    "    modelHealth: result.modelHealth,\n    coverage: result.coverage,",
    """    modelHealth: result.modelHealth,
    forecastBacktest: backtestBaselineForecasts(result.allPoints.map((point) => ({ key: point.key, label: point.label, actual: point.actual }))),
    coverage: result.coverage,""",
)
replace_once(
    "src/components/TimeSeriesCockpit.tsx",
    "  const option = buildOption(result);\n  const alerts = [...result.allPoints]",
    """  const option = buildOption(result);
  const forecastBacktest = backtestBaselineForecasts(result.allPoints.map((point) => ({
    key: point.key,
    label: point.label,
    actual: point.actual,
  })));
  const forecastChampion = forecastBacktest.scores.find((score) => score.model === forecastBacktest.champion) ?? null;
  const alerts = [...result.allPoints]""",
)
replace_once(
    "src/components/TimeSeriesCockpit.tsx",
    "      <article className={`time-metric health-${result.modelHealth.status}`}><span>Analysis health</span><strong>{result.modelHealth.score.toFixed(0)}/100</strong><small>{humanize(result.modelHealth.status)} · {result.modelHealth.periodCount} periods</small></article>\n    </div>",
    """      <article className={`time-metric health-${result.modelHealth.status}`}><span>Analysis health</span><strong>{result.modelHealth.score.toFixed(0)}/100</strong><small>{humanize(result.modelHealth.status)} · {result.modelHealth.periodCount} periods</small></article>
      <article className={`time-metric health-${forecastBacktest.status === 'ready' ? 'healthy' : forecastBacktest.status}`}><span>Forecast backtest</span><strong>{forecastBacktest.champion ? humanize(forecastBacktest.champion) : 'Not ready'}</strong><small>{forecastChampion?.wape == null ? `${forecastBacktest.historyPeriods} history periods` : `WAPE ${(forecastChampion.wape * 100).toFixed(1)}% · bias ${forecastChampion.bias == null ? '—' : `${(forecastChampion.bias * 100).toFixed(1)}%`}`}</small></article>
    </div>""",
)
replace_once(
    "src/components/TimeSeriesCockpit.tsx",
    "      <div><span>Time coverage</span><strong>{(result.modelHealth.parseRate * 100).toFixed(1)}%</strong></div>\n    </div>",
    """      <div><span>Time coverage</span><strong>{(result.modelHealth.parseRate * 100).toFixed(1)}%</strong></div>
      <div><span>Forecast status</span><strong>{humanize(forecastBacktest.status)}</strong></div>
    </div>""",
)
replace_once(
    "src/components/TimeSeriesCockpit.tsx",
    "        <section><h4>Warnings</h4>{result.warnings.length ? result.warnings.map((warning) => <p key={warning}>{warning}</p>) : <p>No automatic warnings.</p>}</section>",
    """        <section><h4>Warnings</h4>{result.warnings.length ? result.warnings.map((warning) => <p key={warning}>{warning}</p>) : <p>No automatic warnings.</p>}</section>
        <section><h4>Forecast backtest</h4><p>Champion: {forecastBacktest.champion ? humanize(forecastBacktest.champion) : 'none'} · folds: {forecastBacktest.evaluatedPeriods} · status: {humanize(forecastBacktest.status)}.</p>{forecastBacktest.predictionInterval80 && <p>Next baseline estimate: {compact(forecastBacktest.nextForecast ?? 0)} · 80% empirical interval {compact(forecastBacktest.predictionInterval80.lower)} to {compact(forecastBacktest.predictionInterval80.upper)}.</p>}{forecastBacktest.warnings.map((warning) => <p key={warning}>{warning}</p>)}</section>""",
)
