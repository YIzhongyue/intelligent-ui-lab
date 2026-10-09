// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatEvent } from './chat-protocol';
import type { ChoiceAction } from './choice';
import { ChatApp } from './ChatApp';
const doubles = vi.hoisted(() => ({ actions: [] as ChoiceAction[], loadConfig: vi.fn(), streamChat: vi.fn(), consumeChat: vi.fn() }));
vi.mock('./chat-transport', () => doubles);
vi.mock('./components', () => ({ UIRenderer: ({ choiceAction }: { choiceAction: ChoiceAction }) => { doubles.actions.push(choiceAction); return null; } }));
let root: Root; let host: HTMLDivElement;
let requests: { emit: (event: ChatEvent) => void; resolve: () => void }[];
const spec = { kind: 'choice-group', id: 'focus', title: 'Topic', selection: 'single', options: [{ id: 'a', title: 'Theory' }, { id: 'b', title: 'Practice' }] } as const;
async function click(text: string) { await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent?.includes(text))!.click()); }
async function change(selector: string, value: string) { await act(async () => { const element = host.querySelector(selector)!; Object.getOwnPropertyDescriptor(element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype, 'value')!.set!.call(element, value); element.dispatchEvent(new Event(element.tagName === 'TEXTAREA' ? 'input' : 'change', { bubbles: true })); }); }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); requests = []; doubles.actions = [];
  doubles.loadConfig.mockResolvedValue({ ready: true, mode: 'mock', defaultModel: 'model-a', models: ['model-a'] });
  doubles.streamChat.mockImplementation((_messages, _model, _signal, emit) => new Promise<void>(resolve => requests.push({ emit, resolve })));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); await act(async () => root.render(<ChatApp />)); await change('#mode', 'server');
  await change('#prompt', 'Choose a topic'); await click('Send question');
  await act(async () => requests[0].emit({ type: 'component', component: { ...spec, options: [...spec.options] } }));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); });
describe('parent-owned choice action boundary', () => {
  it('rejects forged selections and stale incomplete callbacks independently of child disabled state', async () => {
    const incomplete = doubles.actions.at(-1)!;
    expect(incomplete.onSubmit(['a'])).toBe(false);
    await act(async () => requests[0].resolve()); const action = doubles.actions.at(-1)!;
    for (const ids of [[], ['missing'], ['a', 'a'], ['a', 'b']]) expect(action.onSubmit(ids)).toBe(false);
    await act(async () => { expect(action.onSubmit(['b'])).toBe(true); expect(action.onSubmit(['b'])).toBe(false); });
    expect(requests).toHaveLength(2); expect(doubles.streamChat.mock.calls[1][0].at(-1).content).toContain('- Practice');
    expect(doubles.streamChat.mock.calls[1][0].at(-1).content).not.toContain('missing');
  });
  it('rejects obsolete attempt callbacks and callbacks captured before reset or setting changes', async () => {
    const oldAttempt = doubles.actions.at(-1)!; await click('Stop response'); await click('Retry');
    await act(async () => { requests[1].emit({ type: 'component', component: { ...spec, options: [...spec.options] } }); requests[1].resolve(); });
    expect(oldAttempt.onSubmit(['a'])).toBe(false);
    const fresh = doubles.actions.at(-1)!; await change('#mode', 'mock'); expect(fresh.onSubmit(['a'])).toBe(false);
    await click('Reset conversation'); expect(fresh.onSubmit(['a'])).toBe(false); expect(requests).toHaveLength(2);
  });
});
