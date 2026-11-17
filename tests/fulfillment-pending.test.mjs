import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { z } from 'zod';

let server, clearFulfillmentPending, loadFulfillmentPending, persistFulfillmentPending;
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ clearFulfillmentPending, loadFulfillmentPending, persistFulfillmentPending } =
    await server.ssrLoadModule('/src/features/orders/lib/fulfillmentPending.ts'));
});
after(async () => server?.close());

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const scope = {
  actorId: 'actor-a',
  warehouseId: 'warehouse-a',
  resourceId: 'parcel-a',
  operation: 'pack',
};
const schema = z.object({ operationId: z.uuid(), quantity: z.number().int() }).strict();
const command = { operationId: '00000000-0000-4000-8000-000000000001', quantity: 2 };

test('pending fulfillment survives page reload only for the same actor and warehouse resource', () => {
  const storage = memoryStorage();
  persistFulfillmentPending(scope, command, storage);

  assert.deepEqual(loadFulfillmentPending(scope, schema, storage), command);
  assert.equal(loadFulfillmentPending({ ...scope, actorId: 'actor-b' }, schema, storage), null);
  assert.equal(
    loadFulfillmentPending({ ...scope, warehouseId: 'warehouse-b' }, schema, storage),
    null,
  );
});

test('malformed or mismatched pending data is removed instead of replayed', () => {
  const storage = memoryStorage();
  persistFulfillmentPending(scope, command, storage);
  storage.setItem(
    'orca.fulfillment.pending.v1.actor-a.warehouse-a.pack.parcel-a',
    JSON.stringify({ version: 1, scope: { ...scope, actorId: 'actor-b' }, command }),
  );

  assert.equal(loadFulfillmentPending(scope, schema, storage), null);
  assert.equal(
    storage.getItem('orca.fulfillment.pending.v1.actor-a.warehouse-a.pack.parcel-a'),
    null,
  );
});

test('clearing one operation preserves any newer pending command', () => {
  const storage = memoryStorage();
  const newer = { ...command, operationId: '00000000-0000-4000-8000-000000000002' };
  persistFulfillmentPending(scope, command, storage);
  persistFulfillmentPending(scope, newer, storage);

  clearFulfillmentPending(scope, command, storage);

  assert.deepEqual(loadFulfillmentPending(scope, schema, storage), newer);
});

test('a storage write failure blocks the operation before it can become unrecoverable', () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota');
    },
    removeItem() {},
  };

  assert.throws(() => persistFulfillmentPending(scope, command, storage), /quota/);
});
