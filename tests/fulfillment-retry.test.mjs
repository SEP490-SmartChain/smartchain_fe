import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createServer } from 'vite';

let server, ApiError, isRejectedOperation, createCancellationSession, auth, orderScope;
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ ApiError } = await server.ssrLoadModule('/src/services/apiClient.ts'));
  ({ isRejectedOperation } = await server.ssrLoadModule(
    '/src/features/orders/lib/fulfillmentRetry.ts',
  ));
  ({ createCancellationSession } = await server.ssrLoadModule(
    '/src/features/orders/lib/cancellationSession.ts',
  ));
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  ({ orderScope } = await server.ssrLoadModule('/src/features/orders/lib/orderScope.ts'));
});
after(async () => server?.close());

function callback(file, outer, inner, bindings) {
  const source = readFileSync(
    new URL('../src/features/orders/components/' + file, import.meta.url),
    'utf8',
  );
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let node;
  function visit(n, parent) {
    if (ts.isFunctionDeclaration(n)) {
      if (parent === outer && n.name?.text === inner) node = n;
      parent = n.name?.text;
    }
    ts.forEachChild(n, (c) => visit(c, parent));
  }
  visit(tree);
  assert.ok(node, `${outer}.${inner}`);
  const code = ts.transpileModule(node.getText(tree), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(bindings), code + '; return ' + inner)(
    ...Object.values(bindings),
  );
}
const cases = [
  ['PackingWorkspace.tsx', 'PackingForm', 'submit', 'pack'],
  ['HandoverWorkspace.tsx', 'WarehouseHandover', 'manifest', 'manifest'],
  ['HandoverWorkspace.tsx', 'SignManifest', 'submit', 'sign'],
  ['HandoverWorkspace.tsx', 'PutbackForm', 'submit', 'putback'],
];
for (const [file, outer, inner, method] of cases) {
  for (const rejected of [true, false])
    test(`${outer}: ${rejected ? 'rejected command can be corrected' : 'uncertain command keeps UUID and payload'}`, async () => {
      const pending = { current: null },
        running = { current: false },
        calls = [];
      let serial = 0,
        feedback;
      const bindings = {
        ApiError,
        pending,
        running,
        writable: true,
        uploading: false,
        create: true,
        selected: ['shipment-A'],
        setBusy() {},
        setError(value) {
          feedback = value;
        },
        setReload() {},
        onPacked() {},
        onSigned() {},
        onDone() {},
        task: { id: 'putback', version: 1 },
        createUuid: () => `operation-${++serial}`,
        detail: { id: 'parcel', version: 1 },
        warehouse: 'warehouse',
        id: 'manifest',
        abort: { current: new AbortController() },
        t: (key) => key,
        isRejectedOperation,
        packingApi: {
          [method]: async (...args) => {
            const command = args.find((a) => a && typeof a === 'object' && 'operationId' in a);
            calls.push(structuredClone(command));
            if (calls.length === 1)
              throw rejected
                ? new ApiError(
                    'Rejected',
                    422,
                    method === 'sign' ? 'PACK.PARCEL_COUNT_MISMATCH' : 'PACK.CONTENTS_MISMATCH',
                  )
                : new TypeError('Network interrupted');
          },
        },
      };
      const run = callback(file, outer, inner, bindings);
      const first = {
        confirmedParcelCount: 1,
        actualWeightG: 100,
        actualLengthCm: '10',
        actualWidthCm: '8',
        actualHeightCm: '5',
        contents: [{ itemId: 'item', qty: 2 }],
        materialCode: '',
        carrierAckRef: 'first',
        carrierSignerName: 'Driver',
        evidenceKey: 'verified-photo',
        binCode: 'BIN-A',
        sku: 'SKU',
        lotCode: 'LOT',
        qty: 2,
      };
      await run(first);
      assert.equal(pending.current === null, rejected);
      assert.equal(
        feedback,
        rejected ? (method === 'sign' ? 'parcelCountMismatch' : 'rejectedError') : 'writeError',
      );
      bindings.selected.splice(0, 1, 'shipment-B');
      await run({
        ...first,
        contents: [{ itemId: 'item', qty: 1 }],
        carrierAckRef: 'corrected',
        qty: 1,
      });
      assert.equal(calls.length, 2);
      assert.equal(calls[0].operationId === calls[1].operationId, !rejected);
      if (!rejected) assert.deepEqual(calls[1], calls[0]);
      else if (method === 'pack') assert.equal(calls[1].contents[0].qty, 1);
      else if (method === 'sign') assert.equal(calls[1].carrierAckRef, 'corrected');
      else if (method === 'putback') assert.equal(calls[1].qty, 1);
      else assert.deepEqual(calls[1].shipmentIds, ['shipment-B']);
    });
}
test('timeout, server failure and idempotency conflict are not proof that a command failed to commit', () => {
  for (const error of [
    new ApiError('Timeout', 408, 'TIMEOUT'),
    new ApiError('Unavailable', 503, 'UNAVAILABLE'),
    new ApiError('Conflict', 409, 'PACK.IDEMPOTENCY_CONFLICT'),
    new ApiError('Busy', 409, 'INVENTORY.CONTENTION'),
    new Error('Invalid response after commit'),
  ]) {
    assert.equal(isRejectedOperation(error), false);
  }
  assert.equal(isRejectedOperation(new ApiError('Stale', 409, 'PACK.STALE_VERSION')), true);
});

function cancellationSession(api, onCompleted) {
  auth.getState().clear();
  auth.getState().setSession({
    accessToken: 'synthetic',
    expiresIn: 60,
    user: {
      userId: '00000000-0000-4000-8000-000000000001',
      tenantId: '00000000-0000-4000-8000-000000000001',
      actorScope: 'TENANT',
      roles: ['SELLER_OWNER'],
      permissions: [],
      email: 'synthetic@example.test',
      fullName: 'Synthetic',
      serviceStatus: 'ACTIVE',
    },
  });
  return createCancellationSession({
    scope: orderScope(),
    orderId: 'order',
    api,
    requestId: () => 'cancel-operation',
    onCompleted,
  });
}

for (const rejected of [true, false])
  test(`OrderCancellationActions: ${rejected ? 'explicit rejection unlocks reason' : 'uncertain outcome preserves pending cancellation'}`, async () => {
    const command = { operationId: 'cancel-operation', expectedVersion: 1, reason: 'Original' };
    const session = cancellationSession({
      cancellation: async () => ({ id: 'order', status: 'NOT_REQUESTED', code: null }),
      cancel: async () => {
        throw rejected
          ? new ApiError('Stale', 409, 'ORDERS.STALE_VERSION')
          : new TypeError('Network interrupted');
      },
    });
    await session.check();
    assert.equal(session.review('Original', 1), true);
    await session.confirm();
    assert.equal(session.getState().busy, false);
    assert.deepEqual(session.getState().pending, rejected ? null : command);
    await session.check();
    assert.equal(session.review('Corrected', 2), rejected);
    session.stop();
  });

for (const status of ['CANCELLED', 'PENDING'])
  test(
    'cancellation ' + status + ' refreshes the parent only after confirmed completion',
    async () => {
      const effects = [];
      const session = cancellationSession(
        {
          cancellation: async () => ({ id: 'order', status: 'NOT_REQUESTED', code: null }),
          cancel: async () => ({ id: 'order', status, code: null }),
        },
        () => effects.push('refresh'),
      );
      await session.check();
      session.subscribe(() => {
        const value = session.getState().cancellation?.status;
        if (value && value !== 'NOT_REQUESTED' && !effects.includes(value)) effects.push(value);
      });
      session.review('Customer request', 1);
      await session.confirm();
      assert.deepEqual(effects, status === 'CANCELLED' ? ['CANCELLED', 'refresh'] : ['PENDING']);
      session.stop();
    },
  );
