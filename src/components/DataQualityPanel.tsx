import { useEffect, useMemo, useState } from 'react';
import type { DataRow } from '../types';
import type { ColumnQualityProfile, DataQualityReport, QualityIssue } from '../lib/dataQuality';

interface Props {
  rows: DataRow[];
  report: DataQualityReport;
  onLoadCleanDemo: () => void;
  onLoadQualityDemo: () => void;
}

type QualityTab = 'overview' | 'columns' | 'relationships' | 'preview' | 'framework';

const format = (value: number, digits = 1) => Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const humanize = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_.-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function downloadReport(report: DataQualityReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `data-quality-report-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function valueText(value: unknown) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return '∅ missing';
  return String(value);
}

export function DataQualityPanel({ rows, report, onLoadCleanDemo, onLoadQualityDemo }: Props) {
  const [tab, setTab] = useState<QualityTab>('overview');
  const [search, setSearch] = useState('');
  const [selectedColumn, setSelectedColumn] = useState(report.columns[0]?.name ?? '');
  const [issueFilter, setIssueFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [previewSearch, setPreviewSearch] = useState('');

  useEffect(() => {
    if (!report.columns.some((column) => column.name === selectedColumn)) setSelectedColumn(report.columns[0]?.name ?? '');
  }, [report, selectedColumn]);

  const currentColumn = report.columns.find((column) => column.name === selectedColumn) ?? report.columns[0];
  const filteredColumns = useMemo(() => {
    const query = search.trim().toLowerCase();
    return report.columns.filter((column) => !query || `${column.name} ${column.inferredKind} ${column.analysisRole}`.toLowerCase().includes(query));
  }, [report.columns, search]);
  const filteredIssues = report.issues.filter((item) => issueFilter === 'all' || item.severity === issueFilter);
  const previewColumns = useMemo(() => {
    const preferred = [selectedColumn, ...report.measureCandidates, ...report.dimensionCandidates, ...report.identifierCandidates].filter(Boolean);
    return [...new Set(preferred)].slice(0, 14);
  }, [selectedColumn, report]);
  const previewRows = useMemo(() => {
    const query = previewSearch.trim().toLowerCase();
    return rows.filter((row) => !query || previewColumns.some((column) => valueText(row[column]).toLowerCase().includes(query))).slice(0, 100);
  }, [rows, previewColumns, previewSearch]);

  return <section className="quality-workspace" aria-label="Data Quality Explorer">
    <div className="quality-header">
      <div className={`quality-score quality-${report.status}`}>
        <strong>{report.overallScore.toFixed(0)}</strong><span>/100</span>
      </div>
      <div className="quality-title">
        <span className="eyebrow">DATA QUALITY EXPLORER</span>
        <h2>{report.analysisReady ? 'Data is ready for exploratory analysis' : 'Quality issues should be reviewed first'}</h2>
        <p>{report.blockers} blocker{report.blockers === 1 ? '' : 's'}, {report.warnings} warning{report.warnings === 1 ? '' : 's'}, and {report.columns.length} profiled columns across {report.rows ? '' : ''}{report.rowCount.toLocaleString()} rows.</p>
      </div>
      <div className="quality-actions">
        <button type="button" className="quiet-button" onClick={onLoadCleanDemo}>Clean demo</button>
        <button type="button" className="quiet-button" onClick={onLoadQualityDemo}>Quality-issue demo</button>
        <button type="button" onClick={() => downloadReport(report)}>Export report</button>
      </div>
    </div>

    <nav className="quality-tabs" aria-label="Data quality sections">
      {([
        ['overview', 'Overview'],
        ['columns', 'Column explorer'],
        ['relationships', 'Relationships'],
        ['preview', 'Data preview'],
        ['framework', 'Quality framework'],
      ] as Array<[QualityTab, string]>).map(([id, label]) => <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}
    </nav>

    {tab === 'overview' && <div className="quality-tab-content">
      <div className="quality-summary-grid">
        <QualityMetric label="Rows" value={report.rowCount.toLocaleString()} note={`${report.emptyRows} empty`} />
        <QualityMetric label="Columns" value={report.columnCount.toLocaleString()} note={`${report.measureCandidates.length} measures · ${report.dimensionCandidates.length} dimensions`} />
        <QualityMetric label="Missing cells" value={percent(report.missingRate)} note={`${report.missingCells.toLocaleString()} cells`} tone={report.missingRate > 0.05 ? 'warn' : 'good'} />
        <QualityMetric label="Duplicate rows" value={report.duplicateRows.toLocaleString()} note={percent(report.duplicateRate)} tone={report.duplicateRows ? 'warn' : 'good'} />
        <QualityMetric label="Ragged rows" value={report.raggedRows.toLocaleString()} note="Fields absent from row schema" tone={report.raggedRows ? 'warn' : 'good'} />
        <QualityMetric label="Sensitive fields" value={report.sensitiveColumns.length.toLocaleString()} note={report.sensitiveColumns.join(', ') || 'None detected'} tone={report.sensitiveColumns.length ? 'warn' : 'good'} />
      </div>

      <div className="quality-dimensions-grid">
        {report.dimensions.map((dimension) => <article key={dimension.id} className={`quality-dimension status-${dimension.status}`}>
          <div><strong>{dimension.label}</strong><span>{dimension.score === null ? 'Needs configuration' : `${dimension.score.toFixed(0)}/100`}</span></div>
          <p>{dimension.summary}</p>
        </article>)}
      </div>

      <div className="quality-overview-split">
        <section className="quality-issues-panel">
          <div className="quality-section-head"><div><h3>Issues and observations</h3><p>Start with blockers, then review warnings that could change the anomaly result.</p></div><select value={issueFilter} onChange={(event) => setIssueFilter(event.target.value as typeof issueFilter)}><option value="all">All severities</option><option value="critical">Blockers</option><option value="warning">Warnings</option><option value="info">Observations</option></select></div>
          <div className="quality-issue-list">
            {filteredIssues.slice(0, 30).map((item) => <IssueCard key={item.id} issue={item} onColumn={() => item.column && setSelectedColumn(item.column)} />)}
            {!filteredIssues.length && <div className="quality-empty">No issues match this filter.</div>}
          </div>
        </section>

        <section className="quality-readiness-panel">
          <h3>Analysis readiness</h3>
          <div className={`readiness-banner ${report.analysisReady ? 'ready' : 'blocked'}`}><strong>{report.analysisReady ? 'Ready' : 'Needs attention'}</strong><span>{report.analysisReady ? 'The profiler found usable measures and dimensions with no critical blockers.' : 'Resolve critical issues or select cleaner columns before relying on root-cause rankings.'}</span></div>
          <h4>Candidate roles</h4>
          <RoleList label="Measures" values={report.measureCandidates} />
          <RoleList label="Dimensions" values={report.dimensionCandidates} max={12} />
          <RoleList label="Identifiers" values={report.identifierCandidates} />
          <RoleList label="Sensitive" values={report.sensitiveColumns} />
        </section>
      </div>
    </div>}

    {tab === 'columns' && <div className="quality-tab-content column-explorer-layout">
      <section className="quality-column-list">
        <div className="quality-section-head"><div><h3>Columns</h3><p>Search and select any field to inspect its profile.</p></div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search columns" /></div>
        <div className="quality-column-table-wrap"><table className="quality-column-table"><thead><tr><th>Column</th><th>Role</th><th>Quality</th><th>Missing</th><th>Distinct</th><th>Flags</th></tr></thead><tbody>{filteredColumns.map((column) => <tr key={column.name} className={column.name === currentColumn?.name ? 'selected' : ''} onClick={() => setSelectedColumn(column.name)}><td><strong>{humanize(column.name)}</strong><small>{column.name}</small></td><td>{humanize(column.analysisRole)}</td><td>{column.qualityScore.toFixed(0)}</td><td>{percent(column.nullRate)}</td><td>{column.distinctCount.toLocaleString()}</td><td><ColumnFlags column={column} /></td></tr>)}</tbody></table></div>
      </section>
      {currentColumn && <ColumnDetail column={currentColumn} />}
    </div>}

    {tab === 'relationships' && <div className="quality-tab-content relationships-grid">
      <RelationshipSection title="Strong numeric relationships" description="Very high correlations may indicate redundancy, leakage, or duplicate calculations.">
        {report.correlations.length ? report.correlations.map((finding) => <div key={`${finding.left}-${finding.right}`} className="relationship-row"><strong>{humanize(finding.left)} ↔ {humanize(finding.right)}</strong><span>r = {finding.correlation.toFixed(3)} · {finding.sampleSize.toLocaleString()} rows</span></div>) : <div className="quality-empty">No numeric relationships above |0.80| were found.</div>}
      </RelationshipSection>
      <RelationshipSection title="Possible hierarchy / dependency mappings" description="A high-confidence A → B relationship means each A value almost always maps to one B value. Validate before treating it as a formal hierarchy.">
        {report.functionalDependencies.length ? report.functionalDependencies.map((finding) => <div key={`${finding.determinant}-${finding.dependent}`} className="relationship-row"><strong>{humanize(finding.determinant)} → {humanize(finding.dependent)}</strong><span>{percent(finding.confidence)} confidence · {finding.rows.toLocaleString()} rows</span></div>) : <div className="quality-empty">No near-deterministic categorical dependencies were detected.</div>}
      </RelationshipSection>
      <RelationshipSection title="Common missingness patterns" description="Columns that go missing together often point to a source-system, process, or join problem.">
        {report.missingPatterns.length ? report.missingPatterns.map((pattern, index) => <div key={`${index}-${pattern.columns.join('-')}`} className="relationship-row"><strong>{pattern.columns.map(humanize).join(' + ')}</strong><span>{pattern.count.toLocaleString()} rows · {percent(pattern.share)}</span></div>) : <div className="quality-empty">No missingness patterns were found.</div>}
      </RelationshipSection>
      <RelationshipSection title="What cannot be proven automatically" description="Accuracy and referential integrity require trusted business rules or reference tables.">
        <div className="relationship-guidance"><p>Configure primary keys, parent-child reference datasets, accepted-value lists, unit definitions, and target-grain rules before treating these checks as complete.</p></div>
      </RelationshipSection>
    </div>}

    {tab === 'preview' && <div className="quality-tab-content">
      <div className="quality-section-head"><div><h3>Data preview</h3><p>First 100 matching rows across the most analytically useful fields. Missing values are shown explicitly.</p></div><input value={previewSearch} onChange={(event) => setPreviewSearch(event.target.value)} placeholder="Search preview rows" /></div>
      <div className="preview-table-wrap"><table className="preview-table"><thead><tr><th>#</th>{previewColumns.map((column) => <th key={column}>{humanize(column)}</th>)}</tr></thead><tbody>{previewRows.map((row, index) => <tr key={index}><td>{index + 1}</td>{previewColumns.map((column) => <td key={column} className={valueText(row[column]).startsWith('∅') ? 'missing-cell' : ''}>{valueText(row[column])}</td>)}</tr>)}</tbody></table></div>
      <p className="preview-note">The browser preview intentionally limits output. The quality report still profiles the complete loaded dataset.</p>
    </div>}

    {tab === 'framework' && <div className="quality-tab-content">
      <div className="framework-intro"><h3>Comprehensive data quality framework</h3><p>Some dimensions can be measured from one dataset snapshot. Others need business rules, reference data, lineage metadata, or a historical baseline. The dashboard makes that distinction explicit instead of inventing certainty.</p></div>
      <div className="quality-framework-grid">{report.concepts.map((concept) => <article key={concept.name} className="quality-concept"><span className={`coverage coverage-${concept.coverage}`}>{concept.coverage.replace(/-/g, ' ')}</span><h4>{concept.name}</h4><p>{concept.description}</p></article>)}</div>
    </div>}
  </section>;
}

function QualityMetric({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'good' | 'warn' }) {
  return <article className={`quality-metric ${tone ?? ''}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function IssueCard({ issue, onColumn }: { issue: QualityIssue; onColumn: () => void }) {
  return <article className={`quality-issue severity-${issue.severity}`}>
    <div><span>{issue.severity === 'critical' ? 'Blocker' : issue.severity === 'warning' ? 'Warning' : 'Observation'}</span>{issue.column && <button type="button" onClick={onColumn}>{humanize(issue.column)}</button>}</div>
    <h4>{issue.title}</h4><p>{issue.description}</p><small>{issue.recommendation}</small>
  </article>;
}

function RoleList({ label, values, max = 8 }: { label: string; values: string[]; max?: number }) {
  return <div className="role-list"><span>{label}</span><div>{values.slice(0, max).map((value) => <i key={value}>{humanize(value)}</i>)}{values.length > max && <i>+{values.length - max} more</i>}{!values.length && <i>None</i>}</div></div>;
}

function ColumnFlags({ column }: { column: ColumnQualityProfile }) {
  const flags = [
    column.constant ? 'constant' : '',
    column.nearConstant ? 'near constant' : '',
    column.highCardinality ? 'high cardinality' : '',
    column.identifierCandidate ? 'identifier' : '',
    column.potentialSensitive ? 'sensitive' : '',
    column.numeric?.outlierCount ? 'outliers' : '',
  ].filter(Boolean);
  return <div className="column-flags">{flags.slice(0, 3).map((flag) => <span key={flag}>{flag}</span>)}{!flags.length && <span className="flag-ok">clean</span>}</div>;
}

function ColumnDetail({ column }: { column: ColumnQualityProfile }) {
  return <aside className="column-detail">
    <div className="column-detail-head"><div><span className="eyebrow">COLUMN PROFILE</span><h3>{humanize(column.name)}</h3><code>{column.name}</code></div><strong>{column.qualityScore.toFixed(0)}<small>/100</small></strong></div>
    <div className="column-stat-grid">
      <Stat label="Inferred type" value={humanize(column.inferredKind)} />
      <Stat label="Analysis role" value={humanize(column.analysisRole)} />
      <Stat label="Missing" value={percent(column.nullRate)} />
      <Stat label="Distinct" value={column.distinctCount.toLocaleString()} />
      <Stat label="Uniqueness" value={percent(column.uniquenessRate)} />
      <Stat label="Type consistency" value={percent(column.typeConsistency)} />
    </div>

    {column.numeric && <DetailBlock title="Numeric distribution"><div className="column-stat-grid"><Stat label="Minimum" value={format(column.numeric.min, 3)} /><Stat label="Q1" value={format(column.numeric.q1, 3)} /><Stat label="Median" value={format(column.numeric.median, 3)} /><Stat label="Q3" value={format(column.numeric.q3, 3)} /><Stat label="Maximum" value={format(column.numeric.max, 3)} /><Stat label="Average" value={format(column.numeric.mean, 3)} /><Stat label="Std. deviation" value={format(column.numeric.standardDeviation, 3)} /><Stat label="Outliers" value={`${column.numeric.outlierCount} (${percent(column.numeric.outlierRate)})`} /></div></DetailBlock>}
    {column.date && <DetailBlock title="Date coverage"><div className="column-stat-grid"><Stat label="Earliest" value={column.date.min.slice(0, 10)} /><Stat label="Latest" value={column.date.max.slice(0, 10)} /><Stat label="Invalid" value={column.date.invalidCount.toLocaleString()} /><Stat label="Future" value={column.date.futureCount.toLocaleString()} /></div></DetailBlock>}
    {column.string && <DetailBlock title="Text conformity"><div className="column-stat-grid"><Stat label="Minimum length" value={column.string.minLength.toLocaleString()} /><Stat label="Maximum length" value={column.string.maxLength.toLocaleString()} /><Stat label="Average length" value={format(column.string.averageLength)} /><Stat label="Whitespace rows" value={column.string.leadingTrailingWhitespaceCount.toLocaleString()} /><Stat label="Variant rows" value={column.string.normalizedCollisionRows.toLocaleString()} /></div></DetailBlock>}

    <DetailBlock title="Most frequent values"><div className="top-values-list">{column.topValues.slice(0, 8).map((item) => <div key={item.value}><span title={item.value}>{item.value}</span><i><b style={{ width: `${Math.max(2, item.share * 100)}%` }} /></i><small>{item.count.toLocaleString()} · {percent(item.share)}</small></div>)}</div></DetailBlock>
    <DetailBlock title="Column issues">{column.issues.length ? <div className="column-issue-list">{column.issues.map((item) => <div key={item.id} className={`mini-issue severity-${item.severity}`}><strong>{item.title}</strong><span>{item.description}</span></div>)}</div> : <div className="quality-empty">No automatic issues detected for this column.</div>}</DetailBlock>
  </aside>;
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="column-detail-block"><h4>{title}</h4>{children}</section>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="column-stat"><span>{label}</span><strong>{value}</strong></div>;
}

function RelationshipSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="relationship-section"><h3>{title}</h3><p>{description}</p><div>{children}</div></section>;
}
