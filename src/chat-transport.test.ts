import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeChat, loadConfig, streamChat } from './chat-transport';
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value) + '\n');
const text = { type: 'text_delta', delta: 'Hello 世界' };
const done = { type: 'done' };
afterEach(() => vi.unstubAllGlobals());
describe('chat transport', () => {
  it('handles split UTF-8 bytes and complete EOF', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(text) + '\n' + JSON.stringify(done));
    async function* chunks() { for (const byte of bytes) yield new Uint8Array([byte]); }
    const events: unknown[] = [];
    await consumeChat(chunks(), new AbortController().signal, event => events.push(event));
    expect(events).toEqual([text, done]);
  });
  it('rejects truncated streams, terminal errors, and duplicate component IDs', async () => {
    async function* chunks(events: unknown[]) { for (const event of events) yield encode(event); }
    await expect(consumeChat(chunks([text]), new AbortController().signal, () => {})).rejects.toThrow();
    await expect(consumeChat(chunks([{ type: 'error', message: 'Model unavailable' }]), new AbortController().signal, () => {})).rejects.toThrow('Model unavailable');
    const component = { type: 'component', component: { kind: 'text', id: 'same', title: 'Title', body: 'Body' } };
    await expect(consumeChat(chunks([component, component, done]), new AbortController().signal, () => {})).rejects.toThrow('Duplicate');
  });
  it('retains validated text before a final server error', async () => {
    const events: unknown[] = [];
    async function* chunks() { yield encode(text); yield encode({ type: 'error', message: 'Generation failed' }); }
    await expect(consumeChat(chunks(), new AbortController().signal, event => events.push(event))).rejects.toThrow('Generation failed');
    expect(events).toEqual([text]);
  });
  it('posts only messages/model and releases the reader after success', async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encode(text)); controller.enqueue(encode(done)); controller.close(); } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body)); vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    await streamChat([{ role: 'user', content: 'Hi' }], 'test-model', signal, () => {});
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ messages: [{ role: 'user', content: 'Hi' }], model: 'test-model' });
    expect(fetchMock.mock.calls[0][1].signal).toBe(signal);
    expect(body.locked).toBe(false);
  });
  it('cancels a pending reader on abort and releases its lock', async () => {
    const cancel = vi.fn(); const body = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    const controller = new AbortController();
    const result = streamChat([], 'test-model', controller.signal, () => {});
    await Promise.resolve(); controller.abort();
    await expect(result).rejects.toThrow(); expect(cancel).toHaveBeenCalled(); expect(body.locked).toBe(false);
  });
  it('cancels invalid response streams and does not leak server HTTP error bodies', async () => {
    const cancel = vi.fn(); const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encode({ invalid: true })); }, cancel });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(body)).mockResolvedValueOnce(new Response('private detail', { status: 500 })));
    await expect(streamChat([], 'm', new AbortController().signal, () => {})).rejects.toThrow();
    expect(cancel).toHaveBeenCalled(); expect(body.locked).toBe(false);
    await expect(streamChat([], 'm', new AbortController().signal, () => {})).rejects.toThrow('Chat request failed (500)');
  });
  it('validates the safe server configuration', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ ready: false, mode: 'openai', defaultModel: '', models: [] })).mockResolvedValueOnce(Response.json({ ready: true, mode: 'openai', defaultModel: 'missing', models: ['other'] })));
    expect((await loadConfig(new AbortController().signal)).ready).toBe(false);
    await expect(loadConfig(new AbortController().signal)).rejects.toThrow('invalid model');
  });
});
