import { z } from 'zod';

const runtimeEnvironmentSchema = z.object({
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(4000),
  COPILOTKIT_MODEL: z.string().min(1).default('openai/gpt-4.1-mini'),
  COPILOTKIT_ALLOWED_ORIGINS: z.string().default('http://localhost:5173,https://yashumani.github.io'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
});

export function parseRuntimeEnvironment(environment: Record<string, string | undefined>) {
  return runtimeEnvironmentSchema.parse(environment);
}
