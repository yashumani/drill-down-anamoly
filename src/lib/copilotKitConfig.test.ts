import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeCopilotKitRuntimeUrl } from './copilotKitConfig';

const RUNTIME_STORAGE_KEY = 'fpa-copilotkit-runtime-url';

function installBrowserConfig(query: string, storedRuntime = '') {
  const values = new Map<string, string>();
  if (storedRuntime) values.set(RUNTIME_STORAGE_KEY, storedRuntime);

  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal('window', {
    location: {
      search: query,
      reload: vi.fn(),
    },
  });

  return values;
}

async function loadConfig() {
  vi.resetModules();
  return import('./copilotKitConfig');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('CopilotKit runtime URL policy', () => {
  it('allows HTTPS runtimes and HTTP only on loopback hosts', () => {
    expect(normalizeCopilotKitRuntimeUrl('https://runtime.example.com/api/copilotkit'))
      .toBe('https://runtime.example.com/api/copilotkit');
    expect(normalizeCopilotKitRuntimeUrl('http://localhost:4000/api/copilotkit'))
      .toBe('http://localhost:4000/api/copilotkit');
    expect(normalizeCopilotKitRuntimeUrl('http://127.0.0.1:4000/api/copilotkit'))
      .toBe('http://127.0.0.1:4000/api/copilotkit');
    expect(() => normalizeCopilotKitRuntimeUrl('http://[::1]:4000/api/copilotkit'))
      .toThrow(/HTTPS/);
    expect(() => normalizeCopilotKitRuntimeUrl('http://runtime.example.com/api/copilotkit'))
      .toThrow(/HTTPS/);
  });
});

describe('CopilotKit runtime source selection', () => {
  it('keeps persisted manual configuration ahead of untrusted query input', async () => {
    const storedRuntime = 'https://manual.example.com/api/copilotkit';
    const values = installBrowserConfig(
      '?copilotRuntime=https%3A%2F%2Fquery.example.com%2Fapi%2Fcopilotkit',
      storedRuntime,
    );

    const config = await loadConfig();

    expect(config.copilotKitRuntimeUrl).toBe(storedRuntime);
    expect(values.get(RUNTIME_STORAGE_KEY)).toBe(storedRuntime);
  });

  it('keeps trusted build configuration ahead of untrusted query input', async () => {
    const trustedRuntime = 'https://trusted.example.com/api/copilotkit';
    const values = installBrowserConfig(
      '?copilotRuntime=https%3A%2F%2Fquery.example.com%2Fapi%2Fcopilotkit',
    );
    vi.stubEnv('VITE_COPILOTKIT_RUNTIME_URL', trustedRuntime);

    const config = await loadConfig();

    expect(config.copilotKitRuntimeUrl).toBe(trustedRuntime);
    expect(values.has(RUNTIME_STORAGE_KEY)).toBe(false);
  });

  it('does not configure or persist a runtime from query input alone', async () => {
    const values = installBrowserConfig(
      '?copilotRuntime=https%3A%2F%2Fquery.example.com%2Fapi%2Fcopilotkit',
    );

    const config = await loadConfig();

    expect(config.copilotKitConfigured).toBe(false);
    expect(config.copilotKitRuntimeUrl).toBe('');
    expect(values.has(RUNTIME_STORAGE_KEY)).toBe(false);
  });
});
