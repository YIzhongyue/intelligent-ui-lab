// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChoiceSpec } from './protocol';
import type { ChatEvent } from './chat-protocol';
import { ChatApp } from './ChatApp';
const transport = vi.hoisted(() => ({ loadConfig: vi.fn(), streamChat: vi.fn(), consumeChat: vi.fn() }));
vi.mock('./chat-transport', () => transport);
let root: Root; let host: HTMLDivElement;
let requests: { emit: (event: ChatEvent) => void; resolve: () => void; reject: (error: Error) => void; signal: AbortSignal }[];
const query = <T extends Element>(selector: string) => host.querySelector<T>(selector)!;
async function click(text: string) { const button = [...host.querySelectorAll('button')].find(node => node.textContent?.includes(text)); expect(button).toBeTruthy(); await act(async () => button!.click()); }
async function change(selector: string, value: string) { await act(async () => {
  const element = query<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector);
  const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
  element.dispatchEvent(new Event(element.tagName === 'TEXTAREA' ? 'input' : 'change', { bubbles: true }));
}); }
async function send(value: string) { await change('#prompt', value); await click('Send question'); }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  requests = [];
  transport.loadConfig.mockResolvedValue({ ready: true, mode: 'openai', defaultModel: 'model-a', models: ['model-a', 'model-b'] });
  transport.streamChat.mockImplementation((_messages, _model, signal, emit) => new Promise<void>((resolve, reject) => requests.push({ signal, emit, resolve, reject })));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<ChatApp />)); await change('#mode', 'server');
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); });
describe('chat interactions', () => {
  it('streams escaped text and sends complete multi-turn context', async () => {
    await send('First question');
    await act(async () => { requests[0].emit({ type: 'text_delta', delta: '<script>unsafe</script>' }); });
    expect(host.textContent).toContain('<script>unsafe</script>'); expect(host.querySelector('script')).toBeNull();
    await act(async () => requests[0].resolve());
    await send('Follow up');
    expect(transport.streamChat.mock.calls[1][0]).toEqual([{ role: 'user', content: 'First question' }, { role: 'assistant', content: '<script>unsafe</script>' }, { role: 'user', content: 'Follow up' }]);
    expect(host.querySelectorAll('.question')).toHaveLength(2);
  });
  it('preserves interleaved prose and component event ordering', async () => {
    await send('Explain this');
    await act(async () => {
      requests[0].emit({ type: 'text_delta', delta: 'Before the card' });
      requests[0].emit({ type: 'component', component: { kind: 'text', id: 'middle', title: 'Middle card', body: 'Card body' } });
      requests[0].emit({ type: 'text_delta', delta: 'After the card' });
      requests[0].resolve();
    });
    const answer = query('.answer');
    const blocks = [...answer.querySelectorAll('.answer-text, .ui-component')];
    expect(blocks.map(block => block.textContent)).toEqual(['Before the card', 'Middle cardCard body', 'After the card']);
    await send('Continue');
    expect(transport.streamChat.mock.calls[1][0][1].content).toMatch(/Before the card.*\n.*middle.*\nAfter the card/);
  });
  it('stops and retries without duplicate turns; ignores old callbacks', async () => {
    await send('Question'); await click('Stop response');
    expect(requests[0].signal.aborted).toBe(true);
    await click('Retry');
    await act(async () => { requests[0].emit({ type: 'text_delta', delta: 'stale' }); requests[0].resolve(); });
    expect(host.textContent).not.toContain('stale'); expect(host.querySelectorAll('.question')).toHaveLength(1);
    await act(async () => { requests[1].emit({ type: 'text_delta', delta: 'fresh' }); requests[1].resolve(); });
    expect(host.textContent).toContain('fresh');
  });
  it('cancels on model/mode changes and reset, without late reappearance', async () => {
    await send('First'); await change('#model', 'model-b'); expect(requests[0].signal.aborted).toBe(true);
    await send('Second'); expect(transport.streamChat.mock.calls[1][1]).toBe('model-b');
    await change('#mode', 'mock'); expect(requests[1].signal.aborted).toBe(true);
    await click('Reset conversation');
    await act(async () => { requests[0].emit({ type: 'text_delta', delta: 'late first' }); requests[1].emit({ type: 'text_delta', delta: 'late second' }); requests[0].resolve(); requests[1].resolve(); });
    expect(host.querySelectorAll('.question')).toHaveLength(0); expect(host.textContent).not.toContain('late first');
  });
  it('shows errors with retry and preserves completed responses', async () => {
    await send('First'); await act(async () => { requests[0].emit({ type: 'text_delta', delta: 'Completed answer' }); requests[0].resolve(); });
    await send('Second'); await act(async () => requests[1].reject(new Error('Stream ended early')));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Stream ended early');
    expect(host.textContent).toContain('Completed answer'); await click('Retry'); expect(host.querySelectorAll('.question')).toHaveLength(2);
  });
  it('disables live sends when unconfigured while keeping local mock usable', async () => {
    transport.loadConfig.mockResolvedValue({ ready: false, mode: 'openai', defaultModel: '', models: [] });
    await click('Refresh server settings'); await change('#prompt', 'Hello');
    expect([...host.querySelectorAll('button')].find(button => button.textContent?.includes('Send question'))?.disabled).toBe(true);
    await change('#mode', 'mock'); transport.consumeChat.mockResolvedValue(undefined); await click('Send question');
    expect(transport.consumeChat).toHaveBeenCalled(); expect(transport.streamChat).not.toHaveBeenCalled();
  });
  it('blocks live sends while refreshed configuration is pending', async () => {
    let resolve!: (config: unknown) => void;
    transport.loadConfig.mockImplementationOnce(() => new Promise(value => { resolve = value; }));
    await click('Refresh server settings'); await change('#prompt', 'Wait for configuration');
    expect([...host.querySelectorAll('button')].find(button => button.textContent?.includes('Send question'))?.disabled).toBe(true);
    await act(async () => resolve({ ready: true, mode: 'openai', defaultModel: 'model-b', models: ['model-b'] }));
    await click('Send question'); expect(transport.streamChat.mock.calls[0][1]).toBe('model-b');
  });
  it('isolates repeated component IDs across completed turns', async () => {
    const component = { type: 'component', component: { kind: 'skew', id: 'partition-lab', title: 'Partition workload', rows: 24000, partitions: 8, hotPercent: 45 } } as const;
    await send('First'); await act(async () => { requests[0].emit(component); requests[0].resolve(); });
    await send('Second'); await act(async () => { requests[1].emit(component); requests[1].resolve(); });
    const sliders = [...host.querySelectorAll<HTMLInputElement>('input[type="range"]')];
    expect(sliders).toHaveLength(2); expect(sliders[0].id).not.toBe(sliders[1].id);
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(sliders[0], '70'); sliders[0].dispatchEvent(new Event('input', { bubbles: true })); });
    expect(sliders[0].value).toBe('70'); expect(sliders[1].value).toBe('45');
    expect(host.querySelectorAll('output')[0].textContent).toContain('70');
    expect(host.querySelectorAll('output')[1].textContent).toContain('45');
  });
  it('resets local controls when retry output arrives in the same React batch', async () => {
    const component = { type: 'component', component: { kind: 'skew', id: 'same', title: 'Retry control', rows: 24000, partitions: 8, hotPercent: 45 } } as const;
    await send('Question'); await act(async () => requests[0].emit(component)); await click('Stop response');
    const oldSlider = query<HTMLInputElement>('input[type="range"]');
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(oldSlider, '70'); oldSlider.dispatchEvent(new Event('input', { bubbles: true })); });
    transport.streamChat.mockImplementationOnce((_messages, _model, _signal, emit) => { emit(component); return Promise.resolve(); });
    await click('Retry');
    const newSlider = query<HTMLInputElement>('input[type="range"]');
    expect(newSlider.value).toBe('45'); expect(newSlider).not.toBe(oldSlider);
    expect(host.querySelectorAll('.question')).toHaveLength(1);
  });
  it('supports Enter, Shift+Enter and ignores IME composition', async () => {
    await change('#prompt', 'Keyboard question');
    await act(async () => { query('#prompt').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })); query('#prompt').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })); });
    expect(transport.streamChat).not.toHaveBeenCalled();
    await act(async () => query('#prompt').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(transport.streamChat).toHaveBeenCalledTimes(1);
  });
});

const choices = (selection: 'single' | 'multiple' = 'single', id = 'focus'): ChoiceSpec => ({ kind: 'choice-group', id, title: 'Study focus', selection, maxSelections: selection === 'single' ? 1 : 2, options: [{ id: 'a', title: 'Theory' }, { id: 'b', title: 'Practice', body: 'Build an example', icon: 'code', color: 'blue' }, { id: 'c', title: 'Review' }] });
async function showChoices(selection: 'single' | 'multiple' = 'single', complete = true) {
  await send('Help me study');
  await act(async () => { requests[0].emit({ type: 'component', component: choices(selection) }); if (complete) requests[0].resolve(); });
}
const choiceButton = () => query<HTMLButtonElement>('.ui-choice-submit');
async function selectChoice(index: number) { await act(async () => host.querySelectorAll<HTMLInputElement>('.ui-choice input')[index].click()); }
describe('explicit choice continuation', () => {
  it('waits for completion and a selection, previews exact text, then submits once', async () => {
    await showChoices('single', false);
    expect(choiceButton().disabled).toBe(true); expect(query<HTMLInputElement>('.ui-choice input').disabled).toBe(true);
    await act(async () => requests[0].resolve()); expect(choiceButton().disabled).toBe(true);
    await selectChoice(0); expect(requests).toHaveLength(1);
    const preview = query('.ui-choice-preview p').textContent;
    await act(async () => { choiceButton().click(); choiceButton().click(); });
    expect(requests).toHaveLength(2); expect(host.querySelectorAll('.question')[1].textContent).toBe('YOU' + preview);
    expect(transport.streamChat.mock.calls[1][0].at(-1).content).toBe(preview);
    expect(choiceButton().disabled).toBe(true);
  });
  it('uses native exclusive radios and checkboxes with a deselectable cap and stable order', async () => {
    await showChoices('multiple'); await selectChoice(1); await selectChoice(0);
    const inputs = [...host.querySelectorAll<HTMLInputElement>('.ui-choice input')];
    expect(inputs.map(input => input.type)).toEqual(['checkbox', 'checkbox', 'checkbox']); expect(inputs[2].disabled).toBe(true);
    await selectChoice(0); expect(inputs[2].disabled).toBe(false); await selectChoice(0);
    expect(query('.ui-choice-preview p').textContent).toContain('- Theory\n- Practice: Build an example');
    await click('Send choices and continue'); expect(requests).toHaveLength(2);
  });
  it('keeps groups independent and invalidates all old groups once another continues', async () => {
    await showChoices();
    // A second source is constructed within the streaming lifecycle, not appended after completion.
    await click('Reset conversation'); await send('Two groups');
    await act(async () => { requests[1].emit({ type: 'component', component: choices() }); requests[1].emit({ type: 'component', component: choices('multiple', 'second') }); requests[1].resolve(); });
    await selectChoice(0); await selectChoice(4); await selectChoice(1);
    const inputs = [...host.querySelectorAll<HTMLInputElement>('.ui-choice input')];
    expect(inputs[0].checked).toBe(false); expect(inputs[1].checked).toBe(true); expect(inputs[4].checked).toBe(true);
    expect(new Set(inputs.map(input => input.id)).size).toBe(6);
    await click('Send choices and continue');
    expect([...host.querySelectorAll<HTMLButtonElement>('.ui-choice-submit')].every(button => button.disabled)).toBe(true);
  });
  it('disables historical choices, settings changes, and config refreshes including mock-to-live', async () => {
    await showChoices(); await selectChoice(0); await change('#mode', 'mock'); expect(choiceButton().disabled).toBe(true);
    await change('#mode', 'server'); expect(choiceButton().disabled).toBe(true);
    await click('Reset conversation'); await send('Fresh source');
    await act(async () => { requests[1].emit({ type: 'component', component: choices() }); requests[1].resolve(); }); await selectChoice(0);
    transport.loadConfig.mockResolvedValueOnce({ ready: true, mode: 'mock', defaultModel: 'model-a', models: ['model-a'] });
    await click('Refresh server settings'); expect(choiceButton().disabled).toBe(true);
    await send('Server mock source'); await act(async () => { requests[2].emit({ type: 'component', component: choices() }); requests[2].resolve(); });
    await act(async () => host.querySelectorAll<HTMLInputElement>('.ui-choice input')[3].click());
    transport.loadConfig.mockResolvedValueOnce({ ready: true, mode: 'openai', defaultModel: 'model-a', models: ['model-a'] });
    await click('Refresh server settings');
    expect([...host.querySelectorAll<HTMLButtonElement>('.ui-choice-submit')].every(button => button.disabled)).toBe(true);
    expect(requests).toHaveLength(3);
  });
  it('retries failed continuation without duplicating selection turns and reset cancels it', async () => {
    await showChoices(); await selectChoice(0); await click('Send choices and continue');
    await act(async () => requests[1].reject(new Error('Temporary failure'))); await click('Retry');
    expect(host.querySelectorAll('.question')).toHaveLength(2); expect(choiceButton().disabled).toBe(true);
    await click('Reset conversation'); expect(requests[2].signal.aborted).toBe(true);
    await act(async () => { requests[2].emit({ type: 'component', component: choices() }); requests[2].resolve(); });
    expect(host.querySelectorAll('.question')).toHaveLength(0); expect(host.querySelectorAll('.ui-choice')).toHaveLength(0);
  });
  it('remounts choices for retry attempts and ignores stale source output', async () => {
    await showChoices('single', false); await click('Stop response'); await click('Retry');
    await act(async () => { requests[0].emit({ type: 'component', component: choices('single', 'stale') }); requests[0].resolve(); requests[1].emit({ type: 'component', component: choices() }); requests[1].resolve(); });
    expect(host.querySelectorAll('.ui-choice')).toHaveLength(3); expect(choiceButton().disabled).toBe(true);
    await selectChoice(2); await click('Send choices and continue'); expect(requests).toHaveLength(3);
  });
});
