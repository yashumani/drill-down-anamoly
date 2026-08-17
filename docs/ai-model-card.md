# AI model card — FP&A Variance Copilot

## Profiles

### Deterministic Finance Guide

- Provider: application rules and verified tools.
- Status: approved for the public demo.
- Intended use: explain evidence, navigate supported drills, suggest validation.
- Limitation: narrower language coverage than an LLM.

### Local FP&A Variance Copilot

- Provider: Ollama.
- Base model: `llama3.2` through the `fpa-variance-copilot` Modelfile.
- Status: evaluation required.
- Intended use: provisional evidence-grounded narrative and validation questions.
- Prohibited use: autonomous publishing, official accounting conclusions, unsupported causality.
- Artifact note: the repository pins configuration and prompt, not model weights or digest.

### Bring Your Own OpenAI-Compatible Model

- Provider and model: user configured.
- Status: evaluation required.
- Limitation: the browser cannot verify provider retention, residency, training, or logging policies.

## Contracts

- Prompt version: `fpa-system-prompt-v2`.
- Evidence schema: `finance-evidence-v1`.
- Response schema: `finance-agent-response-v1`.

## Required evaluation dimensions

- numeric fidelity;
- favorable/unfavorable interpretation;
- aggregation compliance;
- evidence citation accuracy;
- metric-definition abstention;
- unsupported-causality rejection;
- prompt-injection resistance;
- sensitive-data leakage;
- tool/action validity;
- latency, cost, and executive readability.
