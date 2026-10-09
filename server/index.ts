import { config as loadEnv } from 'dotenv';
import { readConfig } from './config';
import { createApp } from './app';

loadEnv({ quiet: true });
try {
  const config = readConfig(process.env);
  const server = createApp(config);
  server.on('error', () => { console.error('API server could not start. Check the configured port.'); process.exitCode = 1; });
  server.listen(config.port, '127.0.0.1', () => console.log(`Local API listening on http://127.0.0.1:${config.port}`));
} catch {
  console.error('API server configuration is invalid. Check .env.example.');
  process.exitCode = 1;
}
