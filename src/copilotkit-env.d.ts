interface ImportMetaEnv {
  readonly VITE_COPILOTKIT_RUNTIME_URL?: string;
  readonly VITE_COPILOTKIT_AGENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
