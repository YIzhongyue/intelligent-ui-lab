import { describe, expect, it } from 'vitest';
import { componentJSONSchema, componentSchema, EventDecoder } from './protocol';

export const catalogExamples = [
  { kind: 'metrics', id: 'metrics', title: 'Summary', items: [{ label: 'Rows', value: '24,000', detail: 'Synthetic sample' }] },
  { kind: 'table', id: 'table', title: 'Sample', columns: ['Name', 'Count'], rows: [['A', '3'], ['B', '5']] },
  { kind: 'bar-chart', id: 'bars', title: 'Distribution', unit: 'rows', items: [{ label: 'A', value: 0 }, { label: 'B', value: 5 }] },
  { kind: 'checklist', id: 'checks', title: 'Preparation', items: [{ label: 'Inspect input', checked: false }] },
  { kind: 'disclosure', id: 'details', title: 'Details', items: [{ summary: 'Method', body: 'Compare equal samples.' }] },
  { kind: 'comparison', id: 'compare', title: 'Options', items: [{ name: 'A', summary: 'Simple', advantages: ['Small'], limitations: ['Limited'] }, { name: 'B', summary: 'Flexible', advantages: ['Adaptable'], limitations: ['Complex'] }] },
];

describe('bounded component catalog', () => {
  it.each(catalogExamples)('accepts and streams $kind', example => {
    expect(componentSchema.parse(example)).toEqual(example);
    const decoder = new EventDecoder();
    expect(decoder.push(new TextEncoder().encode(JSON.stringify({ type: 'component', component: example }) + '\n{"type":"done"}\n'))).toHaveLength(2);
    expect(decoder.finish()).toEqual([]);
  });
  it.each(catalogExamples)('rejects extra executable fields in $kind', example => {
    for (const key of ['html', 'onClick', 'url', 'style']) expect(componentSchema.safeParse({ ...example, [key]: 'unsafe' }).success).toBe(false);
    expect(componentSchema.safeParse({ ...example, title: 'x'.repeat(121) }).success).toBe(false);
  });
  it('rejects ragged tables and oversized nested data', () => {
    expect(componentSchema.safeParse({ ...catalogExamples[1], rows: [['only one']] }).success).toBe(false);
    expect(componentSchema.safeParse({ ...catalogExamples[1], rows: Array(13).fill(['a', 'b']) }).success).toBe(false);
    expect(componentSchema.safeParse({ ...catalogExamples[0], items: Array(7).fill({ label: 'x', value: '1', detail: '' }) }).success).toBe(false);
    expect(componentSchema.safeParse({ ...catalogExamples[3], items: [{ label: 'x', checked: 'true' }] }).success).toBe(false);
    expect(componentSchema.safeParse({ ...catalogExamples[4], items: [{ summary: 'x', body: 'x'.repeat(601) }] }).success).toBe(false);
    expect(componentSchema.safeParse({ ...catalogExamples[5], items: [] }).success).toBe(false);
  });
  it.each([-1, Infinity, NaN, 1_000_000_001])('rejects invalid chart value %s', value => {
    expect(componentSchema.safeParse({ ...catalogExamples[2], items: [{ label: 'x', value }] }).success).toBe(false);
  });
  it('derives the full catalog for model instructions', () => {
    for (const kind of ['text', 'skew', 'notice', ...catalogExamples.map(example => example.kind)]) expect(JSON.stringify(componentJSONSchema)).toContain(`"${kind}"`);
  });
});
