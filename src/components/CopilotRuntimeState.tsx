import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { CopilotRuntimeStatus } from '../lib/copilotLifecycle';

export interface CopilotRuntimeState {
  providerAvailable: boolean;
  runtimeStatus: CopilotRuntimeStatus;
  runtimeError: string;
}

const disconnectedState: CopilotRuntimeState = {
  providerAvailable: false,
  runtimeStatus: 'disconnected',
  runtimeError: '',
};

const CopilotRuntimeStateContext = createContext<CopilotRuntimeState>(disconnectedState);

export function CopilotRuntimeStateProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: CopilotRuntimeState;
}) {
  return <CopilotRuntimeStateContext.Provider value={value}>{children}</CopilotRuntimeStateContext.Provider>;
}

export function useCopilotRuntimeState() {
  return useContext(CopilotRuntimeStateContext);
}
