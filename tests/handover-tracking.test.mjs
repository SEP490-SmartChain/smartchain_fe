import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
let server, recorded;
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ carrierPickupRecorded: recorded } = await server.ssrLoadModule(
    '/src/features/orders/lib/handoverTracking.ts',
  ));
});
after(async () => server?.close());
for (const status of [
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'RETURNING',
  'RETURNED',
])
  test(status + ' confirms carrier handling even without a pickup timestamp', () =>
    assert.equal(recorded({ status, pickedUpAt: null }), true),
  );
for (const status of ['LABEL_CREATED', 'UNKNOWN', 'CANCELLED'])
  test(status + ' alone does not prove physical pickup', () =>
    assert.equal(recorded({ status, pickedUpAt: null }), false),
  );
test('an actual pickup timestamp confirms carrier handling', () =>
  assert.equal(recorded({ status: 'UNKNOWN', pickedUpAt: '2026-10-26T00:00:00Z' }), true));
