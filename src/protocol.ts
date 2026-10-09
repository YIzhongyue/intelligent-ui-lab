import { z } from 'zod';
const text = z.string().min(1).max(1200);
const id = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
const label = z.string().min(1).max(120);
const cell = z.string().max(240);
const base = { id, title: label };
export const iconNames = ['check-circle', 'triangle-alert', 'octagon-alert', 'info', 'lightbulb', 'book-open', 'code', 'target', 'clock', 'list-checks', 'chart-column', 'shield-check'] as const;
export const iconColors = ['neutral', 'green', 'amber', 'red', 'blue', 'purple'] as const;
const icon = z.enum(iconNames);
const color = z.enum(iconColors);
const sectionFields = { title: label, body: z.string().min(1).max(600), icon, color };
export const choiceSchema = z.object({
  kind: z.literal('choice-group'), ...base,
  selection: z.enum(['single', 'multiple']),
  options: z.array(z.object({ id, title: label, body: z.string().min(1).max(240).optional(), icon: icon.optional(), color: color.optional() }).strict()
    .refine(option => Boolean(option.icon) === Boolean(option.color), { message: 'An option icon and color must be supplied together.' })).min(2).max(8),
  maxSelections: z.number().int().min(1).max(8).optional(),
}).strict().refine(spec => new Set(spec.options.map(option => option.id)).size === spec.options.length, { message: 'Option IDs must be unique.' })
  .refine(spec => spec.maxSelections === undefined || (spec.maxSelections <= spec.options.length && (spec.selection === 'multiple' || spec.maxSelections === 1)), { message: 'Selection limit must fit the selection mode and options.' });
export type ChoiceSpec = z.infer<typeof choiceSchema>;
/** Handwritten, closed catalog. No generated actions, markup, URLs, or styles. */
export const componentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('icon-sections'), ...base, items: z.array(z.object(sectionFields).strict()).min(1).max(8) }).strict(),
  choiceSchema,
  z.object({ kind: z.literal('text'), id, title: text, body: text }).strict(),
  z.object({ kind: z.literal('skew'), id, title: text, partitions: z.number().int().min(4).max(16), rows: z.number().int().min(1000).max(100000), hotPercent: z.number().int().min(0).max(90) }).strict(),
  z.object({ kind: z.literal('notice'), id, title: text, body: text }).strict(),
  z.object({ kind: z.literal('metrics'), ...base, items: z.array(z.object({ label, value: label, detail: cell }).strict()).min(1).max(6) }).strict(),
  z.object({ kind: z.literal('table'), ...base, columns: z.array(label).min(1).max(6), rows: z.array(z.array(cell).min(1).max(6)).min(1).max(12) }).strict().refine(spec => spec.rows.every(row => row.length === spec.columns.length), { message: 'Every table row must match the column count.' }),
  z.object({ kind: z.literal('bar-chart'), ...base, unit: z.string().max(30), items: z.array(z.object({ label, value: z.number().min(0).max(1_000_000_000) }).strict()).min(1).max(12) }).strict(),
  z.object({ kind: z.literal('checklist'), ...base, items: z.array(z.object({ label, checked: z.boolean() }).strict()).min(1).max(16) }).strict(),
  z.object({ kind: z.literal('disclosure'), ...base, items: z.array(z.object({ summary: label, body: z.string().min(1).max(600) }).strict()).min(1).max(8) }).strict(),
  z.object({ kind: z.literal('comparison'), ...base, items: z.array(z.object({ name: label, summary: z.string().min(1).max(400), advantages: z.array(cell).max(5), limitations: z.array(cell).max(5) }).strict()).min(2).max(3) }).strict(),
]);
/** Derived from the actual validator; table rectangularity is additionally checked at runtime. */
export const componentJSONSchema = z.toJSONSchema(componentSchema);
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
