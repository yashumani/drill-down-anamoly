import { useState } from 'react';
import {
  configureCopilotKitRuntime,
  storedCopilotKitRuntimeUrl,
} from '../lib/copilotKitConfig';

export function CopilotKitSetupCard() {
  const [runtimeUrl, setRuntimeUrl] = useState(() => storedCopilotKitRuntimeUrl() || 'http://127.0.0.1:4000/api/copilotkit');
  const [agentId, setAgentId] = useState('default');
  const [error, setError] = useState('');

  function connect() {
    try {
      setError('');
      configureCopilotKitRuntime(runtimeUrl, agentId);
    } catch (connectionError) {
      setError(connectionError instanceof Error ? connectionError.message : String(connectionError));
    }
  }

  return <details className="llm-settings copilotkit-setup-card">
    <summary>Use CopilotKit agent orchestration</summary>
    <p>Connect a CopilotKit runtime to let the agent read the current evidence context and invoke validated drill, reset, back, and dimension-selection actions. The deterministic finance engine remains authoritative.</p>
    <label>CopilotKit runtime URL<input value={runtimeUrl} onChange={(event) => setRuntimeUrl(event.target.value)} placeholder="https://your-runtime.example.com/api/copilotkit" /></label>
    <div className="settings-row"><label>Agent ID<input value={agentId} onChange={(event) => setAgentId(event.target.value)} placeholder="default" /></label><div className="copilotkit-connect-action"><button type="button" onClick={connect}>Connect and reload</button></div></div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <small>GitHub Pages cannot host the runtime. Run the included service locally or deploy it behind HTTPS, then paste that endpoint here. Localhost works only on the same device.</small>
  </details>;
}
