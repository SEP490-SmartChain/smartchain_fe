// Local preview only: no .env, live backend or production writes.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({
  root,
  configFile: false,
  envFile: false,
  plugins: [react()],
  resolve: { alias: { '@': `${root}/src`, '@messages': `${root}/messages` } },
  server: { host: '127.0.0.1', port: 24379, strictPort: true },
});
await server.listen();
console.log(
  'Service tariff fixture: http://127.0.0.1:24379/tests/fixtures/service-tariff-preview.html',
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
