import { afterEach, describe, expect, it, vi } from 'vitest';
import { once } from 'node:events';
import { request as httpRequest, type Server } from 'node:http';
import { createApp } from './app';
import { readConfig } from './config';
import type { Generate } from './upstream';
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => { s.closeAllConnections(); s.close(() => resolve()); }))); });
async function setup(generate?: Generate, env: Record<string, string> = {}) {
  const config = readConfig({ CHAT_MOCK: '1', ...env });
  const server = createApp(config, generate);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  config.port = port;
  const url = `http://127.0.0.1:${port}`;
  const post = (body: unknown = { messages: [{ role: 'user', content: 'hi' }] }, headers = {}) => fetch(url + '/api/chat', { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { url, post };
}
const good: Generate = async function* () {
  yield { type: 'delta', delta: '{"type":"text_delta","delta":"Hello"}\n{"type":"done"}\n' };
  yield { type: 'completed' };
};
describe('local chat API', () => {
  it('streams validated events and safe metadata with no network', async () => {
    const { url, post } = await setup(good);
    const config = await (await fetch(url + '/api/config')).json();
    expect(config).toEqual({ ready: true, mode: 'mock', defaultModel: 'mock', models: ['mock'] });
    const response = await post();
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    expect(await response.text()).toBe('{"type":"text_delta","delta":"Hello"}\n{"type":"done"}\n');
  });
  it('blocks foreign/missing origin, DNS rebinding and cross-site requests before generation', async () => {
    const generate = vi.fn(good);
    const { url, post } = await setup(generate);
    for (const headers of [{ Origin: 'https://evil.example' }, { Host: 'evil.example' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
      const status = await new Promise<number | undefined>(resolve => {
        const req = httpRequest(url + '/api/chat', { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json', ...headers } }, response => { response.resume(); resolve(response.statusCode); });
        req.end(JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }));
      });
      expect(status).toBe(403);
    }
    expect((await fetch(url + '/api/chat', { method: 'POST' })).status).toBe(403);
    expect(generate).not.toHaveBeenCalled();
  });
  it('rejects unconfigured live mode, bad inputs and unallowed models', async () => {
    const { post } = await setup(good);
    expect((await post({ messages: [{ role: 'system', content: 'hi' }] })).status).toBe(400);
    expect((await post({ messages: [{ role: 'user', content: 'hi' }], model: 'expensive' })).status).toBe(400);
    expect((await post(undefined, { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await post({ large: 'a'.repeat(100001) })).status).toBe(413);
    const unconfigured = await setup(undefined, { CHAT_MOCK: '0' });
    expect((await unconfigured.post()).status).toBe(503);
  });
  it('redacts SDK failures and never forwards premature done', async () => {
    const { post } = await setup(async function* () {
      yield { type: 'delta', delta: '{"type":"done"}\n' };
      throw new Error('test-only-secret from SDK');
    });
    const output = await (await post()).text();
    expect(output).not.toContain('secret');
    expect(output).not.toContain('"done"');
    expect(JSON.parse(output).type).toBe('error');
  });
  it('rejects malformed, truncated and post-completion model output', async () => {
    for (const text of ['not json\n', '{"type":"text_delta","delta":"Hi"}\n', '{"type":"done"}\n{"type":"done"}\n']) {
      const { post } = await setup(async function* () { yield { type: 'delta', delta: text }; yield { type: 'completed' }; });
      const output = await (await post()).text();
      expect(output).toContain('"type":"error"');
      expect(output).not.toContain('"type":"done"');
    }
  });
  it('bounds request rate', async () => {
    const { post } = await setup(good, { CHAT_REQUESTS_PER_MINUTE: '1' });
    await (await post()).text();
    expect((await post()).status).toBe(429);
  });
  it('aborts upstream on timeout and frees the concurrency slot', async () => {
    let aborted = false;
    const waiting: Generate = async function* (_request, signal) {
      await new Promise<void>(resolve => signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true }));
    };
    const { post } = await setup(waiting, { CHAT_TIMEOUT_MS: '100', CHAT_MAX_CONCURRENT: '1' });
    const first = await post();
    expect((await post()).status).toBe(429);
    const output = await first.text();
    expect(output.match(/"type":"error"/g)).toHaveLength(1);
    expect(aborted).toBe(true);
    expect((await post()).status).toBe(200);
  });
  it('cancels upstream when the client disconnects', async () => {
    let resolveAbort!: () => void;
    const aborted = new Promise<void>(resolve => { resolveAbort = resolve; });
    const { url } = await setup(async function* (_request, signal) {
      yield { type: 'delta', delta: '{"type":"text_delta","delta":"Hi"}\n' };
      await new Promise<void>(resolve => signal.addEventListener('abort', () => { resolveAbort(); resolve(); }, { once: true }));
    });
    const controller = new AbortController();
    const response = await fetch(url + '/api/chat', { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }), signal: controller.signal });
    await response.body!.getReader().read();
    controller.abort();
    await aborted;
  });
});
