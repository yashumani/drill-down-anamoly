# FP&A CopilotKit runtime

This service is the server-side CopilotKit runtime for the FP&A Variance Copilot. GitHub Pages hosts only the static React application; it cannot safely hold provider credentials or execute the CopilotKit runtime.

## Local setup

```bash
cd services/copilotkit-runtime
cp .env.example .env
npm install
npm run dev
```

The default endpoint is:

```text
http://127.0.0.1:4000/api/copilotkit
```

In the application, open the AI workspace, expand **Use CopilotKit agent orchestration**, paste the endpoint, and select **Connect and reload**.

## Hosted model

Set `OPENAI_API_KEY` and choose a provider/model string with `COPILOTKIT_MODEL`, for example:

```text
COPILOTKIT_MODEL=openai/gpt-4.1-mini
```

## OpenAI-compatible or local model

CopilotKit's runtime supports an OpenAI-compatible base URL. For a same-machine Ollama process:

```text
COPILOTKIT_MODEL=openai/fpa-variance-copilot
OPENAI_BASE_URL=http://127.0.0.1:11434/v1
OPENAI_API_KEY=ollama
```

Inside a container, use a hostname that reaches the host or private model network; `127.0.0.1` points to the container itself.

## Security boundary

- Restrict `COPILOTKIT_ALLOWED_ORIGINS` to approved application origins.
- Keep provider keys in the runtime environment, never in the React bundle.
- Put the service behind HTTPS and authentication before using confidential finance data.
- The current runner is in-memory; it does not provide durable multi-user thread history.
- The frontend sends compact calculated evidence and evidence IDs, not raw uploaded rows.
- Frontend tools can only select a known dimension, apply a supported category drill, move back, or reset scope.

## Production work still required

A production deployment needs authentication, tenant isolation, request auditing, rate limiting, DLP/redaction policy, persistent threads, model allowlists, and operational monitoring.
