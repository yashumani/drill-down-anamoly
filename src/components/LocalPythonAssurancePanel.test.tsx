/** Server-rendered structure only; no actual browser execution is claimed. */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalPythonAssurancePanel } from './LocalPythonAssurancePanel';

afterEach(() => vi.unstubAllGlobals());
describe('optional local Python panel structure', () => {
  it('does not connect automatically and explains the original-file non-gating scope', () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const html = renderToStaticMarkup(createElement(LocalPythonAssurancePanel));
    expect(html).toContain('Optional Python rule preview');
    expect(html).toContain('Choose an original CSV');
    expect(html).toContain('non-gating');
    expect(html).toContain('Run Python preview');
    expect(html).toContain('disabled');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('shows an exact local-origin startup command when rendered in a local app', () => {
    vi.stubGlobal('location', { origin: 'http://localhost:5173' });
    const html = renderToStaticMarkup(createElement(LocalPythonAssurancePanel));
    expect(html).toContain('reporting-assurance studio --port 8765 --allow-origin http://localhost:5173');
    expect(html).not.toContain('Open this app locally over HTTP');
    expect(html).toContain('Control reference name');
  });
});
