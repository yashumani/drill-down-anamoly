import { useEffect, useMemo, useRef, useState } from 'react';
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
  | 'more'
  | 'close';

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

const workspaceDetails: Record<AppWorkspace, { label: string; short: string; description: string; icon: IconName }> = {
  guided: {
    label: 'Quick Answer',
    short: 'Answer',
    description: 'Start with the management question and get one clear answer.',
    icon: 'sparkles',
  },
  advanced: {
    label: 'Explore & Analyze',
    short: 'Explore',
    description: 'Investigate trend, drivers, hierarchy, and evidence.',
    icon: 'chart',
  },
  quality: {
    label: 'Data Quality',
    short: 'Trust',
    description: 'Confirm whether the data and conclusions are ready to use.',
    icon: 'shield',
  },
  'public-demo': {
    label: 'Live Public Demo',
    short: 'Demo',
    description: 'Explore the multi-million-row procurement demonstration.',
    icon: 'globe',
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
  if (name === 'sparkles') return <svg {...common}><path d="m12 3 1.3 3.7L16 8l-3.7 1.3L11 13l-1.3-3.7L6 8l3.7-1.3L11 3Z"/><path d="m18.5 13 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/></svg>;
  if (name === 'chart') return <svg {...common}><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/></svg>;
  if (name === 'globe') return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.4 2.5 3.7 5.5 3.7 9S14.4 18.5 12 21c-2.4-2.5-3.7-5.5-3.7-9S9.6 5.5 12 3Z"/></svg>;
  if (name === 'shield') return <svg {...common}><path d="M12 3 5 6v5c0 4.7 2.8 8 7 10 4.2-2 7-5.3 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>;
  if (name === 'plus') return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
  if (name === 'upload') return <svg {...common}><path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M5 14v5h14v-5"/></svg>;
  if (name === 'presentation') return <svg {...common}><path d="M4 4h16v11H4z"/><path d="M8 20l4-5 4 5M8 9h2m2 0h4"/></svg>;
  if (name === 'menu') return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
  if (name === 'collapse') return <svg {...common}><path d="m15 6-6 6 6 6"/></svg>;
  if (name === 'database') return <svg {...common}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>;
  if (name === 'calculator') return <svg {...common}><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h1m3 0h1m3 0h1M8 15h1m3 0h1m3 0h1M8 19h5m3 0h1"/></svg>;
  if (name === 'check') return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
  if (name === 'more') return <svg {...common}><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></svg>;
  if (name === 'close') return <svg {...common}><path d="m6 6 12 12M18 6 6 18"/></svg>;
  return null;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => item[0]?.toUpperCase())
    .join('') || 'FP';
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
  const isPhone = layoutMode === 'phone';
  const isTablet = layoutMode === 'tablet';
  const uploadRef = useRef<HTMLInputElement>(null);
  const actionsRef = useRef<HTMLDetailsElement>(null);
  const paletteDefinition = paletteById(palette);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('anomaly-sidebar-collapsed');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(max-width: 1480px)').matches;
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (isPhone || isTablet) setMobileMenuOpen(false);
  }, [workspace, isPhone, isTablet]);

  useEffect(() => {
    try { localStorage.setItem('anomaly-sidebar-collapsed', String(sidebarCollapsed)); } catch { /* browser privacy mode */ }
  }, [sidebarCollapsed]);

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
        actionsRef.current?.removeAttribute('open');
      }
    }
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, []);

  const shellTheme = darkThemes.has(palette) ? 'dark' : 'light';
  const shellStyle = useMemo(() => ({
    '--ow-accent': paletteDefinition.swatches[0],
    '--ow-accent-soft': `${paletteDefinition.swatches[0]}22`,
  }) as CSSProperties, [paletteDefinition]);

  function chooseWorkspace(value: AppWorkspace) {
    onWorkspace(value);
    setMobileMenuOpen(false);
  }

  function triggerUpload() {
    actionsRef.current?.removeAttribute('open');
    uploadRef.current?.click();
  }

  function uploadChanged(file: File | undefined) {
    void onUploadFile(file);
    if (uploadRef.current) uploadRef.current.value = '';
  }

  const workspaceButton = (value: AppWorkspace) => {
    const details = workspaceDetails[value];
    return <button
      type="button"
      className={`ow-nav-item ${workspace === value ? 'active' : ''}`}
      aria-current={workspace === value ? 'page' : undefined}
      title={sidebarCollapsed && !isPhone && !isTablet ? `${details.label}: ${details.description}` : details.description}
      onClick={() => chooseWorkspace(value)}
    >
      <span className="ow-nav-icon"><Icon name={details.icon} /></span>
      <span className="ow-nav-copy"><strong>{details.label}</strong><small>{details.description}</small></span>
    </button>;
  };

  const sidebar = <aside className="ow-sidebar" aria-label="FP&A workspaces">
    <div className="ow-sidebar-head">
      <button type="button" className="ow-brand" onClick={() => chooseWorkspace('guided')} title="FP&A Variance Copilot home">
        <span className="ow-brand-mark">FP</span>
        <span className="ow-brand-copy"><strong>Variance Copilot</strong><small>Evidence-first FP&A</small></span>
      </button>
      {!isPhone && !isTablet && <button
        type="button"
        className="ow-icon-button ow-collapse-button"
        onClick={() => setSidebarCollapsed((current) => !current)}
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      ><Icon name="collapse" /></button>}
      {(isPhone || isTablet) && <button type="button" className="ow-icon-button" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation"><Icon name="close" /></button>}
    </div>

    <button type="button" className="ow-new-analysis" onClick={onNewAnalysis} title="Reset the current state and begin a new analysis">
      <Icon name="plus" /><span>New analysis</span>
    </button>

    <nav className="ow-sidebar-nav">
      <section>
        <span className="ow-nav-section-label">Start</span>
        {workspaceButton('guided')}
      </section>
      <section>
        <span className="ow-nav-section-label">Investigate</span>
        {workspaceButton('advanced')}
        {workspaceButton('quality')}
      </section>
      <section>
        <span className="ow-nav-section-label">Output</span>
        <button type="button" className="ow-nav-item" onClick={onOpenPresentation} title="Turn the current verified analysis into a presentation slide">
          <span className="ow-nav-icon"><Icon name="presentation" /></span>
          <span className="ow-nav-copy"><strong>Presentation Studio</strong><small>Create a finance-ready infographic without AI.</small></span>
        </button>
      </section>
      <section>
        <span className="ow-nav-section-label">Demo</span>
        {workspaceButton('public-demo')}
      </section>
    </nav>

    <div className="ow-current-analysis" aria-label="Current analysis context">
      <div className="ow-analysis-avatar">{initials(datasetName)}</div>
      <div className="ow-analysis-copy">
        <span>Current analysis</span>
        <strong>{datasetName}</strong>
        <small>{metricName} · {periodLabel}</small>
        <small>{rowCount.toLocaleString()} rows · {datasetSessionId.slice(0, 14)}</small>
      </div>
    </div>

    <div className="ow-sidebar-footer">
      <button type="button" className="ow-sidebar-action" onClick={triggerUpload} title="Upload a CSV or JSON file"><Icon name="upload" /><span>Upload data</span></button>
      <ThemePicker value={palette} onChange={onPalette} />
    </div>
  </aside>;

  return <div
    className="ow-app"
    data-shell-theme={shellTheme}
    data-sidebar-collapsed={sidebarCollapsed && !isPhone && !isTablet ? 'true' : 'false'}
    data-mobile-menu={mobileMenuOpen ? 'open' : 'closed'}
    data-presentation-mode={presentationMode ? 'true' : 'false'}
    style={shellStyle}
  >
    <input ref={uploadRef} className="ow-hidden-upload" type="file" accept=".csv,.json" onChange={(event) => uploadChanged(event.target.files?.[0])} />

    {!isPhone && !isTablet && sidebar}
    {(isPhone || isTablet) && <>
      <div className={`ow-mobile-backdrop ${mobileMenuOpen ? 'visible' : ''}`} onClick={() => setMobileMenuOpen(false)} aria-hidden="true" />
      <div className={`ow-mobile-drawer ${mobileMenuOpen ? 'open' : ''}`}>{sidebar}</div>
    </>}

    <section className="ow-workspace-shell">
      <header className="ow-topbar">
        <div className="ow-topbar-start">
          {(isPhone || isTablet) && <button type="button" className="ow-icon-button" onClick={() => setMobileMenuOpen(true)} aria-label="Open navigation"><Icon name="menu" /></button>}
          <div className="ow-workspace-title">
            <span>{workspaceDetails[workspace].label}</span>
            <small>{workspaceDetails[workspace].description}</small>
          </div>
        </div>

        <div className="ow-context-strip" aria-label="Current dataset and metric">
          <div className="ow-context-pill"><Icon name="database" size={16} /><span><small>Dataset</small><strong>{datasetName}</strong></span></div>
          <div className="ow-context-pill"><Icon name="calculator" size={16} /><span><small>Metric</small><strong>{metricName}</strong></span></div>
          <div className={`ow-context-pill ow-status-pill ${analysisHealthy ? 'healthy' : 'watch'}`}><Icon name={analysisHealthy ? 'check' : 'shield'} size={16} /><span><small>Status</small><strong>{analysisHealthy ? 'Ready to explore' : 'Review limitations'}</strong></span></div>
        </div>

        <div className="ow-topbar-actions">
          <button type="button" className="ow-present-button" onClick={onOpenPresentation} title="Create a slide from the current verified analysis"><Icon name="presentation" size={17} /><span>Present</span></button>
          <details ref={actionsRef} className="ow-actions-menu">
            <summary className="ow-icon-button" aria-label="More workspace actions" title="More actions"><Icon name="more" /></summary>
            <div className="ow-actions-popover">
              <div className="ow-actions-context">
                <span>Current comparison</span>
                <strong>{actualLabel} vs {comparisonLabel}</strong>
                <small>{periodLabel} · quality {qualityScore.toFixed(0)}/100</small>
              </div>
              <button type="button" onClick={triggerUpload}><Icon name="upload" size={17} /><span><strong>Upload data</strong><small>CSV or JSON</small></span></button>
              <button type="button" onClick={onNewAnalysis}><Icon name="plus" size={17} /><span><strong>New analysis</strong><small>Reset the current investigation</small></span></button>
              <div className="ow-actions-theme"><span>Theme</span><ThemePicker value={palette} onChange={onPalette} /></div>
            </div>
          </details>
        </div>
      </header>

      <div className="ow-canvas">{children}</div>
    </section>

    {isPhone && <nav className="ow-mobile-bottom-nav" aria-label="Primary workspaces">
      {(['guided', 'advanced', 'quality', 'public-demo'] as AppWorkspace[]).map((value) => {
        const details = workspaceDetails[value];
        return <button type="button" key={value} className={workspace === value ? 'active' : ''} onClick={() => chooseWorkspace(value)} aria-current={workspace === value ? 'page' : undefined}>
          <Icon name={details.icon} size={18} /><span>{details.short}</span>
        </button>;
      })}
    </nav>}
  </div>;
}
