import type { LlmConfig } from './llm';

export const LOCAL_FP_AND_A_MODEL = 'fpa-variance-copilot';
export const LOCAL_OLLAMA_CHAT_ENDPOINT = 'http://127.0.0.1:11434/v1/chat/completions';

export function localOllamaPreset(): LlmConfig {
  return {
    enabled: true,
    endpoint: LOCAL_OLLAMA_CHAT_ENDPOINT,
    model: LOCAL_FP_AND_A_MODEL,
    apiKey: '',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
  };
}

export function localOllamaOriginCommand(origin = typeof window === 'undefined' ? 'https://yashumani.github.io' : window.location.origin) {
  return `OLLAMA_ORIGINS=${origin} ollama serve`;
}

export const LOCAL_OLLAMA_SETUP_STEPS = [
  'ollama pull llama3.2',
  'ollama create fpa-variance-copilot -f local-ai/ollama/Modelfile',
] as const;
