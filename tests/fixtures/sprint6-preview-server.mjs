import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
const root = fileURLToPath(new URL('../..', import.meta.url));
const server = await createServer({
  root,
  configFile: false,
  envFile: false,
  plugins: [react()],
  resolve: { alias: { '@': `${root}/src`, '@messages': `${root}/messages` } },
  server: { host: '127.0.0.1', port: 2346, strictPort: true },
});
await server.listen();
console.log('Synthetic P3 preview: http://127.0.0.1:2346/tests/fixtures/sprint6-p3-preview.html');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
