const RUNTIME_STORAGE_KEY = 'fpa-copilotkit-runtime-url';
const AGENT_STORAGE_KEY = 'fpa-copilotkit-agent-id';

function safeStorageGet(key: string) {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function safeStorageSet(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // The deterministic application remains usable when storage is blocked.
  }
}

export function normalizeCopilotKitRuntimeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const parsed = new URL(trimmed);
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && localHost)) {
    throw new Error('Use HTTPS for remote CopilotKit runtimes. HTTP is allowed only for localhost development.');
  }
  return parsed.toString().replace(/\/$/, '');
}

function runtimeFromQuery() {
  if (typeof window === 'undefined') return '';
  const value = new URLSearchParams(window.location.search).get('copilotRuntime') ?? '';
  if (!value) return '';
  try {
    const normalized = normalizeCopilotKitRuntimeUrl(value);
    safeStorageSet(RUNTIME_STORAGE_KEY, normalized);
    return normalized;
  } catch {
    return '';
  }
}

const configuredRuntime = typeof window === 'undefined'
  ? ''
  : runtimeFromQuery() || safeStorageGet(RUNTIME_STORAGE_KEY) || String(import.meta.env.VITE_COPILOTKIT_RUNTIME_URL ?? '').trim();

export const copilotKitRuntimeUrl = (() => {
  try {
    return normalizeCopilotKitRuntimeUrl(configuredRuntime);
  } catch {
    return '';
  }
})();

export const copilotKitAgentId = typeof window === 'undefined'
  ? 'default'
  : safeStorageGet(AGENT_STORAGE_KEY) || String(import.meta.env.VITE_COPILOTKIT_AGENT_ID ?? '').trim() || 'default';

export const copilotKitConfigured = Boolean(copilotKitRuntimeUrl);

export function configureCopilotKitRuntime(runtimeUrl: string, agentId = 'default') {
  const normalized = normalizeCopilotKitRuntimeUrl(runtimeUrl);
  safeStorageSet(RUNTIME_STORAGE_KEY, normalized);
  safeStorageSet(AGENT_STORAGE_KEY, agentId.trim() || 'default');
  if (typeof window !== 'undefined') window.location.reload();
}

export function disconnectCopilotKitRuntime() {
  safeStorageSet(RUNTIME_STORAGE_KEY, '');
  safeStorageSet(AGENT_STORAGE_KEY, '');
  if (typeof window !== 'undefined') window.location.reload();
}

export function storedCopilotKitRuntimeUrl() {
  return safeStorageGet(RUNTIME_STORAGE_KEY);
}
