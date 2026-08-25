# FP&A Variance Copilot local model

This repository includes a finance-specific local Ollama profile for evidence-grounded FP&A commentary.
The repository stores the model configuration and prompt, not model weights.

## Install and create the model

```bash
ollama pull llama3.2
ollama create fpa-variance-copilot -f local-ai/ollama/Modelfile
```

The chatbot's **Connect local LLM** button first looks for `fpa-variance-copilot`. When that alias has not been created yet, it can connect to an installed `llama3.2`, Qwen, Mistral, Gemma, Phi, or the first text model returned by Ollama. The finance alias remains recommended because it applies the repository's versioned finance system profile.

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

## Phone and tablet behavior

`127.0.0.1` always refers to the device running the browser. Therefore:

- A desktop browser can connect to Ollama running on that same desktop.
- A phone browser can connect only to a model service running on the phone itself at that address.
- A phone cannot reach Ollama running on a laptop by using `127.0.0.1`.

For cross-device use, place the model behind an approved authenticated HTTPS gateway with CORS, access control, rate limiting, and audit logging. Do not expose Ollama port `11434` directly to the public internet.

## Why this is in the application repository

For the demo, keeping the Modelfile beside the analytics code makes the prompt and calculation contract versioned together. A separate service repository becomes useful when several applications share one hosted gateway, authentication policy, model registry, observability stack, and deployment lifecycle. A GitHub repository by itself is not a running API; a local Ollama process or deployed inference service must still host the endpoint.

## Governance metadata

`local-ai/model-profile.json` records the prompt, evidence, and response schema versions. The model remains `evaluation-required`; it is not approved for autonomous publishing or official accounting conclusions. Production use should pin a model artifact digest and pass the finance AI evaluation suite.
