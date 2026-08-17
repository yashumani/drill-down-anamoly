import { useEffect, useMemo, useState } from 'react';
import { runExternalEventStudy } from '../lib/externalEventStudy';
import type {
  ExpectedBusinessDirection,
  ExternalEventStudyResult,
} from '../lib/externalEventStudy';
import type { DataRow, InvestigationResult, MetricPolarity, Predicate } from '../types';

const compact = (value: number) => Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
}).format(value);
const humanize = (value: string) => value
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[_.-]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

interface Props {
  rows: DataRow[];
  result: InvestigationResult;
  predicates: Predicate[];
  actualKey: string;
  expectedKey?: string;
  metricPolarity: MetricPolarity;
  timeField: string;
  defaultEventDate?: string;
}

export function ExternalFactorValidationPanel({
  rows,
  result,
  predicates,
  actualKey,
  expectedKey,
  metricPolarity,
  timeField,
  defaultEventDate,
}: Props) {
  const driverOptions = useMemo(
    () => result.dimensionScores.filter((dimension) => dimension.categories.length >= 2).slice(0, 12),
    [result],
  );
  const [dimension, setDimension] = useState(driverOptions[0]?.dimension ?? '');
  const selectedDriver = driverOptions.find((item) => item.dimension === dimension) ?? driverOptions[0] ?? null;
  const categories = selectedDriver?.categories.slice(0, 12) ?? [];
  const [affectedValue, setAffectedValue] = useState(categories[0]?.value ?? '');
  const [controlValue, setControlValue] = useState(categories[1]?.value ?? '');
  const [eventTitle, setEventTitle] = useState('External business event');
  const [eventDate, setEventDate] = useState(defaultEventDate?.slice(0, 10) ?? '');
  const [preDays, setPreDays] = useState(30);
  const [postDays, setPostDays] = useState(30);
  const [expectedDirection, setExpectedDirection] = useState<ExpectedBusinessDirection>('unknown');
  const [study, setStudy] = useState<ExternalEventStudyResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!driverOptions.some((item) => item.dimension === dimension)) {
      setDimension(driverOptions[0]?.dimension ?? '');
    }
  }, [driverOptions, dimension]);

  useEffect(() => {
    setAffectedValue(categories[0]?.value ?? '');
    setControlValue(categories[1]?.value ?? '');
    setStudy(null);
  }, [dimension, selectedDriver?.dimension]);

  useEffect(() => {
    if (!eventDate && defaultEventDate) setEventDate(defaultEventDate.slice(0, 10));
  }, [defaultEventDate, eventDate]);

  function runStudy() {
    setError('');
    setStudy(null);
    try {
      if (!timeField) throw new Error('Select a usable date field before testing an external event.');
      if (!dimension || !affectedValue) throw new Error('Choose an affected dimension and category.');
      if (!eventDate) throw new Error('Add the effective event date.');
      const base = predicates.filter((predicate) => predicate.dimension !== dimension);
      const affectedPredicates = [...base, { dimension, value: affectedValue }];
      const controlPredicates = controlValue
        ? [...base, { dimension, value: controlValue }]
        : undefined;
      setStudy(runExternalEventStudy({
        rows,
        eventId: `manual-${eventDate}-${dimension}-${affectedValue}`,
        eventTitle,
        eventDate,
        timeField,
        actualKey,
        expectedKey,
        metricPolarity,
        affectedPredicates,
        controlPredicates,
        preDays,
        postDays,
        expectedDirection,
      }));
    } catch (studyError) {
      setError(studyError instanceof Error ? studyError.message : String(studyError));
    }
  }

  return <section className="external-validation-panel" aria-label="External event validation lab">
    <div className="external-validation-head">
      <div>
        <span className="eyebrow">EXTERNAL FACTOR VALIDATION</span>
        <h2>Test whether an event overlaps the financial movement</h2>
        <p>Compare an affected cohort with a control cohort before and after an event. The result is descriptive evidence—not automatic causal proof.</p>
      </div>
      <button type="button" onClick={runStudy}>Run event study</button>
    </div>

    <div className="external-validation-controls">
      <label>Event title<input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} /></label>
      <label>Effective date<input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} /></label>
      <label>Affected dimension<select value={dimension} onChange={(event) => setDimension(event.target.value)}>{driverOptions.map((driver) => <option key={driver.dimension} value={driver.dimension}>{humanize(driver.dimension)}</option>)}</select></label>
      <label>Affected category<select value={affectedValue} onChange={(event) => setAffectedValue(event.target.value)}>{categories.map((category) => <option key={category.value} value={category.value}>{category.value}</option>)}</select></label>
      <label>Control category<select value={controlValue} onChange={(event) => setControlValue(event.target.value)}><option value="">No control · pre/post only</option>{categories.filter((category) => category.value !== affectedValue).map((category) => <option key={category.value} value={category.value}>{category.value}</option>)}</select></label>
      <label>Expected direction<select value={expectedDirection} onChange={(event) => setExpectedDirection(event.target.value as ExpectedBusinessDirection)}><option value="unknown">Unknown</option><option value="unfavorable">Unfavorable</option><option value="favorable">Favorable</option></select></label>
      <label>Pre-event days<input type="number" min={7} max={365} value={preDays} onChange={(event) => setPreDays(Number(event.target.value))} /></label>
      <label>Post-event days<input type="number" min={7} max={365} value={postDays} onChange={(event) => setPostDays(Number(event.target.value))} /></label>
    </div>

    {error && <div className="inline-error"><strong>Event study could not run.</strong><span>{error}</span></div>}

    {study ? <div className="external-validation-result">
      <article className={`external-validation-verdict ${study.status}`}>
        <span>{humanize(study.status)} · {study.confidence} confidence</span>
        <strong>{study.businessImpactEffect >= 0 ? '+' : '-'}{compact(Math.abs(study.businessImpactEffect))}</strong>
        <small>{study.impactDirection} estimated business-impact change · {humanize(study.method)}</small>
      </article>
      <article><span>Standardized effect</span><strong>{study.standardizedEffect.toFixed(2)}</strong><small>Effect relative to robust pre-event residual variation</small></article>
      <article><span>Affected cohort</span><strong>{study.affected.prePeriods} → {study.affected.postPeriods}</strong><small>pre/post daily observations · residual change {compact(study.affected.residualChange)}</small></article>
      <article><span>Control quality</span><strong>{study.parallelTrendScore == null ? 'No control' : `${(study.parallelTrendScore * 100).toFixed(0)}%`}</strong><small>{study.parallelTrendScore == null ? 'Pre/post comparison only' : 'pre-event trend similarity score'}</small></article>
      <div className="external-validation-notes">
        <section><h3>Diagnostics</h3>{study.diagnostics.length ? study.diagnostics.map((item) => <p key={item}>{item}</p>) : <p>No automatic diagnostic warning.</p>}</section>
        <section><h3>Limitations</h3>{study.limitations.map((item) => <p key={item}>{item}</p>)}</section>
      </div>
    </div> : <div className="external-validation-empty">
      <strong>Ready to test a hypothesis</strong>
      <p>Choose an event date, affected category, and comparable control. Monthly or sparse datasets may return insufficient evidence because the current study requires at least five pre-event and five post-event observations per cohort.</p>
    </div>}
  </section>;
}
