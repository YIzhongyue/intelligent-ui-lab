import { z } from 'zod';
const text = z.string().min(1).max(1200);
export const componentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/), title: text, body: text }).strict(),
  z.object({ kind: z.literal('skew'), id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/), title: text, partitions: z.number().int().min(4).max(16), rows: z.number().int().min(1000).max(100000), hotPercent: z.number().int().min(0).max(90) }).strict(),
  z.object({ kind: z.literal('notice'), id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/), title: text, body: text }).strict(),
]);
export const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('component'), component: componentSchema }).strict(),
  z.object({ type: z.literal('done') }).strict(),
]);
export type ComponentSpec = z.infer<typeof componentSchema>;
export type UIEvent = z.infer<typeof eventSchema>;
export const publicSchema = z.toJSONSchema(eventSchema);

/** Decode complete NDJSON records only; partial JSON is never rendered. */
export class EventDecoder {
  private decoder = new TextDecoder('utf-8', { fatal: true });
  private pending = '';
  private finished = false;
  private count = 0;
  private seenDone = false;
  constructor(private maxLineLength = 8192, private maxEvents = 30) {}
  push(bytes: Uint8Array): UIEvent[] {
    if (this.finished) throw new Error('Decoder is already closed.');
    return this.consume(this.decoder.decode(bytes, { stream: true }));
  }
  finish(): UIEvent[] {
    if (this.finished) throw new Error('Decoder is already closed.');
    this.finished = true;
    const events = this.consume(this.decoder.decode());
    if (this.pending.trim()) events.push(this.parse(this.pending));
    this.pending = '';
    if (!this.seenDone) throw new Error('Stream ended without a completion event.');
    return events;
  }
  private consume(chunk: string): UIEvent[] {
    this.pending += chunk;
    const events: UIEvent[] = [];
    let newline: number;
    while ((newline = this.pending.indexOf('\n')) !== -1) {
      const line = this.pending.slice(0, newline);
      this.pending = this.pending.slice(newline + 1);
      if (line.length > this.maxLineLength) throw new Error('Stream record exceeds the size limit.');
      if (line.trim()) events.push(this.parse(line));
    }
    if (this.pending.length > this.maxLineLength) throw new Error('Stream record exceeds the size limit.');
    return events;
  }
  private parse(line: string): UIEvent {
    if (line.length > this.maxLineLength) throw new Error('Stream record exceeds the size limit.');
    if (this.seenDone) throw new Error('Received data after completion.');
    if (++this.count > this.maxEvents) throw new Error('Stream exceeds the event limit.');
    let data: unknown;
    try { data = JSON.parse(line); } catch { throw new Error('Invalid JSON in stream record.'); }
    const result = eventSchema.safeParse(data);
    if (!result.success) throw new Error('Stream record does not match the allowed UI schema.');
    if (result.data.type === 'done') this.seenDone = true;
    return result.data;
  }
}

/** Stable synthetic partition counts; never represents production data. */
export function partitionRows(rows: number, partitions: number, hotPercent: number): number[] {
  const hot = Math.floor(rows * hotPercent / 100);
  const base = Math.floor((rows - hot) / partitions);
  const remainder = rows - hot - base * partitions;
  return Array.from({ length: partitions }, (_, i) => base + (i < remainder ? 1 : 0) + (i === 0 ? hot : 0));
}
