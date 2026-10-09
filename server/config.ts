import { z } from 'zod';

const integer = (fallback: number, min: number, max: number) => z.coerce.number().int().min(min).max(max).default(fallback);
const modelName = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/);
const environmentSchema = z.object({
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  OPENAI_MODEL: modelName.optional(),
  OPENAI_ALLOWED_MODELS: z.string().optional(),
  CHAT_MOCK: z.enum(['0', '1']).default('0'),
  API_PORT: integer(8787, 1024, 65535),
  WEB_PORT: integer(5173, 1024, 65535),
  CHAT_MAX_OUTPUT_TOKENS: integer(4096, 256, 8192),
  CHAT_TIMEOUT_MS: integer(45000, 100, 120000),
  CHAT_REQUESTS_PER_MINUTE: integer(10, 1, 60),
  CHAT_MAX_CONCURRENT: integer(2, 1, 4),
});
export function readConfig(env: Record<string, string | undefined>) {
  const parsed = environmentSchema.safeParse({ ...env, OPENAI_API_KEY: env.OPENAI_API_KEY?.trim() || undefined });
  if (!parsed.success) throw new Error('Invalid server configuration. Check the documented environment variables.');
  const value = parsed.data;
  const defaultModel = value.OPENAI_MODEL ?? (value.CHAT_MOCK === '1' ? 'mock' : '');
  const models = value.OPENAI_ALLOWED_MODELS?.split(',').map(s => s.trim()) ?? (defaultModel ? [defaultModel] : []);
  if (models.length > 10 || models.some(m => !modelName.safeParse(m).success) || (Boolean(defaultModel) && !models.includes(defaultModel))) {
    throw new Error('Invalid model allowlist; it must include the default model.');
  }
  return {
    apiKey: value.OPENAI_API_KEY, defaultModel, models: [...new Set(models)],
    mock: value.CHAT_MOCK === '1', port: value.API_PORT, webPort: value.WEB_PORT,
    maxOutputTokens: value.CHAT_MAX_OUTPUT_TOKENS, timeoutMs: value.CHAT_TIMEOUT_MS,
    requestsPerMinute: value.CHAT_REQUESTS_PER_MINUTE, maxConcurrent: value.CHAT_MAX_CONCURRENT,
  };
}
export type ServerConfig = ReturnType<typeof readConfig>;
export function publicConfig(config: ServerConfig) {
  return { ready: config.mock || Boolean(config.apiKey && config.defaultModel), mode: config.mock ? 'mock' : 'openai', defaultModel: config.defaultModel, models: config.models };
}
