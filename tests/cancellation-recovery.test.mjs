import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, createCancellationSession, auth, orderScope, ApiError;
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ createCancellationSession } = await server.ssrLoadModule(
    '/src/features/orders/lib/cancellationSession.ts',
  ));
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  ({ orderScope } = await server.ssrLoadModule('/src/features/orders/lib/orderScope.ts'));
  ({ ApiError } = await server.ssrLoadModule('/src/services/apiClient.ts'));
});
after(async () => server?.close());

test('importing cancellation does not read or subscribe to an uninitialized authentication boundary', async () => {
  const isolated = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
    plugins: [
      {
        name: 'uninitialized-auth-boundary',
        enforce: 'pre',
        load(path) {
          if (path.replaceAll('\\', '/').endsWith('/stores/authStore.ts')) {
            return `export function useAuthStore() { throw new Error('Authentication is not initialized'); }
            useAuthStore.getState = () => { throw new Error('Import must not read authentication'); };
            useAuthStore.subscribe = () => { throw new Error('Import must not subscribe to authentication'); };`;
          }
        },
      },
    ],
  });
  try {
    const module = await isolated.ssrLoadModule('/src/features/orders/lib/cancellationSession.ts');
    assert.equal(typeof module.createCancellationSession, 'function');
  } finally {
    await isolated.close();
  }
});

const id = '00000000-0000-4000-8000-000000000001';
function login(userId = id) {
  auth.getState().clear();
  auth.getState().setSession({
    accessToken: 'synthetic',
    expiresIn: 60,
    user: {
      userId,
      tenantId: id,
      actorScope: 'TENANT',
      roles: ['SELLER_OWNER'],
      permissions: [],
      email: 'synthetic@example.test',
      fullName: 'Synthetic',
      serviceStatus: 'ACTIVE',
    },
  });
}
function flow(api, requestId = () => id) {
  return createCancellationSession({ scope: orderScope(), orderId: id, api, requestId });
}
const status = (value) => ({ id, status: value, code: null });

test('first click reviews the whole-order reason, dismiss sends nothing and confirmation sends once', async () => {
  login();
  const writes = [];
  let finish;
  const session = flow({
    cancellation: async () => status('NOT_REQUESTED'),
    cancel: async (orderId, command) => {
      writes.push({ orderId, command });
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  assert.equal(session.review('Before status check', 4), false);
  await session.check();
  assert.equal(session.review('  Buyer changed mind  ', 4), true);
  assert.equal(session.getState().review.reason, 'Buyer changed mind');
  assert.equal(writes.length, 0);
  session.dismiss();
  await session.confirm();
  assert.equal(writes.length, 0);
  session.review('Buyer changed mind', 4);
  const pending = session.confirm();
  await session.confirm();
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], {
    orderId: id,
    command: { operationId: id, expectedVersion: 4, reason: 'Buyer changed mind' },
  });
  finish(status('PENDING'));
  await pending;
  session.stop();
});

test('timeout and unmount/reopen retain exact payload and permit immediate authoritative status check', async () => {
  login();
  const writes = [];
  let reads = 0;
  const api = {
    cancellation: async () => {
      reads++;
      return status('NOT_REQUESTED');
    },
    cancel: async (_order, command) => {
      writes.push({ ...command });
      if (writes.length === 1) throw new TypeError('Lost response');
      return status('PENDING');
    },
  };
  const first = flow(api);
  await first.check();
  first.review('Do not change this reason', 7);
  await first.confirm();
  assert.equal(first.getState().errorKey, 'writeError');
  first.stop();
  const reopened = flow(api, () => 'different-operation');
  await reopened.check();
  assert.equal(reads, 2);
  assert.equal(reopened.review('Replacement request', 9), false);
  await reopened.retry();
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1], {
    operationId: id,
    expectedVersion: 7,
    reason: 'Do not change this reason',
  });
  reopened.stop();
});

test('a new actor cannot retrieve or replay the previous actor memory', async () => {
  login();
  const writes = [];
  const api = {
    cancellation: async () => status('NOT_REQUESTED'),
    cancel: async (_id, command) => {
      writes.push(command);
      throw new TypeError('Lost');
    },
  };
  const old = flow(api);
  await old.check();
  old.review('Private reason', 3);
  await old.confirm();
  old.stop();
  login('00000000-0000-4000-8000-000000000002');
  const next = flow(api);
  assert.equal(next.getState().pending, null);
  await old.retry();
  assert.equal(writes.length, 1);
  next.stop();
});

test('fresh page without memory reads existing cancellation before allowing any new request', async () => {
  login();
  let writes = 0;
  const session = flow({
    cancellation: async () => status('PENDING'),
    cancel: async () => {
      writes++;
      return status('PENDING');
    },
  });
  assert.equal(session.review('New request', 2), false);
  await session.check();
  assert.equal(session.getState().cancellation.status, 'PENDING');
  assert.equal(session.review('New request', 2), false);
  await session.confirm();
  assert.equal(writes, 0);
  session.stop();
});

test('explicit stale rejection permits correction while idempotency conflict retains the exact command', async () => {
  for (const code of ['ORDERS.STALE_VERSION', 'ORDERS.IDEMPOTENCY_CONFLICT']) {
    login();
    const session = flow({
      cancellation: async () => status('NOT_REQUESTED'),
      cancel: async () => {
        throw new ApiError('Conflict', 409, code);
      },
    });
    await session.check();
    session.review('Reason', 2);
    await session.confirm();
    assert.equal(
      session.getState().errorKey,
      code.endsWith('STALE_VERSION') ? 'errors.STALE_VERSION' : 'errors.IDEMPOTENCY_CONFLICT',
    );
    assert.equal(!!session.getState().pending, code.endsWith('IDEMPOTENCY_CONFLICT'));
    session.stop();
  }
});

test('unmount during an unresolved write preserves recovery and ignores its late response', async () => {
  login();
  let finish;
  const api = {
    cancellation: async () => status('NOT_REQUESTED'),
    cancel: async () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  };
  const first = flow(api);
  await first.check();
  first.review('Uncertain in flight', 4);
  const sending = first.confirm();
  first.stop();
  const reopened = flow(api);
  assert.deepEqual(reopened.getState().pending, {
    operationId: id,
    expectedVersion: 4,
    reason: 'Uncertain in flight',
  });
  finish(status('CANCELLED'));
  await sending;
  assert.equal(reopened.getState().cancellation, null);
  await reopened.check();
  assert.equal(reopened.getState().pending.operationId, id);
  reopened.stop();
});

test('confirmed terminal cancellation clears its recovery command and cannot be submitted again', async () => {
  login();
  let reads = 0,
    writes = 0;
  const api = {
    cancellation: async () => status(++reads === 1 ? 'NOT_REQUESTED' : 'CANCELLED'),
    cancel: async () => {
      writes++;
      throw new TypeError('Lost');
    },
  };
  const session = flow(api);
  await session.check();
  session.review('Reason', 4);
  await session.confirm();
  await session.check();
  assert.equal(session.getState().pending, null);
  assert.equal(session.review('Cancel again', 5), false);
  await session.retry();
  assert.equal(writes, 1);
  session.stop();
  assert.equal(flow(api).getState().pending, null);
});

test('two open views of the same order cannot replace an unresolved request with a new reference', async () => {
  login();
  const writes = [];
  const api = {
    cancellation: async () => status('NOT_REQUESTED'),
    cancel: async (_order, command) => {
      writes.push(command);
      throw new TypeError('Lost');
    },
  };
  const first = flow(api),
    second = flow(api, () => 'new-reference');
  await first.check();
  await second.check();
  first.review('First reason', 4);
  second.review('Other reason', 4);
  await first.confirm();
  await second.confirm();
  assert.equal(writes.length, 1);
  assert.deepEqual(second.getState().pending, {
    operationId: id,
    expectedVersion: 4,
    reason: 'First reason',
  });
  first.stop();
  second.stop();
});
