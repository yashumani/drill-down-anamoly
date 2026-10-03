import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { disconnectCopilotKitRuntime } from '../lib/copilotKitConfig';

interface CopilotFeatureErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface CopilotFeatureErrorBoundaryState {
  failed: boolean;
}

export class CopilotFeatureErrorBoundary extends Component<
  CopilotFeatureErrorBoundaryProps,
  CopilotFeatureErrorBoundaryState
> {
  state: CopilotFeatureErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): CopilotFeatureErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Optional CopilotKit UI failed to load.', error, errorInfo);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function CopilotKitRecoveryNotice({
  compact = false,
  detail = '',
}: {
  compact?: boolean;
  detail?: string;
}) {
  return <div className={compact ? 'inline-error copilotkit-recovery-notice' : 'error copilotkit-recovery-notice'} role="alert">
    <strong>CopilotKit is unavailable.</strong>{' '}
    <span>The deterministic finance experience is still available.{detail ? ` ${detail}` : ''}</span>{' '}
    <button type="button" onClick={disconnectCopilotKitRuntime}>Disconnect optional runtime and reload</button>
  </div>;
}
