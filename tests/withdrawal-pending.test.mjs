import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, store, pending, values;
const command = {
  clientRequestId: '00000000-0000-4000-8000-000000000001',
  warehouseId: '00000000-0000-4000-8000-000000000002',
  productId: '00000000-0000-4000-8000-000000000003',
  lotId: '00000000-0000-4000-8000-000000000004',
  qty: 2,
  addressVersion: 1,
};
const user = {
  userId: 'owner-A',
  tenantId: 'seller-A',
  actorScope: 'TENANT',
  email: 'qa@example.test',
  fullName: 'QA',
  roles: ['SELLER_OWNER'],
  permissions: [],
  serviceStatus: 'ACTIVE',
};
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ useAuthStore: store } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  pending = await server.ssrLoadModule('/src/features/orders/lib/withdrawalPending.ts');
});
after(async () => {
  if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage);
  else delete globalThis.sessionStorage;
  await server?.close();
});
beforeEach(() => {
  values = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  });
  store.getState().setUser(user);
});
test('uncertain withdrawal survives component remount and a new auth revision for the same Owner', () => {
  pending.persistPendingWithdrawal(command);
  store.getState().setUser({ ...user, serviceStatus: 'SUSPENDED' });
  assert.deepEqual(pending.readPendingWithdrawal(), command);
  assert.equal(values.size, 1);
  assert.doesNotMatch([...values.values()].join(''), /recipient|phone|accessToken|email/);
});
test('another seller, another user and platform actors cannot recover the previous command', () => {
  pending.persistPendingWithdrawal(command);
  for (const other of [
    { ...user, tenantId: 'seller-B' },
    { ...user, userId: 'owner-B' },
    { ...user, actorScope: 'PLATFORM' },
  ]) {
    store.getState().setUser(other);
    assert.equal(pending.readPendingWithdrawal(), null);
  }
  store.getState().setUser(user);
  assert.deepEqual(pending.readPendingWithdrawal(), command);
});
test('a new UUID or modified payload cannot overwrite an unresolved command', () => {
  pending.persistPendingWithdrawal(command);
  assert.doesNotThrow(() => pending.persistPendingWithdrawal({ ...command }));
  assert.throws(() => pending.persistPendingWithdrawal({ ...command, qty: 3 }));
  assert.throws(() =>
    pending.persistPendingWithdrawal({ ...command, clientRequestId: command.productId }),
  );
  assert.deepEqual(pending.readPendingWithdrawal(), command);
});
test('clearing another operation cannot delete the unresolved reference', () => {
  pending.persistPendingWithdrawal(command);
  pending.clearPendingWithdrawal(command.productId);
  assert.deepEqual(pending.readPendingWithdrawal(), command);
  pending.clearPendingWithdrawal(command.clientRequestId);
  assert.equal(pending.readPendingWithdrawal(), null);
});
test('blocked storage refuses persistence before a request can be sent', () => {
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    get() {
      throw new Error('blocked');
    },
  });
  assert.equal(pending.readPendingWithdrawal(), null);
  assert.throws(() => pending.persistPendingWithdrawal(command));
});
test('corrupt or extra-field commands cannot be silently replaced', () => {
  pending.persistPendingWithdrawal(command);
  const key = [...values.keys()][0];
  values.set(key, '{corrupt');
  assert.equal(pending.readPendingWithdrawal(), null);
  assert.throws(() => pending.persistPendingWithdrawal(command));
  values.set(key, JSON.stringify({ ...command, recipientPhone: 'not-stored' }));
  assert.equal(pending.readPendingWithdrawal(), null);
  assert.throws(() => pending.persistPendingWithdrawal(command));
});
