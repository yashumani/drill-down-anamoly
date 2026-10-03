import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  CopilotKitContext,
  CopilotKitCoreReact,
} from '@copilotkit/react-core/v2/context';
import type { CopilotKitContextValue } from '@copilotkit/react-core/v2/context';
import { copilotKitRuntimeUrl } from '../lib/copilotKitConfig';

export default function CopilotKitProviderLoaded({ children }: { children: ReactNode }) {
  const coreRef = useRef<CopilotKitCoreReact | null>(null);
  if (coreRef.current === null) {
    coreRef.current = new CopilotKitCoreReact({
      runtimeUrl: copilotKitRuntimeUrl,
      runtimeTransport: 'single',
      deferInitialConnection: true,
    });
  }
  const copilotkit = coreRef.current;
  const [executingToolCallIds, setExecutingToolCallIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    copilotkit.setRuntimeUrl(copilotKitRuntimeUrl);
    copilotkit.setRuntimeTransport('single');
    copilotkit.connect();
  }, [copilotkit]);

  useEffect(() => {
    const subscription = copilotkit.subscribe({
      onToolExecutionStart: ({ toolCallId }) => setExecutingToolCallIds((current) => {
        if (current.has(toolCallId)) return current;
        const next = new Set(current);
        next.add(toolCallId);
        return next;
      }),
      onToolExecutionEnd: ({ toolCallId }) => setExecutingToolCallIds((current) => {
        if (!current.has(toolCallId)) return current;
        const next = new Set(current);
        next.delete(toolCallId);
        return next;
      }),
    });
    return () => subscription.unsubscribe();
  }, [copilotkit]);

  const context = useMemo<CopilotKitContextValue>(
    () => ({ copilotkit, executingToolCallIds }),
    [copilotkit, executingToolCallIds],
  );

  return <CopilotKitContext.Provider value={context}>{children}</CopilotKitContext.Provider>;
}
