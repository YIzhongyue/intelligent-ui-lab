import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.WEB_PORT || 5173);
  const apiPort = Number(env.API_PORT || 8787);
  return {
    plugins: [react()],
    server: { host: '127.0.0.1', port, strictPort: true, proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } } },
  };
});
