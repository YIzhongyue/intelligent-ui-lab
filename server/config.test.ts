import { describe, expect, it } from 'vitest';
import { publicConfig, readConfig } from './config';
describe('server configuration', () => {
  it('works without a key and exposes only safe metadata', () => {
    expect(publicConfig(readConfig({}))).toEqual({ ready: false, mode: 'openai', defaultModel: '', models: [] });
    expect(JSON.stringify(publicConfig(readConfig({ OPENAI_API_KEY: 'test-only-secret' })))).not.toContain('secret');
  });
  it('validates models, limits, and mode', () => {
    for (const env of [{ OPENAI_MODEL: 'other', OPENAI_ALLOWED_MODELS: 'different' }, { CHAT_MAX_CONCURRENT: '999' }, { CHAT_MOCK: 'yes' }, { OPENAI_ALLOWED_MODELS: 'bad/model' }]) expect(() => readConfig(env)).toThrow();
    expect(publicConfig(readConfig({ CHAT_MOCK: '1' })).ready).toBe(true);
  });
});
