import { describe, expect, it } from 'vitest';
import { buildMessages, chatReducer, type Turn } from './chat-state';
const turn = (id: number, overrides: Partial<Turn> = {}): Turn => ({ id, attempt: 1, prompt: `Question ${id}`, mode: 'server', model: 'test-model', scenario: 'text', text: `Answer ${id}`, components: [], blocks: [], status: 'complete', ...overrides });
describe('chat state', () => {
  it('retains completed history and retries without duplicating a user turn', () => {
    const history = [turn(1), turn(2, { status: 'error' })];
    const result = chatReducer(history, { type: 'start', turn: turn(2, { text: '', status: 'streaming' }) });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(history[0]);
    expect(result[1].text).toBe('');
  });
  it('ignores late events after stop, reset, or for another request', () => {
    const event = { type: 'text_delta', delta: 'late' } as const;
    expect(chatReducer([turn(1, { status: 'stopped' })], { type: 'event', id: 1, event })[0].text).toBe('Answer 1');
    expect(chatReducer([], { type: 'event', id: 1, event })).toEqual([]);
    expect(chatReducer([turn(2, { status: 'streaming' })], { type: 'event', id: 1, event })[0].text).toBe('Answer 2');
  });
  it('builds bounded same-mode complete context, excluding current and failed turns', () => {
    const history = [turn(1), turn(2, { mode: 'mock' }), turn(3, { status: 'error' }), turn(4, { status: 'stopped' })];
    expect(buildMessages(history, turn(5))).toEqual([{ role: 'user', content: 'Question 1' }, { role: 'assistant', content: 'Answer 1' }, { role: 'user', content: 'Question 5' }]);
    const messages = buildMessages(Array.from({ length: 30 }, (_, id) => turn(id, { prompt: 'q'.repeat(4000), text: 'a'.repeat(8000) })), turn(31));
    expect(messages.length).toBeLessThanOrEqual(11);
    expect(messages.reduce((sum, message) => sum + message.content.length, 0)).toBeLessThanOrEqual(16000);
    expect(messages.every(message => message.content.length <= 4000)).toBe(true);
  });
});
