import { useEffect, useRef, useState } from 'react';
import { LOCAL_PYTHON_ORIGIN, isLocalBrowserOrigin, localPythonApiUrl, readLocalUtf8File, requestPythonPreview } from '../lib/pythonAssuranceClient';
import type { PythonPreviewReport } from '../lib/pythonAssuranceClient';

type FileKind = 'csv' | 'rules' | 'controls';
const labels: Record<FileKind, string> = { csv: 'Original UTF-8 CSV', rules: 'Exact rule JSON', controls: 'Control CSV (optional)' };

/** An explicit original-file preview, independent of the existing exploration profile. */
export function LocalPythonAssurancePanel() {
  const endpoint = LOCAL_PYTHON_ORIGIN;
  const [evaluationTime, setEvaluationTime] = useState('');
  const [referenceName, setReferenceName] = useState('controls');
  const [files, setFiles] = useState<Record<FileKind, string>>({ csv: '', rules: '', controls: '' });
  const [names, setNames] = useState<Record<FileKind, string>>({ csv: '', rules: '', controls: '' });
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Choose the original files and confirm their transfer to your local Python process.');
  const [report, setReport] = useState<PythonPreviewReport | null>(null);
  const revision = useRef(0);
  const request = useRef<AbortController | null>(null);
  const origin = typeof location !== 'undefined' && isLocalBrowserOrigin(location.origin) ? location.origin : '';
  let endpointValid = true;
  try { localPythonApiUrl(endpoint); } catch { endpointValid = false; }

  useEffect(() => () => { revision.current += 1; request.current?.abort(); }, []);

  function invalidate(message = 'Inputs changed. Confirm and run a new preview.') {
    revision.current += 1;
    request.current?.abort(); request.current = null;
    setReport(null); setConfirmed(false); setBusy(false); setNotice(message);
  }

  async function openFile(kind: FileKind, file?: File) {
    if (!file) return;
    invalidate('Reading the selected UTF-8 file.');
    setFiles(previous => ({ ...previous, [kind]: '' }));
    setNames(previous => ({ ...previous, [kind]: '' }));
    const marker = revision.current;
    setBusy(true);
    try {
      const text = await readLocalUtf8File(file);
      if (marker !== revision.current) return;
      setFiles(previous => ({ ...previous, [kind]: text }));
      setNames(previous => ({ ...previous, [kind]: file.name }));
      setNotice('File opened. The preview uses the selected original text and declared rule types.');
    } catch {
      if (marker === revision.current) setNotice('Could not open that file. Use UTF-8 text at or below 1 MiB.');
    } finally {
      if (marker === revision.current) setBusy(false);
    }
  }

  async function preview() {
    if (busy || !confirmed || !origin) return;
    const marker = ++revision.current;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setReport(null); setNotice('Running the local non-gating Python preview.');
    try {
      const value = await requestPythonPreview(endpoint, { csv: files.csv, rules: files.rules, evaluationTime,
        references: files.controls ? { [referenceName]: files.controls } : {} },
        { confirmed, signal: controller.signal });
      if (marker !== revision.current) return;
      setReport(value); setNotice('Python preview evaluated the selected original CSV. Gate: non-gating.');
    } catch {
      if (marker === revision.current) setNotice('Local preview unavailable or rejected. Check the local endpoint, allowed origin, UTF-8 files and rule contract.');
    } finally {
      if (marker === revision.current) { setBusy(false); request.current = null; }
    }
  }

  return <details className="context-box" aria-label="Optional local Python assurance">
    <summary>Optional Python rule preview</summary>
    <p>Choose an original CSV and owner-supplied rule JSON for the Python executor. This separate preview is non-gating. Selected file text stays in this page until you confirm a transfer to the loopback Python endpoint. Python removes its temporary CSV files after parsing. The combined request limit is 2 MiB.</p>
    <p>Start the installed module in a terminal, allowing this local app origin:</p>
    <pre><code>{`reporting-assurance studio --port 8765 --allow-origin ${origin || 'http://localhost:5173'}`}</code></pre>
    {!origin && <p role="status">Open this app locally over HTTP on localhost or 127.0.0.1 to enable the connection.</p>}
    <label htmlFor="python-assurance-endpoint">Local Python endpoint</label>
    <input id="python-assurance-endpoint" value={endpoint} readOnly aria-describedby="python-assurance-endpoint-help" />
    <p id="python-assurance-endpoint-help">This app permits only http://127.0.0.1:8765/api. Use port 8765 for this preview; other ports remain available through standalone Studio or the Python API/CLI.</p>
    {(['csv', 'rules', 'controls'] as FileKind[]).map(kind => <div key={kind}>
      <label htmlFor={`python-assurance-${kind}`}>{labels[kind]} (1 MiB limit)</label>
      <input id={`python-assurance-${kind}`} type="file" disabled={busy} accept={kind === 'rules' ? '.json,application/json' : '.csv,text/csv'} onChange={event => void openFile(kind, event.target.files?.[0])} />
      {names[kind] && <small>Selected: {names[kind]}</small>}
    </div>)}
    <label htmlFor="python-assurance-reference">Control reference name</label>
    <input id="python-assurance-reference" value={referenceName} maxLength={128} onChange={event => { invalidate(); setReferenceName(event.target.value); }} />
    <label htmlFor="python-assurance-time">Evaluation timestamp with UTC offset (optional)</label>
    <input id="python-assurance-time" value={evaluationTime} maxLength={128} placeholder="2026-04-05T12:00:00Z" onChange={event => { invalidate(); setEvaluationTime(event.target.value); }} />
    <label><input type="checkbox" checked={confirmed} disabled={busy || !origin} onChange={event => setConfirmed(event.target.checked)} />Send these selected files to this local Python process for a preview.</label>
    <button type="button" disabled={busy || !origin || !endpointValid || !confirmed || !files.csv || !files.rules || Boolean(files.controls && !referenceName)} onClick={() => void preview()}>Run Python preview</button>
    <p role="status" aria-live="polite">{notice}</p>
    {report && <div>
      <p><strong>Python gate: {report.gate}</strong> · {report.row_count.toLocaleString()} rows · {report.rule_count} checks · {Object.entries(report.outcome_counts).map(([outcome, count]) => `${count} ${outcome}`).join(' · ')}</p>
      <details><summary>Counts and rule evidence JSON</summary><pre style={{ maxHeight: '40vh', overflow: 'auto' }}>{JSON.stringify(report, null, 2)}</pre></details>
    </div>}
  </details>;
}
