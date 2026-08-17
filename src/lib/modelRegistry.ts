export type ModelDeploymentMode = 'deterministic' | 'local' | 'external';
export type ModelApprovalStatus = 'approved-demo' | 'evaluation-required' | 'blocked';

export interface ModelProfile {
  profileId: string;
  displayName: string;
  deploymentMode: ModelDeploymentMode;
  provider: string;
  modelId: string;
  modelArtifactDigest?: string;
  promptVersion: string;
  evidenceSchemaVersion: string;
  responseSchemaVersion: string;
  approvalStatus: ModelApprovalStatus;
  intendedUse: string[];
  prohibitedUse: string[];
  limitations: string[];
}

export const EVIDENCE_SCHEMA_VERSION = 'finance-evidence-v1';
export const AGENT_RESPONSE_SCHEMA_VERSION = 'finance-agent-response-v1';
export const FP_AND_A_PROMPT_VERSION = 'fpa-system-prompt-v2';

export const modelProfiles: readonly ModelProfile[] = [
  {
    profileId: 'deterministic-finance-guide-v1',
    displayName: 'Deterministic Finance Guide',
    deploymentMode: 'deterministic',
    provider: 'application',
    modelId: 'rules-and-tools',
    promptVersion: 'not-applicable',
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    responseSchemaVersion: AGENT_RESPONSE_SCHEMA_VERSION,
    approvalStatus: 'approved-demo',
    intendedUse: ['Explain verified variance evidence', 'Navigate supported drill actions', 'Provide conservative validation guidance'],
    prohibitedUse: ['Create official accounting conclusions', 'Infer causality', 'Change source data'],
    limitations: ['Natural-language coverage is narrower than an LLM.'],
  },
  {
    profileId: 'local-ollama-fpa-v1',
    displayName: 'Local FP&A Variance Copilot',
    deploymentMode: 'local',
    provider: 'Ollama',
    modelId: 'fpa-variance-copilot',
    promptVersion: FP_AND_A_PROMPT_VERSION,
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    responseSchemaVersion: AGENT_RESPONSE_SCHEMA_VERSION,
    approvalStatus: 'evaluation-required',
    intendedUse: ['Summarize verified evidence', 'Draft provisional FP&A commentary', 'Suggest validation questions'],
    prohibitedUse: ['Autonomous posting', 'Unreviewed CFO commentary', 'Causal claims without tested evidence', 'Exposure of sensitive row-level data'],
    limitations: ['The base model is a general model controlled by a system profile, not a finance-certified model.', 'Local performance varies by hardware and quantization.'],
  },
  {
    profileId: 'byo-openai-compatible-v1',
    displayName: 'Bring Your Own OpenAI-Compatible Model',
    deploymentMode: 'external',
    provider: 'user-configured',
    modelId: 'user-configured',
    promptVersion: FP_AND_A_PROMPT_VERSION,
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    responseSchemaVersion: AGENT_RESPONSE_SCHEMA_VERSION,
    approvalStatus: 'evaluation-required',
    intendedUse: ['Evidence-grounded conversational analysis'],
    prohibitedUse: ['Sending protected data without authorization', 'Unreviewed executive publishing'],
    limitations: ['The application cannot verify provider retention, residency, or training policies in browser-direct mode.'],
  },
] as const;

export function modelProfile(profileId: string) {
  return modelProfiles.find((profile) => profile.profileId === profileId) ?? modelProfiles[0];
}
