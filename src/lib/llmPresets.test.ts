import { describe, expect, it } from 'vitest';
import { LOCAL_FP_AND_A_MODEL, selectLocalOllamaModel } from './llmPresets';

describe('local Ollama model selection', () => {
  it('prefers the finance alias when it exists', () => {
    expect(selectLocalOllamaModel(['llama3.2:latest', LOCAL_FP_AND_A_MODEL])).toBe(LOCAL_FP_AND_A_MODEL);
  });

  it('falls back to a detected base model when the finance alias is not created yet', () => {
    expect(selectLocalOllamaModel(['embedding-model', 'llama3.2:latest'])).toBe('llama3.2:latest');
    expect(selectLocalOllamaModel(['qwen2.5:7b'])).toBe('qwen2.5:7b');
  });

  it('returns an empty value when no model is installed', () => {
    expect(selectLocalOllamaModel([])).toBe('');
  });
});
