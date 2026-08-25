import { useEffect, useMemo, useState } from 'react';
import type { DataQualityReport } from '../lib/dataQuality';
import type { DatasetSession } from '../lib/datasetSession';
import type { PlanningLens } from '../lib/fpaInsights';
import type { LlmConfig } from '../lib/llm';
import { askEvidenceLlm, testLlmConnection } from '../lib/llm';
import { localOllamaPreset, selectLocalOllamaModel } from '../lib/llmPresets';
import type { MetricDefinition } from '../lib/metricSemantics';
import {
  buildPresentationSlideModel,
  defaultPresentationDesign,
  downloadPresentationModel,
  downloadPresentationPng,
  downloadPresentationSvg,
  renderPresentationSlideSvg,
  validatePresentationDesignPatch,
} from '../lib/presentationStudio';
import type {
  PresentationDesignPlan,
  PresentationPreset,
  PresentationTheme,
} from '../lib/presentationStudio';
import type { FinanceTimeSeriesResult } from '../lib/timeIntelligence';
import type { InvestigationResult, Predicate } from '../types';
import { InfoTip } from './InfoTip';

function stored(key: string, fallback = '') {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function initialLlmConfig(): LlmConfig {
  return {
    enabled: stored('anomaly-llm-enabled', 'false') === 'true',
    endpoint: stored('anomaly-llm-endpoint'),
    model: stored('anomaly-llm-model'),
    apiKey: '',
    authHeader: stored('anomaly-llm-auth-header', 'Authorization'),
    authPrefix: stored('anomaly-llm-auth-prefix', 'Bearer '),
  };
}

function persistNonSecretConfig(config: LlmConfig) {
  try {
    localStorage.setItem('anomaly-llm-enabled', String(config.enabled));
    localStorage.setItem('anomaly-llm-endpoint', config.endpoint);
    localStorage.setItem('anomaly-llm-model', config.model);
    localStorage.setItem('anomaly-llm-auth-header', config.authHeader);
    localStorage.setItem('anomaly-llm-auth-prefix', config.authPrefix);
  } catch {
    // Presentation generation still works without browser storage.
  }
}

function extractJson(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced ?? value;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model did not return a JSON design object.');
  return JSON.parse(source.slice(start, end + 1)) as unknown;
}

const presetCopy: Record<PresentationPreset, { label: string; description: string }> = {
  executive: {
    label: 'Executive infographic',
    description: 'One-page management summary with KPIs, drivers, and the core questions already answered.',
  },
  anomalies: {
    label: 'Anomaly register',
    description: 'A compact register of material or unusual periods with the strongest supported drivers.',
  },
  questions: {
    label: 'Questions answered',
    description: 'A finance-review slide organized around the questions leaders typically ask.',
  },
};

export function PresentationStudio({
  open,
  onClose,
  result,
  timeSeries,
  dataQuality,
  metricDefinition,
  datasetSession,
  predicates,
  planningLens,
  actualKey,
  expectedKey,
}: {
  open: boolean;
  onClose: () => void;
  result: InvestigationResult;
  timeSeries: FinanceTimeSeriesResult | null;
  dataQuality: DataQualityReport;
  metricDefinition: MetricDefinition;
  datasetSession: DatasetSession;
  predicates: Predicate[];
  planningLens: PlanningLens;
  actualKey: string;
  expectedKey?: string;
}) {
  const model = useMemo(() => buildPresentationSlideModel({
    result,
    timeSeries,
    dataQuality,
    metricDefinition,
    datasetSession,
    predicates,
    planningLens,
    actualKey,
    expectedKey,
  }), [result, timeSeries, dataQuality, metricDefinition, datasetSession, predicates, planningLens, actualKey, expectedKey]);
  const defaultDesign = useMemo(() => defaultPresentationDesign(model), [model.runId, model.datasetSessionId]);
  const [preset, setPreset] = useState<PresentationPreset>('executive');
  const [design, setDesign] = useState<PresentationDesignPlan>(defaultDesign);
  const [llm, setLlm] = useState<LlmConfig>(() => initialLlmConfig());
  const [instruction, setInstruction] = useState('Make this a concise CFO-ready slide. Emphasize the largest unfavorable movement and keep the evidence caveats visible.');
  const [aiStatus, setAiStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    setDesign(defaultDesign);
  }, [defaultDesign]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const svg = useMemo(() => renderPresentationSlideSvg(model, design, preset), [model, design, preset]);
  const previewUrl = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, [svg]);

  function updateConfig(next: LlmConfig) {
    setLlm(next);
    persistNonSecretConfig(next);
    setAiStatus('');
  }

  async function connectLocal() {
    setTesting(true);
    setAiStatus('Looking for Ollama on this device…');
    const presetConfig = localOllamaPreset();
    try {
      const output = await testLlmConnection({ ...presetConfig, enabled: false });
      const modelName = output.ok ? presetConfig.model : selectLocalOllamaModel(output.availableModels);
      if (!modelName) throw new Error('Ollama is reachable, but no text model was found. Pull llama3.2 and try again.');
      const next = { ...presetConfig, enabled: true, model: modelName };
      setAvailableModels(output.availableModels);
      updateConfig(next);
      setAiStatus(`Local model connected: ${modelName}.`);
    } catch (error) {
      setAiStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setAiStatus('Testing the configured model endpoint…');
    try {
      const output = await testLlmConnection(llm);
      setAvailableModels(output.availableModels);
      setAiStatus(output.message);
    } catch (error) {
      setAiStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  }

  async function redesignWithLlm() {
    if (!llm.enabled) {
      setAiStatus('Enable or connect a model first. The deterministic slide remains fully usable without AI.');
      return;
    }
    setBusy(true);
    setAiStatus('The model is proposing a design-only patch…');
    try {
      const response = await askEvidenceLlm(
        [
          instruction,
          'Return only one JSON object with these optional keys: title, subtitle, theme, density, emphasis, callout.',
          'Allowed theme values: paper, midnight, risk, board.',
          'Allowed density values: balanced, compact.',
          'Allowed emphasis values: impact, drivers, anomalies, questions.',
          'Do not return or alter any numeric values. Do not add factual claims beyond the supplied evidence.',
        ].join(' '),
        llm,
        {
          title: 'FP&A presentation design assistant',
          evidence: {
            lockedEvidence: model,
            currentPreset: preset,
            currentDesign: design,
          },
          instructions: [
            'You are modifying presentation wording and visual emphasis only.',
            'All metric values, anomaly values, driver values, support values, and evidence identifiers are locked.',
            'Use only the supplied evidence and return valid JSON with no Markdown.',
          ],
        },
      );
      setDesign((current) => validatePresentationDesignPatch(extractJson(response), current));
      setAiStatus('AI design patch applied. All financial numbers remained locked to deterministic evidence.');
    } catch (error) {
      setAiStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function openPrintView() {
    const blob = new Blob([`<!doctype html><html><head><title>${design.title}</title><style>html,body{margin:0;background:#111}svg{display:block;width:100vw;height:auto}@media print{@page{size:13.333in 7.5in;margin:0}html,body{background:white}}</style></head><body>${svg}<script>setTimeout(()=>window.print(),250)<\/script></body></html>`], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  if (!open) return null;
  const modelOptions = availableModels.includes(llm.model) || !llm.model ? availableModels : [llm.model, ...availableModels];

  return <div className="presentation-studio-overlay" role="dialog" aria-modal="true" aria-label="Presentation Studio">
    <section className="presentation-studio-shell">
      <header className="presentation-studio-header">
        <div>
          <span className="deck-kicker">PRESENTATION STUDIO</span>
          <h2>Create a finance-ready infographic without AI.</h2>
          <p>The numbers, anomalies, drivers, and question answers come directly from the current deterministic investigation. AI is optional and can modify design wording only.</p>
        </div>
        <button type="button" className="presentation-studio-close" onClick={onClose} aria-label="Close Presentation Studio">×</button>
      </header>

      <div className="presentation-studio-body">
        <aside className="presentation-studio-controls">
          <section>
            <div className="presentation-control-heading"><strong>1. Choose a preset</strong><InfoTip text="Every preset uses the same locked finance evidence. Only the slide layout changes." label="About slide presets" /></div>
            <div className="presentation-preset-list">{(Object.keys(presetCopy) as PresentationPreset[]).map((item) => <button
              key={item}
              type="button"
              className={preset === item ? 'active' : ''}
              onClick={() => setPreset(item)}
            ><strong>{presetCopy[item].label}</strong><small>{presetCopy[item].description}</small></button>)}</div>
          </section>

          <section>
            <div className="presentation-control-heading"><strong>2. Edit the slide</strong><InfoTip text="Manual edits and AI edits cannot change the underlying finance values. Exported evidence includes the calculation run ID." label="About slide editing" /></div>
            <label>Title<input value={design.title} onChange={(event) => setDesign({ ...design, title: event.target.value.slice(0, 100) })} /></label>
            <label>Subtitle<textarea value={design.subtitle} onChange={(event) => setDesign({ ...design, subtitle: event.target.value.slice(0, 180) })} /></label>
            <label>Executive callout<textarea value={design.callout} onChange={(event) => setDesign({ ...design, callout: event.target.value.slice(0, 220) })} /></label>
            <div className="presentation-control-grid">
              <label>Theme<select value={design.theme} onChange={(event) => setDesign({ ...design, theme: event.target.value as PresentationTheme })}><option value="paper">Paper</option><option value="board">Board blue</option><option value="risk">Risk review</option><option value="midnight">Midnight</option></select></label>
              <label>Emphasis<select value={design.emphasis} onChange={(event) => setDesign({ ...design, emphasis: event.target.value as PresentationDesignPlan['emphasis'] })}><option value="impact">Impact</option><option value="drivers">Drivers</option><option value="anomalies">Anomalies</option><option value="questions">Questions</option></select></label>
            </div>
            <button type="button" className="quiet-button" onClick={() => setDesign(defaultDesign)}>Reset deterministic design</button>
          </section>

          <details className="presentation-ai-designer">
            <summary><span>Optional LLM designer</span><strong>Modify wording and visual emphasis</strong></summary>
            <p>The model receives the locked slide evidence and current design. It cannot change finance numbers because the accepted response schema contains design fields only.</p>
            <div className="presentation-ai-actions"><button type="button" onClick={connectLocal} disabled={testing}>{testing ? 'Connecting…' : 'Use local Ollama'}</button><button type="button" className="quiet-button" onClick={testConnection} disabled={testing || !llm.endpoint.trim()}>{testing ? 'Testing…' : 'Test endpoint'}</button><label><input type="checkbox" checked={llm.enabled} onChange={(event) => updateConfig({ ...llm, enabled: event.target.checked })} /> Enable LLM</label></div>
            <label>Endpoint<input value={llm.endpoint} onChange={(event) => updateConfig({ ...llm, endpoint: event.target.value })} placeholder="https://.../chat/completions" /></label>
            <div className="presentation-control-grid">
              <label>Model{modelOptions.length ? <select value={llm.model} onChange={(event) => updateConfig({ ...llm, model: event.target.value })}>{modelOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select> : <input value={llm.model} onChange={(event) => updateConfig({ ...llm, model: event.target.value })} />}</label>
              <label>API key<input type="password" value={llm.apiKey} onChange={(event) => setLlm({ ...llm, apiKey: event.target.value })} placeholder="Not saved" /></label>
            </div>
            <label>Design instruction<textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} /></label>
            <button type="button" onClick={redesignWithLlm} disabled={busy}>{busy ? 'Applying design…' : 'Ask LLM to redesign'}</button>
            {aiStatus && <p className="presentation-ai-status" role="status">{aiStatus}</p>}
          </details>
        </aside>

        <main className="presentation-studio-preview">
          <div className="presentation-preview-toolbar">
            <div><span>16:9 slide preview</span><strong>{presetCopy[preset].label}</strong></div>
            <div><button type="button" onClick={() => downloadPresentationSvg(svg)}>Download SVG</button><button type="button" onClick={() => downloadPresentationPng(svg)}>Download PNG</button><button type="button" className="quiet-button" onClick={openPrintView}>Print / PDF</button><button type="button" className="quiet-button" onClick={() => downloadPresentationModel(model, design, preset)}>Evidence JSON</button></div>
          </div>
          <div className="presentation-slide-frame"><img src={previewUrl} alt={`${presetCopy[preset].label} preview`} /></div>
          <div className="presentation-evidence-lock">
            <span>Evidence locked</span>
            <strong>{model.validRowCount.toLocaleString()} valid rows · {model.dimensionsScanned} factors · run {model.runId}</strong>
            <small>Exports contain no raw data rows. The slide summarizes deterministic evidence from the current dataset session.</small>
          </div>
        </main>
      </div>
    </section>
  </div>;
}
