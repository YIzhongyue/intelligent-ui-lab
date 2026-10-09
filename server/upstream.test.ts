import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), options: vi.fn() }));
vi.mock('openai', () => ({ default: class { responses = { create: mocks.create }; constructor(options: unknown) { mocks.options(options); } } }));
import { createGenerator } from './upstream';
import { readConfig } from './config';
it('uses Responses streaming with explicit official endpoint, no retries and bounded tokens', async () => {
  mocks.create.mockResolvedValue((async function* () {
    yield { type: 'response.output_text.delta', delta: '{"type":"done"}\n' };
    yield { type: 'response.completed' };
  })());
  const generate = createGenerator(readConfig({ OPENAI_API_KEY: 'fake-test-key', OPENAI_MODEL: 'test-model' }));
  const signal = new AbortController().signal;
  const output = [];
  for await (const event of generate({ model: 'test-model', messages: [{ role: 'user', content: 'Hi' }] }, signal)) output.push(event);
  expect(output).toEqual([{ type: 'delta', delta: '{"type":"done"}\n' }, { type: 'completed' }]);
  expect(mocks.options).toHaveBeenCalledWith({ apiKey: 'fake-test-key', baseURL: 'https://api.openai.com/v1', maxRetries: 0, logLevel: 'off', timeout: 45000 });
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ model: 'test-model', stream: true, store: false, max_output_tokens: 4096, input: [{ role: 'user', content: 'Hi' }] }), { signal });
});
it('treats incomplete, failed, refused and missing completion as errors', async () => {
  for (const type of ['response.failed', 'response.incomplete', 'response.refusal.delta', 'response.refusal.done', 'error', 'response.created']) {
    mocks.create.mockResolvedValue((async function* () { yield { type }; })());
    const generate = createGenerator(readConfig({ OPENAI_API_KEY: 'fake', OPENAI_MODEL: 'test-model' }));
    await expect((async () => { for await (const event of generate({ model: 'test-model', messages: [{ role: 'user', content: 'Hi' }] }, new AbortController().signal)) void event; })()).rejects.toThrow();
  }
});
