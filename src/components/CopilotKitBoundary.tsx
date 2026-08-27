import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { copilotKitConfigured } from '../lib/copilotKitConfig';

const CopilotKitProviderLoaded = lazy(() => import('./CopilotKitProviderLoaded'));

export function CopilotKitBoundary({ children }: { children: ReactNode }) {
  if (!copilotKitConfigured) return children;
  return <Suspense fallback={<div className="copilotkit-boot" role="status">Connecting the FP&amp;A copilot…</div>}>
    <CopilotKitProviderLoaded>{children}</CopilotKitProviderLoaded>
  </Suspense>;
}
