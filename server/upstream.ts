import OpenAI from 'openai';
import type { ChatRequest } from '../src/chat-protocol';
import type { ServerConfig } from './config';
import { generationPrompt } from './prompt';
export type UpstreamEvent = { type: 'delta'; delta: string } | { type: 'completed' };
export type Generate = (request: ChatRequest & { model: string }, signal: AbortSignal) => AsyncIterable<UpstreamEvent>;
export function createGenerator(config: ServerConfig): Generate {
  if (config.mock) return async function* (_request, signal) {
    if (signal.aborted) throw new Error('Aborted');
    yield { type: 'delta', delta: JSON.stringify({ type: 'text_delta', delta: 'Mock response: this is a local, no-network demonstration.' }) + '\n' };
    yield { type: 'delta', delta: '{"type":"done"}\n' };
    yield { type: 'completed' };
  };
  return async function* (request, signal) {
    if (!config.apiKey || !config.defaultModel) throw new Error('Unconfigured');
    // Pin the official destination; environment base URLs must never redirect credentials.
    const client = new OpenAI({ apiKey: config.apiKey, baseURL: 'https://api.openai.com/v1', maxRetries: 0, logLevel: 'off', timeout: config.timeoutMs });
    const stream = await client.responses.create({
      model: request.model, instructions: generationPrompt(), input: request.messages,
      stream: true, store: false, max_output_tokens: config.maxOutputTokens,
    }, { signal });
    let completed = false;
    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') yield { type: 'delta', delta: event.delta };
      else if (event.type === 'response.completed') { completed = true; yield { type: 'completed' }; }
      else if (event.type === 'response.failed' || event.type === 'response.incomplete' || event.type === 'error' || event.type === 'response.refusal.delta' || event.type === 'response.refusal.done') throw new Error('Upstream did not complete');
    }
    if (!completed) throw new Error('Upstream ended unexpectedly');
  };
}
