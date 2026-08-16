# FP&A Variance Copilot local model

This repository uses the same local-Ollama pattern as Mangrok, but with a finance-specific system profile.
The repository stores the model configuration and prompt, not model weights.

## Install and create the model

```bash
ollama pull llama3.2
ollama create fpa-variance-copilot -f local-ai/ollama/Modelfile
```

## Allow the deployed dashboard to call local Ollama

Stop the running Ollama service, then start it with the dashboard origin allowlisted:

```bash
OLLAMA_ORIGINS=https://yashumani.github.io ollama serve
```

Use these settings in the dashboard:

```text
Endpoint: http://127.0.0.1:11434/v1/chat/completions
Model:    fpa-variance-copilot
API key:  leave blank
```

Ollama's local API does not require authentication. The dashboard sends summarized, verified finance evidence rather than raw uploaded rows by default.

## Why this is in the application repository

For the demo, keeping the Modelfile beside the analytics code makes the prompt and calculation contract versioned together. A separate service repository becomes useful when several applications share one hosted gateway, authentication policy, model registry, observability stack, and deployment lifecycle. A GitHub repository by itself is not a running API; a local Ollama process or deployed inference service must still host the endpoint.
