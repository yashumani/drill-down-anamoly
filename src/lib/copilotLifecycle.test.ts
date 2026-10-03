import { describe, expect, it } from 'vitest';
import {
  describeCopilotAvailability,
  shouldUseDeterministicFallback,
} from './copilotLifecycle';

describe('Copilot lifecycle', () => {
  it.each([
    ['disconnected', 'Runtime disconnected.'],
    ['connecting', 'Connecting.'],
    ['error', 'Runtime unavailable.'],
  ] as const)('does not report %s runtimes as ready', (runtimeStatus, label) => {
    expect(describeCopilotAvailability(runtimeStatus, true, false, true)).toEqual({
      canRun: false,
      label,
    });
  });

  it('requires both a connected runtime and a ready agent', () => {
    expect(describeCopilotAvailability('connected', false, false, true)).toEqual({
      canRun: false,
      label: 'Agent connecting.',
    });
    expect(describeCopilotAvailability('connected', true, false, false)).toEqual({
      canRun: false,
      label: 'Agent unavailable.',
    });
    expect(describeCopilotAvailability('connected', true, false, true)).toEqual({
      canRun: true,
      label: 'Runtime ready',
    });
    expect(describeCopilotAvailability('connected', true, true, true)).toEqual({
      canRun: true,
      label: 'Running tools.',
    });
  });

  it('does not fall back after a successful terminal lifecycle event', () => {
    expect(shouldUseDeterministicFallback('success')).toBe(false);
  });

  it('falls back after an explicit lifecycle failure', () => {
    expect(shouldUseDeterministicFallback('failure')).toBe(true);
  });

  it('falls back without a terminal lifecycle outcome and accepts interrupts', () => {
    expect(shouldUseDeterministicFallback('unknown')).toBe(true);
    expect(shouldUseDeterministicFallback('interrupt')).toBe(false);
  });
});
