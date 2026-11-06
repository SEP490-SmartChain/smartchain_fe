import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, getDispatchFailureGuidance;
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ getDispatchFailureGuidance } = await server.ssrLoadModule(
    '/src/features/shipments/lib/dispatchFailureGuidance.ts',
  ));
});
after(async () => server?.close());

test('maps known internal failures to safe operational guidance', () => {
  assert.equal(getDispatchFailureGuidance('DISPATCH.CARRIER_OUTCOME_UNCERTAIN'), 'verifyBooking');
  assert.equal(getDispatchFailureGuidance('DISPATCH.LABEL_UNAVAILABLE'), 'retryLabel');
  assert.equal(getDispatchFailureGuidance('DISPATCH.INVALID_ADDRESS_MAPPING'), 'checkAddress');
});

test('does not display raw provider or unexpected failure codes', () => {
  assert.equal(getDispatchFailureGuidance('GHTK_TOKEN=secret'), 'review');
  assert.equal(getDispatchFailureGuidance(null), null);
});
