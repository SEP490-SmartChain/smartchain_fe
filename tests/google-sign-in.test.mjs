import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  await server.ssrLoadModule('/tests/google-oauth/google-sign-in-button.spec.tsx');
  await server.ssrLoadModule('/tests/google-oauth/google-login-flow.spec.tsx');
} finally {
  await server.close();
}
