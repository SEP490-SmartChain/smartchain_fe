// Isolated visual fixture. Synthetic transport only, no environment files or external writes.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({
  root,
  configFile: false,
  envFile: false,
  resolve: { alias: { '@': `${root}/src`, '@messages': `${root}/messages` } },
  plugins: [react()],
  server: { host: '127.0.0.1', port: 24373, strictPort: true },
});
await server.listen();
console.log('Inventory fixture: http://127.0.0.1:24373/tests/fixtures/inventory-preview.html');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
