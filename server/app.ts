import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createChatHandler } from './chat';
import { createGenerator, type Generate } from './upstream';
import { publicConfig, type ServerConfig } from './config';

export function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}
/** Exact authorities reject DNS rebinding. Forwarded headers are never trusted. */
export function trustedRequest(req: IncomingMessage, config: ServerConfig) {
  const hosts = [config.port, config.webPort].flatMap(port => [`127.0.0.1:${port}`, `localhost:${port}`]);
  const host = req.headers.host;
  if (!host || !hosts.includes(host)) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  return origin === undefined ? req.method === 'GET' : origin === `http://${host}`;
}
export function createApp(config: ServerConfig, generate: Generate = createGenerator(config)) {
  const chat = createChatHandler(config, generate);
  const server = createServer((req, res) => {
    if (!trustedRequest(req, config)) return json(res, 403, { error: 'Request origin is not allowed.' });
    if (req.method === 'GET' && req.url === '/api/config') return json(res, 200, publicConfig(config));
    if (req.method === 'POST' && req.url === '/api/chat') { void chat(req, res); return; }
    json(res, 404, { error: 'Not found.' });
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}
