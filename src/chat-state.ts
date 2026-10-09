import type { ComponentSpec } from './protocol';
import type { ChatEvent } from './chat-protocol';

export type Mode = 'mock' | 'server';
export type AnswerBlock = { type: 'text'; text: string } | { type: 'component'; spec: ComponentSpec };
export type Turn = {
  id: number; prompt: string; mode: Mode; model: string; scenario: string;
  text: string; components: ComponentSpec[]; blocks: AnswerBlock[]; status: 'streaming' | 'complete' | 'stopped' | 'error'; error?: string;
};
export type Message = { role: 'user' | 'assistant'; content: string };
export type ChatAction = { type: 'start'; turn: Turn } | { type: 'event'; id: number; event: ChatEvent }
  | { type: 'settle'; id: number; status: Turn['status']; error?: string } | { type: 'reset' };
export function chatReducer(turns: Turn[], action: ChatAction): Turn[] {
  if (action.type === 'reset') return [];
  if (action.type === 'start') {
    const existing = turns.findIndex(turn => turn.id === action.turn.id);
    return existing < 0 ? [...turns, action.turn] : turns.map(turn => turn.id === action.turn.id ? action.turn : turn);
  }
  return turns.map(turn => {
    if (turn.id !== action.id || turn.status !== 'streaming') return turn;
    if (action.type === 'settle') return { ...turn, status: action.status, error: action.error };
    if (action.event.type === 'text_delta') {
      const last = turn.blocks.at(-1);
      const blocks: AnswerBlock[] = last?.type === 'text'
        ? [...turn.blocks.slice(0, -1), { type: 'text', text: last.text + action.event.delta }]
        : [...turn.blocks, { type: 'text', text: action.event.delta }];
      return { ...turn, text: turn.text + action.event.delta, blocks };
    }
    if (action.event.type === 'component') return { ...turn, components: [...turn.components, action.event.component], blocks: [...turn.blocks, { type: 'component', spec: action.event.component }] };
    return turn;
  });
}
/** Send recent complete exchanges only. Failed or interrupted output is never model context. */
export function buildMessages(turns: Turn[], current: Turn): Message[] {
  const result: Message[] = [{ role: 'user', content: current.prompt }];
  let size = current.prompt.length;
  for (const turn of [...turns].reverse()) {
    if (turn.id >= current.id || turn.mode !== current.mode || turn.status !== 'complete') continue;
    const answer = (turn.blocks.length ? turn.blocks.map(block => block.type === 'text' ? block.text : JSON.stringify(block.spec)).join('\n') : turn.text).slice(0, 4000);
    if (!answer) continue;
    if (result.length + 2 > 11 || size + turn.prompt.length + answer.length > 16000) break;
    result.unshift({ role: 'user', content: turn.prompt }, { role: 'assistant', content: answer });
    size += turn.prompt.length + answer.length;
  }
  return result;
}
