import type { UIEvent } from './protocol';
export type Scenario = 'skew' | 'text' | 'invalid';
export interface UIProvider {
  readonly label: string;
  stream(scenario: Scenario, signal: AbortSignal): AsyncIterable<Uint8Array>;
}
export const fixtures: Record<Exclude<Scenario, 'invalid'>, UIEvent[]> = {
  skew: [
    { type: 'component', component: { kind: 'text', id: 'intro', title: 'One hot key. Uneven work.', body: 'Explore a synthetic dataset of 24,000 rows across 8 partitions. A hot key sends an extra share of rows to the first partition. Move the slider to see why one worker can become a bottleneck.' } },
    { type: 'component', component: { kind: 'skew', id: 'partition-lab', title: 'Partition workload', partitions: 8, rows: 24000, hotPercent: 45 } },
    { type: 'component', component: { kind: 'notice', id: 'takeaway', title: 'Try this', body: 'Compare 0%, 45%, and 90% hot-key share. The imbalance metric is max partition rows divided by average rows. This is a simplified workload model, not a runtime prediction.' } },
    { type: 'done' },
  ],
  text: [
    { type: 'component', component: { kind: 'text', id: 'answer', title: 'What is data skew?', body: 'Data skew is an uneven distribution of data or work. In a partitioned job, a few workers may receive far more rows than others, leaving the rest waiting. A short definition is enough here; no interactive control is needed.' } },
    { type: 'done' },
  ],
};
const pause = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  signal.throwIfAborted();
  const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
  const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
  signal.addEventListener('abort', abort, { once: true });
});
export const mockProvider: UIProvider = {
  label: 'Deterministic mock · no model calls',
  async *stream(scenario, signal) {
    const source = scenario === 'invalid'
      ? JSON.stringify({ type: 'component', component: { kind: 'html', id: 'unsafe', html: '<script>alert(1)</script>' } }) + '\n'
      : fixtures[scenario].map(event => JSON.stringify(event)).join('\n') + '\n';
    const bytes = new TextEncoder().encode(source);
    const sizes = [17, 41, 23, 97];
    let offset = 0, index = 0;
    while (offset < bytes.length) {
      await pause(35, signal);
      signal.throwIfAborted();
      const end = Math.min(bytes.length, offset + sizes[index++ % sizes.length]);
      yield bytes.slice(offset, end);
      offset = end;
    }
  },
};
