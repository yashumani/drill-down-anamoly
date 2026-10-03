import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { copilotKitConfigured } from '../lib/copilotKitConfig';
import {
  CopilotFeatureErrorBoundary,
  CopilotKitRecoveryNotice,
} from './CopilotFeatureErrorBoundary';

const CopilotKitProviderLoaded = lazy(() => import('./CopilotKitProviderLoaded'));

export function CopilotKitBoundary({ children }: { children: ReactNode }) {
  if (!copilotKitConfigured) return children;
  return <CopilotFeatureErrorBoundary fallback={<><CopilotKitRecoveryNotice />{children}</>}>
    <Suspense fallback={<div className="copilotkit-boot" role="status">Connecting the FP&amp;A copilot…</div>}>
      <CopilotKitProviderLoaded>{children}</CopilotKitProviderLoaded>
    </Suspense>
  </CopilotFeatureErrorBoundary>;
}
