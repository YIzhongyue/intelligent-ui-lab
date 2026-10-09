import { z } from 'zod';
import { componentSchema } from './protocol';

export const chatRequestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(8000) }).strict()).min(1).max(20),
  model: z.string().min(1).max(100).optional(),
}).strict().refine(v => v.messages.reduce((n, m) => n + m.content.length, 0) <= 24000, 'Conversation is too long.')
  .refine(v => v.messages.at(-1)?.role === 'user', 'Last message must be from the user.');
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export const chatEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('component'), component: componentSchema }).strict(),
  z.object({ type: z.literal('text_delta'), delta: z.string().min(1).max(8000) }).strict(),
  z.object({ type: z.literal('done') }).strict(),
  z.object({ type: z.literal('error'), message: z.string().min(1).max(200) }).strict(),
]);
export type ChatEvent = z.infer<typeof chatEventSchema>;
/** Bounded UTF-8 NDJSON framing shared by the server and browser. */
export class ChatDecoder {
  private decoder = new TextDecoder('utf-8', { fatal: true });
  private pending = '';
  private closed = false;
  private terminal = false;
  private count = 0;
  private bytes = 0;
  private ids = new Set<string>();
  push(bytes: Uint8Array): ChatEvent[] {
    if (this.closed) throw new Error('Decoder is closed.');
    this.bytes += bytes.byteLength;
    if (this.bytes > 262144) throw new Error('Stream exceeds the size limit.');
    return this.consume(this.decoder.decode(bytes, { stream: true }));
  }
  finish(): ChatEvent[] {
    if (this.closed) throw new Error('Decoder is closed.');
    this.closed = true;
    const events = this.consume(this.decoder.decode());
    if (this.pending.trim()) events.push(this.parse(this.pending));
    this.pending = '';
    if (!this.terminal) throw new Error('Stream ended without a terminal event.');
    return events;
  }
  private consume(text: string): ChatEvent[] {
    this.pending += text;
    const events: ChatEvent[] = [];
    let newline: number;
    while ((newline = this.pending.indexOf('\n')) >= 0) {
      const line = this.pending.slice(0, newline);
      this.pending = this.pending.slice(newline + 1);
      if (line.length > 65536) throw new Error('Stream record is too large.');
      if (line.trim()) events.push(this.parse(line));
    }
    if (this.pending.length > 65536) throw new Error('Stream record is too large.');
    return events;
  }
  private parse(line: string): ChatEvent {
    if (this.terminal || ++this.count > 100) throw new Error('Invalid stream ordering or event limit.');
    const event = chatEventSchema.parse(JSON.parse(line));
    if (event.type === 'component') {
      if (this.ids.has(event.component.id)) throw new Error('Duplicate component identifier.');
      this.ids.add(event.component.id);
      if (this.ids.size > 12) throw new Error('Too many components.');
    }
    if (event.type === 'done' || event.type === 'error') this.terminal = true;
    return event;
  }
}
