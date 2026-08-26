import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { paletteById } from '../data/palettes';
import type { LayoutMode } from '../lib/responsiveLayout';
import type { PaletteId } from './ThemePicker';
import { ThemePicker } from './ThemePicker';

export type AppWorkspace = 'guided' | 'advanced' | 'public-demo' | 'quality';

type IconName =
  | 'sparkles'
  | 'chart'
  | 'globe'
  | 'shield'
  | 'plus'
  | 'upload'
  | 'presentation'
  | 'menu'
  | 'collapse'
  | 'database'
  | 'calculator'
  | 'check'
  | 'settings';

interface OpenWebShellProps {
  workspace: AppWorkspace;
  layoutMode: LayoutMode;
  palette: PaletteId;
  presentationMode: boolean;
  datasetName: string;
  datasetSessionId: string;
  rowCount: number;
  metricName: string;
  actualLabel: string;
  comparisonLabel: string;
  periodLabel: string;
  qualityScore: number;
  analysisHealthy: boolean;
  onWorkspace: (workspace: AppWorkspace) => void;
  onPalette: (palette: PaletteId) => void;
  onNewAnalysis: () => void;
  onOpenPresentation: () => void;
  onUploadFile: (file: File | undefined) => void | Promise<void>;
  children: ReactNode;
}

const darkThemes = new Set<PaletteId>([
  'slate',
  'nvidia',
  'cfo-navy',
  'emerald',
  'copper',
  'royal',
  'solar',
  'plum',
]);

const workspaceDetails: Record<AppWorkspace, { label: string; description: string; icon: IconName }> = {
  guided: {
    label: 'Quick Answer',
    description: 'A guided path from data to a management-ready answer.',
    icon: 'sparkles',
  },
  advanced: {
    label: 'Explore & Analyze',
    description: 'Time intelligence, drivers, hierarchy, evidence, and finance controls.',
    icon: 'chart',
  },
  'public-demo': {
    label: 'Live Public Demo',
    description: 'Explore the multi-million-row procurement demonstration.',
    icon: 'globe',
  },
  quality: {
    label: 'Data Quality',
    description: 'Review readiness, field profiles, issues, and analytical limits.',
    icon: 'shield',
  },
};

function Icon({ name, size = 19 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (name === 'sparkles') return <svg {...common}><path d="m12 3 1.2 3.6L17 8l-3.8 1.4L12 13l-1.2-3.6L7 8l3.8-1.4L12 3Z"/><path d="m5.5 14 .8 2.2 2.2.8-2.2.8L5.5 20l-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/><path d="m18.5 14 .7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z"/></svg>;
  if (name === 'chart') return <svg {...common}><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 3-4 3 2 4-6"/><circle cx="7" cy="15" r="1"/><circle cx="10" cy="11" r="1"/><circle cx="13" cy="13" r="1"/><circle cx="17" cy="7" r="1"/></svg>;
  if (name === 'globe') return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18"/><path d="M12 3a15 15 0 0 0 0 18"/></svg>;
  if (name === 'shield') return <svg {...common}><path d="M12 3 5 6v5c0 4.7 2.8 8.1 7 10 4.2-1.9 7-5.3 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>;
  if (name === 'plus') return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
  if (name === 'upload') return <svg {...common}><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>;
  if (name === 'presentation') return <svg {...common}><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/><path d="m7 13 3-3 2 2 4-4 2 2"/></svg>;
  if (name === 'menu') return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
  if (name === 'collapse') return <svg {...common}><path d="m14 7-5 5 5 5"/><path d="M19 4v16"/></svg>;
  if (name === 'database') return <svg {...common}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>;
  if (name === 'calculator') return <svg {...common}><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h1M12 11h1M16 11h1M8 15h1M12 15h1M16 15h1M8 18h5M16 18h1"/></svg>;
  if (name === 'check') return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>;
}

function workspaceTitle(workspace: AppWorkspace) {
  return workspaceDetails[workspace].label;
}

export function OpenWebShell({
  workspace,
  layoutMode,
  palette,
  presentationMode,
  datasetName,
  datasetSessionId,
  rowCount,
  metricName,
  actualLabel,
  comparisonLabel,
  periodLabel,
  qualityScore,
  analysisHealthy,
  onWorkspace,
  onPalette,
  onNewAnalysis,
  onOpenPresentation,
  onUploadFile,
  children,
}: OpenWebShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const paletteDefinition = paletteById(palette);
  const darkMode = darkThemes.has(palette);
  const style = useMemo(() => ({
    '--ow-accent': paletteDefinition.swatches[1],
    '--ow-accent-secondary': paletteDefinition.swatches[2],
  } as CSSProperties), [paletteDefinition]);

  useEffect(() => {
    if (layoutMode === 'phone') setCollapsed(false);
  }, [layoutMode]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  function chooseWorkspace(next: AppWorkspace) {
    onWorkspace(next);
    setMobileOpen(false);
  }

  async function upload(file: File | undefined) {
    setMobileOpen(false);
    await onUploadFile(file);
  }

  const navItems = (Object.keys(workspaceDetails) as AppWorkspace[]).map((id) => ({ id, ...workspaceDetails[id] }));
  const shellClasses = [
    'ow-shell',
    collapsed ? 'is-collapsed' : '',
    mobileOpen ? 'is-mobile-open' : '',
  ].filter(Boolean).join(' ');

  return <div
    className={shellClasses}
    data-theme={palette}
    data-color-mode={darkMode ? 'dark' : 'light'}
    data-presentation={presentationMode ? 'true' : 'false'}
    data-layout={layoutMode}
    style={style}
  >
    <button type="button" className="ow-sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
    <aside className="ow-sidebar" id="primary-navigation" aria-label="Application navigation">
      <div className="ow-sidebar-brand-row">
        <button type="button" className="ow-brand" onClick={() => chooseWorkspace('guided')} aria-label="Open Quick Answer">
          <span className="ow-brand-mark"><Icon name="chart" size={18} /></span>
          <span className="ow-brand-copy"><strong>Variance Copilot</strong><small>FP&amp;A intelligence</small></span>
        </button>
        <button type="button" className="ow-collapse-button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}><Icon name="collapse" /></button>
      </div>

      <button type="button" className="ow-new-analysis" onClick={() => { onNewAnalysis(); setMobileOpen(false); }}>
        <Icon name="plus" />
        <span>New analysis</span>
      </button>

      <div className="ow-sidebar-section">
        <span className="ow-sidebar-label">Workspace</span>
        <nav className="ow-primary-nav">
          {navItems.map((item) => <button
            key={item.id}
            type="button"
            className={workspace === item.id ? 'active' : ''}
            onClick={() => chooseWorkspace(item.id)}
            aria-current={workspace === item.id ? 'page' : undefined}
            title={item.description}
          >
            <span className="ow-nav-icon"><Icon name={item.icon} /></span>
            <span className="ow-nav-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
            {item.id === 'quality' && <b className={qualityScore >= 80 ? 'healthy' : 'watch'}>{qualityScore.toFixed(0)}</b>}
          </button>)}
        </nav>
      </div>

      <div className="ow-sidebar-section ow-sidebar-tools">
        <span className="ow-sidebar-label">Create</span>
        <button type="button" onClick={() => { onOpenPresentation(); setMobileOpen(false); }}>
          <span className="ow-nav-icon"><Icon name="presentation" /></span>
          <span className="ow-nav-copy"><strong>Presentation Studio</strong><small>Build an evidence-backed slide</small></span>
        </button>
        <label className="ow-sidebar-upload">
          <span className="ow-nav-icon"><Icon name="upload" /></span>
          <span className="ow-nav-copy"><strong>Use your data</strong><small>Upload CSV or JSON</small></span>
          <input type="file" accept=".csv,.json" onChange={(event) => upload(event.target.files?.[0])} />
        </label>
      </div>

      <div className="ow-current-analysis">
        <div className="ow-current-analysis-head"><span className={`ow-status-dot ${analysisHealthy ? 'healthy' : 'watch'}`} /><strong>Current analysis</strong></div>
        <div className="ow-current-analysis-body">
          <span>{datasetName}</span>
          <strong>{metricName}</strong>
          <small>{actualLabel} vs {comparisonLabel}</small>
          <div><span>{rowCount.toLocaleString()} rows</span><span>{periodLabel}</span></div>
        </div>
        <small className="ow-session-id">Session {datasetSessionId.slice(0, 12)}</small>
      </div>

      <footer className="ow-sidebar-footer">
        <div className="ow-sidebar-theme"><ThemePicker value={palette} onChange={onPalette} /></div>
        <div className="ow-evidence-status"><span className="ow-status-dot healthy" /><span><strong>Evidence mode</strong><small>Deterministic calculations</small></span></div>
      </footer>
    </aside>

    <section className="ow-stage">
      <header className="ow-topbar">
        <div className="ow-topbar-left">
          <button type="button" className="ow-mobile-menu" onClick={() => setMobileOpen(true)} aria-controls="primary-navigation" aria-expanded={mobileOpen}><Icon name="menu" /></button>
          <div className="ow-topbar-title"><span>FP&amp;A workspace</span><strong>{workspaceTitle(workspace)}</strong></div>
        </div>
        <div className="ow-topbar-context" aria-label="Current analysis context">
          <span><Icon name="database" size={15} /> {datasetName}</span>
          <span><Icon name="calculator" size={15} /> {metricName}</span>
          <span className={analysisHealthy ? 'healthy' : 'watch'}><Icon name="check" size={15} /> Quality {qualityScore.toFixed(0)}</span>
        </div>
        <div className="ow-topbar-actions">
          <button type="button" className="ow-model-status" title="Financial values are calculated by deterministic analytical engines. The LLM is optional and explanation-only.">
            <span className="ow-status-dot healthy" />
            <span><small>Analysis mode</small><strong>Evidence-first</strong></span>
          </button>
          <button type="button" className="ow-icon-action ow-presentation-action" onClick={onOpenPresentation} title="Open Presentation Studio"><Icon name="presentation" /><span>Present</span></button>
          <label className="ow-icon-action ow-upload-action" title="Upload CSV or JSON"><Icon name="upload" /><span>Upload</span><input type="file" accept=".csv,.json" onChange={(event) => upload(event.target.files?.[0])} /></label>
          <div className="ow-topbar-theme"><ThemePicker value={palette} onChange={onPalette} /></div>
          <button type="button" className="ow-avatar" title="Local browser session" aria-label="Local browser session">FP</button>
        </div>
      </header>

      <nav className="ow-mobile-nav" aria-label="Mobile workspace navigation">
        {navItems.map((item) => <button key={item.id} type="button" className={workspace === item.id ? 'active' : ''} onClick={() => chooseWorkspace(item.id)}><Icon name={item.icon} /><span>{item.label.replace('Live Public Demo', 'Live Demo').replace('Explore & Analyze', 'Explore')}</span></button>)}
      </nav>

      <div className="ow-content">{children}</div>
    </section>
  </div>;
}
