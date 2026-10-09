import { z } from 'zod';
import { ChatDecoder, type ChatEvent } from './chat-protocol';
import type { Message } from './chat-state';

export const configSchema = z.object({ ready: z.boolean(), mode: z.enum(['mock', 'openai']), defaultModel: z.string(), models: z.array(z.string().min(1)).max(100) }).strict();
export type ServerConfig = z.infer<typeof configSchema>;
export async function loadConfig(signal: AbortSignal): Promise<ServerConfig> {
  const response = await fetch('/api/config', { signal });
  if (!response.ok) throw new Error('The chat server is unavailable. You can still use local mock mode.');
  const config = configSchema.parse(await response.json());
  if (config.ready && (!config.defaultModel || !config.models.includes(config.defaultModel))) throw new Error('The server returned an invalid model configuration.');
  return config;
}
/** Validate byte-framed records before allowing any generated content into the UI. */
export async function consumeChat(chunks: AsyncIterable<Uint8Array>, signal: AbortSignal, onEvent: (event: ChatEvent) => void): Promise<void> {
  const decoder = new ChatDecoder();
  const ids = new Set<string>();
  const accept = (events: ChatEvent[]) => {
    signal.throwIfAborted();
    for (const event of events) {
      if (event.type === 'error') throw new Error(event.message);
      if (event.type === 'component') {
        if (ids.has(event.component.id)) throw new Error('Duplicate component ID rejected.');
        ids.add(event.component.id);
      }
      onEvent(event);
    }
  };
  for await (const chunk of chunks) accept(decoder.push(chunk));
  accept(decoder.finish());
}
export async function streamChat(messages: Message[], model: string, signal: AbortSignal, onEvent: (event: ChatEvent) => void): Promise<void> {
  const response = await fetch('/api/chat', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body: JSON.stringify({ messages, model }) });
  if (!response.ok) throw new Error(`Chat request failed (${response.status}). Check the server configuration and try again.`);
  if (!response.body) throw new Error('The server returned no response stream.');
  const reader = response.body.getReader();
  let ended = false;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', abort, { once: true });
  async function* chunks() {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) { ended = true; return; }
      yield value;
    }
  }
  try { await consumeChat(chunks(), signal, onEvent); }
  finally {
    signal.removeEventListener('abort', abort);
    if (!ended) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
