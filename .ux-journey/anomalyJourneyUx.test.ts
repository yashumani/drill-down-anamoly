import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const shell = readFileSync(new URL('../components/OpenWebShell.tsx', import.meta.url), 'utf8');
const journey = readFileSync(new URL('../components/AnalysisJourneyNav.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../openwebui-adapt.css', import.meta.url), 'utf8');

describe('anomaly investigation UX', () => {
  it('keeps the primary workspaces grouped by user task', () => {
    expect(shell).toContain('Start');
    expect(shell).toContain('Investigate');
    expect(shell).toContain('Output');
    expect(shell).toContain('Demo');
  });

  it('defines the complete scope-to-share journey', () => {
    for (const label of ['Scope', 'Detect', 'Explain', 'Drill', 'Validate', 'Share']) {
      expect(journey).toContain(`label: '${label}'`);
    }
  });

  it('contains explicit laptop and short-viewport safeguards', () => {
    expect(css).toContain('@media (max-width: 1480px) and (min-width: 1025px)');
    expect(css).toContain('@media (max-height: 800px) and (min-width: 1025px)');
    expect(css).toContain('overflow-x: auto');
  });
});
