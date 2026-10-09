import { describe, expect, it } from 'vitest';
import { EventDecoder, eventSchema, partitionRows, type UIEvent } from './protocol';
import { fixtures, mockProvider } from './provider';
const encode = (s: string) => new TextEncoder().encode(s);
describe('NDJSON protocol', () => {
  it('reassembles every possible byte boundary including Unicode', () => {
    const events = [{ type: 'component', component: { kind: 'text', id: 'a', title: 'Hello 🌍', body: 'Café' } }, { type: 'done' }];
    const bytes = encode(events.map(e => JSON.stringify(e)).join('\n'));
    for (let split = 0; split <= bytes.length; split++) {
      const decoder = new EventDecoder();
      expect([...decoder.push(bytes.slice(0, split)), ...decoder.push(bytes.slice(split)), ...decoder.finish()]).toEqual(events);
    }
  });
  it('handles CRLF, blank lines, and several records per chunk', () => {
    const decoder = new EventDecoder();
    expect(decoder.push(encode('\r\n' + fixtures.text.map(e => JSON.stringify(e)).join('\r\n') + '\r\n'))).toEqual(fixtures.text);
    expect(decoder.finish()).toEqual([]);
  });
  it('rejects malformed JSON, unsupported components and extra properties', () => {
    for (const line of ['{bad}', '{"type":"component","component":{"kind":"html"}}', '{"type":"done","script":"evil"}']) {
      expect(() => new EventDecoder().push(encode(line + '\n'))).toThrow();
    }
  });
  it('rejects truncated streams, trailing records, and oversized input', () => {
    expect(() => new EventDecoder().finish()).toThrow('completion');
    expect(() => new EventDecoder().push(encode('{"type":"done"}\n{"type":"done"}\n'))).toThrow('after completion');
    expect(() => new EventDecoder(3).push(encode('1234'))).toThrow('size limit');
    expect(() => new EventDecoder(3).push(encode('1234\n'))).toThrow('size limit');
    expect(() => new EventDecoder(3).push(encode('    \n'))).toThrow('size limit');
  });
  it('rejects event floods, malformed UTF-8 and use after close', () => {
    const decoder = new EventDecoder(8192, 1);
    expect(() => decoder.push(encode(fixtures.text.map(e => JSON.stringify(e)).join('\n') + '\n'))).toThrow('event limit');
    expect(() => new EventDecoder().push(new Uint8Array([0xff]))).toThrow();
    const closed = new EventDecoder(); closed.push(encode('{"type":"done"}\n')); closed.finish();
    expect(() => closed.push(encode(''))).toThrow('closed');
  });
  it('validates fixture bounds and rejects arbitrary actions', () => {
    fixtures.skew.forEach(e => expect(eventSchema.safeParse(e).success).toBe(true));
    expect(eventSchema.safeParse({ type: 'component', component: { kind: 'skew', id: 'x', title: 'X', partitions: 8, rows: 24000, hotPercent: 99 } }).success).toBe(false);
    expect(eventSchema.safeParse({ type: 'action', command: 'fetch' }).success).toBe(false);
  });
});
describe('deterministic data model', () => {
  it('preserves row counts and captures even and skewed cases', () => {
    expect(partitionRows(24000, 8, 0)).toEqual(Array(8).fill(3000));
    expect(partitionRows(24000, 8, 45)).toEqual([12450, 1650, 1650, 1650, 1650, 1650, 1650, 1650]);
    for (const hot of [0, 45, 90]) expect(partitionRows(24001, 8, hot).reduce((a,b) => a+b, 0)).toBe(24001);
  });
  it('stops an aborted provider without emitting chunks', async () => {
    const controller = new AbortController(); controller.abort();
    const stream = mockProvider.stream('skew', controller.signal)[Symbol.asyncIterator]();
    await expect(stream.next()).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('mock stream integration', () => {
  it('decodes complete normal fixtures', async () => {
    for (const scenario of ['skew', 'text'] as const) {
      const decoder = new EventDecoder();
      const events: UIEvent[] = [];
      for await (const chunk of mockProvider.stream(scenario, new AbortController().signal)) events.push(...decoder.push(chunk));
      events.push(...decoder.finish());
      expect(events).toEqual(fixtures[scenario]);
    }
  });
  it('rejects the unsafe fixture before any event renders', async () => {
    const decoder = new EventDecoder();
    const events: UIEvent[] = [];
    await expect((async () => {
      for await (const chunk of mockProvider.stream('invalid', new AbortController().signal)) events.push(...decoder.push(chunk));
    })()).rejects.toThrow('allowed UI schema');
    expect(events).toEqual([]);
  });
  it('aborts an in-flight delay after the first chunk', async () => {
    const controller = new AbortController();
    const stream = mockProvider.stream('skew', controller.signal)[Symbol.asyncIterator]();
    expect((await stream.next()).done).toBe(false);
    const pending = stream.next();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect((await stream.next()).done).toBe(true);
  });
});
