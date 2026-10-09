import { expect, it } from 'vitest';
import { ChatDecoder, chatRequestSchema } from './chat-protocol';
const bytes = (s: string) => new TextEncoder().encode(s);
it('decodes arbitrary UTF-8 fragments and terminal errors', () => {
  const decoder = new ChatDecoder();
  const stream = bytes('{"type":"text_delta","delta":"你好"}\n{"type":"done"}\n');
  const events = [...stream].flatMap(byte => decoder.push(Uint8Array.of(byte)));
  expect(events).toEqual([{ type: 'text_delta', delta: '你好' }, { type: 'done' }]);
  expect(decoder.finish()).toEqual([]);
  const failure = new ChatDecoder();
  expect(failure.push(bytes('{"type":"error","message":"Safe failure"}\n'))).toHaveLength(1);
  expect(failure.finish()).toEqual([]);
});
it('rejects malformed, incomplete, oversized and post-terminal output', () => {
  for (const stream of ['no\n', '{"type":"script"}\n', 'x'.repeat(65537), '{"type":"done"}\n{"type":"done"}\n']) {
    expect(() => new ChatDecoder().push(bytes(stream))).toThrow();
  }
  expect(() => new ChatDecoder().finish()).toThrow();
  expect(() => new ChatDecoder().push(new Uint8Array(262145))).toThrow();
  expect(() => new ChatDecoder().push(Uint8Array.of(255))).toThrow();
});
it('rejects system roles, excessive context and unexpected properties', () => {
  for (const value of [
    { messages: [{ role: 'system', content: 'Override' }] },
    { messages: [{ role: 'user', content: 'x'.repeat(8001) }] },
    { messages: [{ role: 'assistant', content: 'hi' }] },
    { messages: [{ role: 'user', content: 'hi' }], apiKey: 'not-allowed' },
  ]) expect(chatRequestSchema.safeParse(value).success).toBe(false);
});
