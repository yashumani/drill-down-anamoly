import { buildFpaNarrative, getPlanningLens, scoreWhyFactors } from '../lib/fpaInsights';
import type { PlanningLens } from '../lib/fpaInsights';
import type { DataQualityReport } from '../lib/dataQuality';
import type { NewsAnalysisResult } from '../lib/newsIntel';
import type { FinanceTimeSeriesResult } from '../lib/timeIntelligence';
import type { DataRow, InvestigationResult, Predicate } from '../types';

const compact = (value: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;

export function FpaInsightPanel({
  rows,
  predicates,
  result,
  dataQuality,
  planningLens,
  newsAnalysis,
  timeSeries,
}: {
  rows: DataRow[];
  predicates: Predicate[];
  result: InvestigationResult;
  dataQuality: DataQualityReport;
  planningLens: PlanningLens;
  newsAnalysis: NewsAnalysisResult | null;
  timeSeries: FinanceTimeSeriesResult | null;
}) {
  const lens = getPlanningLens(planningLens);
  const narrative = buildFpaNarrative(result, dataQuality, planningLens);
  const factors = scoreWhyFactors({ rows, predicates, result, newsAnalysis, lensId: planningLens });
  const topFactor = factors[0];
  const latest = timeSeries?.currentPeriod;
  const timeStory = latest
    ? `${latest.label} is ${compact(Math.abs(latest.businessImpact))} ${latest.impactDirection} versus plan. ${timeSeries.trend.description}${timeSeries.ytd ? ` YTD impact is ${compact(Math.abs(timeSeries.ytd.businessImpact))} ${timeSeries.ytd.impactDirection}.` : ''}`
    : narrative.whatChanged;
  const modelCaveat = timeSeries
    ? `Time-analysis health is ${timeSeries.modelHealth.score.toFixed(0)}/100 (${timeSeries.modelHealth.status}); run ${timeSeries.runId}.`
    : 'No time-intelligence model is active.';

  return <section className="fpa-command-center" aria-label="FP&A insight center">
    <div className="fpa-command-head">
      <div>
        <span className="eyebrow">FP&A COMMAND CENTER</span>
        <h2>{narrative.headline}</h2>
        <p>{lens.plainLanguage}</p>
      </div>
      <div className={`fpa-impact-pill ${result.impactDirection}`}>
        <span>{result.impactDirection}</span>
        <strong>{result.businessImpact >= 0 ? '+' : '-'}{compact(Math.abs(result.businessImpact))}</strong>
      </div>
    </div>

    {timeSeries && <div className="fpa-time-strip">
      <div><span>Latest period</span><strong>{latest?.label ?? '—'}</strong><small>{latest ? `${compact(Math.abs(latest.businessImpact))} ${latest.impactDirection}` : 'No current period'}</small></div>
      <div><span>QTD</span><strong>{timeSeries.qtd ? `${timeSeries.qtd.businessImpact >= 0 ? '+' : '-'}${compact(Math.abs(timeSeries.qtd.businessImpact))}` : '—'}</strong><small>{timeSeries.qtd ? `pace ${percent(timeSeries.qtd.pace)}` : 'Not available'}</small></div>
      <div><span>YTD</span><strong>{timeSeries.ytd ? `${timeSeries.ytd.businessImpact >= 0 ? '+' : '-'}${compact(Math.abs(timeSeries.ytd.businessImpact))}` : '—'}</strong><small>{timeSeries.ytd?.impactDirection ?? 'Not available'}</small></div>
      <div><span>Momentum</span><strong>{timeSeries.trend.direction}</strong><small>{compact(Math.abs(timeSeries.trend.change))} change</small></div>
      <div><span>Model health</span><strong>{timeSeries.modelHealth.score.toFixed(0)}/100</strong><small>{timeSeries.modelHealth.status}</small></div>
    </div>}

    <div className="fpa-story-grid">
      <InsightBlock title="What changed over time?" text={timeStory} />
      <InsightBlock title="Where to look first" text={narrative.whereToLook} />
      <InsightBlock title="Possible why" text={topFactor ? `${topFactor.title} is the highest-ranked external hypothesis with a ${topFactor.score}/100 relevance score. This is not a probability or causal proof.` : narrative.whyHypothesis} />
      <InsightBlock title="Next action" text={topFactor?.validationPlan ?? narrative.nextBestAction} />
    </div>

    <div className="fpa-lower-grid">
      <section className="fpa-playbook">
        <div className="fpa-section-title"><h3>BAU planning questions</h3><span>{lens.label}</span></div>
        <div className="fpa-question-list">
          {lens.commonQuestions.map((question) => <span key={question}>{question}</span>)}
          <span>Are we pacing to hit the current month, quarter, and fiscal year?</span>
          <span>Is the variance material, persistent, and likely to change the forecast?</span>
        </div>
        <p className="fpa-caveat">{narrative.caveat} {modelCaveat}</p>
      </section>

      <section className="why-factor-lab">
        <div className="fpa-section-title"><h3>External why-factor lab</h3><span>{newsAnalysis ? `${newsAnalysis.activeCount + newsAnalysis.passiveCount} articles scanned` : 'Run a news scan'}</span></div>
        {factors.length ? <div className="why-factor-list">
          {factors.slice(0, 4).map((factor) => <article key={factor.id} className={`why-factor-card ${factor.confidence}`}>
            <div className="why-factor-top"><strong>{factor.score}/100</strong><span>{factor.confidence} relevance</span></div>
            <h4>{factor.title}</h4>
            <p>{factor.validationPlan}</p>
            <div className="why-evidence">
              {factor.evidence.slice(0, 3).map((item) => <span key={item}>{item}</span>)}
            </div>
            <small>{factor.angle === 'active' ? 'Direct company signal' : 'Competitor / market signal'} · {factor.sentiment} · {factor.source}{factor.publishedAt ? ` · ${factor.publishedAt}` : ''}</small>
          </article>)}
        </div> : <div className="why-empty">
          <strong>No external factor scored yet.</strong>
          <p>Use the Public news context panel to scan company and competitor news. The lab will rank possible why-factors against the selected variance window, driver path, FP&A lens, and loaded time coverage.</p>
        </div>}
      </section>
    </div>
  </section>;
}

function InsightBlock({ title, text }: { title: string; text: string }) {
  return <article className="fpa-insight-block"><span>{title}</span><p>{text}</p></article>;
}
