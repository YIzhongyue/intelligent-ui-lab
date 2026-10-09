import type { IncomingMessage, ServerResponse } from 'node:http';
import { once } from 'node:events';
import { ChatDecoder, chatRequestSchema, type ChatEvent } from '../src/chat-protocol';
import { publicConfig, type ServerConfig } from './config';
import type { Generate } from './upstream';
import { json } from './app';

export function createChatHandler(config: ServerConfig, generate: Generate) {
  let active = 0;
  let windowStart = Date.now();
  let requests = 0;
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (!publicConfig(config).ready) return json(res, 503, { error: 'Chat is not configured on the server.' });
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return json(res, 415, { error: 'Use application/json.' });
    if (Date.now() - windowStart >= 60000) { windowStart = Date.now(); requests = 0; }
    if (requests >= config.requestsPerMinute || active >= config.maxConcurrent) return json(res, 429, { error: 'Chat is busy. Try again later.' });
    requests++;
    active++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    const onClose = () => controller.abort();
    res.on('close', onClose);
    const onAbort = () => {
      if (!res.writableEnded && !res.destroyed) {
        if (res.headersSent) res.end(JSON.stringify({ type: 'error', message: 'Generation stopped or timed out.' }) + '\n');
        else json(res, 408, { error: 'Request timed out.' });
      }
      // Stop a slow request body without leaving the handler awaiting more bytes.
      if (!req.complete) req.destroy();
    };
    controller.signal.addEventListener('abort', onAbort, { once: true });
    try {
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += Buffer.byteLength(chunk);
        if (bytes > 100000) { json(res, 413, { error: 'Request is too large.' }); return; }
        chunks.push(Buffer.from(chunk));
      }
      if (controller.signal.aborted) return;
      let input: unknown;
      try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); } catch { return json(res, 400, { error: 'Invalid chat request.' }); }
      const parsed = chatRequestSchema.safeParse(input);
      if (!parsed.success) return json(res, 400, { error: 'Invalid chat request.' });
      const model = parsed.data.model ?? config.defaultModel;
      if (!config.models.includes(model)) return json(res, 400, { error: 'Model is not allowed.' });
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      const decoder = new ChatDecoder();
      let completed = false;
      let done = false;
      const write = async (event: ChatEvent) => {
        if (controller.signal.aborted) throw new Error('Aborted');
        if (event.type === 'error') throw new Error('Invalid model error');
        if (event.type === 'done') { done = true; return; }
        if (!res.write(JSON.stringify(event) + '\n')) await once(res, 'drain', { signal: controller.signal });
      };
      for await (const event of generate({ ...parsed.data, model }, controller.signal)) {
        if (controller.signal.aborted) throw new Error('Aborted');
        if (event.type === 'completed') { if (completed) throw new Error('Duplicate completion'); completed = true; }
        else {
          if (completed) throw new Error('Data after completion');
          for (const record of decoder.push(new TextEncoder().encode(event.delta))) await write(record);
        }
      }
      for (const record of decoder.finish()) await write(record);
      if (!completed || !done) throw new Error('Incomplete output');
      if (!res.writableEnded && !res.destroyed) res.end('{"type":"done"}\n');
    } catch {
      if (!res.writableEnded && !res.destroyed) {
        if (res.headersSent) res.end('{"type":"error","message":"Generation could not be completed. Please try again."}\n');
        else json(res, 400, { error: 'Invalid chat request.' });
      }
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onAbort);
      res.off('close', onClose);
      controller.abort();
      active--;
    }
  };
}
