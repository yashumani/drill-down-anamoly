export type CopilotRuntimeStatus = 'disconnected' | 'connected' | 'connecting' | 'error';

export interface CopilotAvailability {
  canRun: boolean;
  label: string;
}

export function describeCopilotAvailability(
  runtimeStatus: CopilotRuntimeStatus,
  agentReady: boolean,
  agentRunning: boolean,
  runtimeAgentAvailable: boolean,
): CopilotAvailability {
  if (runtimeStatus === 'error') return { canRun: false, label: 'Runtime unavailable.' };
  if (runtimeStatus === 'disconnected') return { canRun: false, label: 'Runtime disconnected.' };
  if (runtimeStatus === 'connecting') return { canRun: false, label: 'Connecting.' };
  if (!runtimeAgentAvailable) return { canRun: false, label: 'Agent unavailable.' };
  if (!agentReady) return { canRun: false, label: 'Agent connecting.' };
  return { canRun: true, label: agentRunning ? 'Running tools.' : 'Runtime ready' };
}

export type CopilotRunOutcome = 'success' | 'interrupt' | 'failure' | 'unknown';

export function shouldUseDeterministicFallback(outcome: CopilotRunOutcome) {
  if (outcome === 'failure') return true;
  if (outcome === 'success' || outcome === 'interrupt') return false;
  // Core 1.69.2 can return identical result payloads for success and failure.
  // Without a terminal lifecycle event, classify the turn as incomplete.
  return true;
}
