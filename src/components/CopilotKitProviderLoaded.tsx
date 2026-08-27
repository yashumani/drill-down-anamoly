import type { ReactNode } from 'react';
import { CopilotKit } from '@copilotkit/react-core/v2';
import { copilotKitRuntimeUrl } from '../lib/copilotKitConfig';

export default function CopilotKitProviderLoaded({ children }: { children: ReactNode }) {
  return <CopilotKit runtimeUrl={copilotKitRuntimeUrl} useSingleEndpoint>
    {children}
  </CopilotKit>;
}
