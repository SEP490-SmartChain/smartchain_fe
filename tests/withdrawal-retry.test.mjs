import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { before, after, test } from 'node:test';
import ts from 'typescript';
import { createServer } from 'vite';

let server, ApiError, isRejectedOperation;
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ ApiError } = await server.ssrLoadModule('/src/services/apiClient.ts'));
  ({ isRejectedOperation } = await server.ssrLoadModule(
    '/src/features/orders/lib/fulfillmentRetry.ts',
  ));
});
after(async () => server?.close());

function execute(bindings) {
  const source = readFileSync(
    new URL('../src/features/orders/components/SellerWithdrawalForm.tsx', import.meta.url),
    'utf8',
  );
  const tree = ts.createSourceFile(
    'SellerWithdrawalForm.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let callback;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'execute') callback = node;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(callback);
  const body = ts.transpileModule(callback.getText(tree), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(bindings), body + '; return execute;')(
    ...Object.values(bindings),
  );
}

for (const kind of [
  'timeout',
  'server',
  'network',
  'conflicting-reference',
  'business-rejection',
  'authorization',
  'rate-limit',
  'not-found',
  'unauthorized',
]) {
  test(`withdrawal ${kind} preserves or releases its exact pending command appropriately`, async () => {
    const command = {
      kind: 'WITHDRAWAL',
      input: { clientRequestId: 'stable-withdrawal', qty: 2, addressVersion: 1 },
    };
    const error =
      kind === 'network'
        ? new TypeError('Connection lost')
        : new ApiError(
            'Outcome',
            {
              timeout: 408,
              server: 503,
              'conflicting-reference': 409,
              'business-rejection': 422,
              authorization: 403,
              'rate-limit': 429,
              'not-found': 404,
              unauthorized: 401,
            }[kind],
            kind === 'conflicting-reference'
              ? 'ORDERS.IDEMPOTENCY_CONFLICT'
              : 'ORDERS.WITHDRAWAL_STOCK_UNAVAILABLE',
          );
    let pending, feedback;
    const run = execute({
      ApiError,
      isRejectedOperation,
      persistPendingWithdrawal() {},
      clearPendingWithdrawal() {},
      running: { current: false },
      scope: 'current',
      orderScope: () => 'current',
      sellerWithdrawalAccess: () => true,
      abort: { current: new AbortController() },
      setBusy() {},
      setNotice() {},
      setPending(value) {
        pending = value;
      },
      setError(value) {
        feedback = value;
      },
      t: Object.assign((key) => key, { has: () => false }),
      withdrawalApi: {
        create: async () => {
          throw error;
        },
      },
    });
    await run(command);
    assert.equal(pending, kind === 'business-rejection' ? null : command);
    assert.equal(feedback, kind === 'business-rejection' ? 'rejected' : 'unknown');
  });
}

test('unavailable recovery storage prevents the API request and releases the unsent form', async () => {
  let pending,
    feedback,
    calls = 0;
  const run = execute({
    running: { current: false },
    scope: 'current',
    orderScope: () => 'current',
    sellerWithdrawalAccess: () => true,
    abort: { current: new AbortController() },
    setBusy() {},
    setNotice() {},
    setPending: (v) => (pending = v),
    setError: (v) => (feedback = v),
    persistPendingWithdrawal() {
      throw new Error('blocked');
    },
    clearPendingWithdrawal() {
      throw new Error('unexpected clear');
    },
    t: (key) => key,
    withdrawalApi: {
      create: async () => {
        calls++;
      },
    },
  });
  await run({ kind: 'WITHDRAWAL', input: { clientRequestId: 'unsent' } });
  assert.equal(calls, 0);
  assert.equal(pending, null);
  assert.equal(feedback, 'recoveryUnavailable');
});
test('confirmed replay clears only its recovery reference and returns the original order', async () => {
  const effects = [];
  let pending;
  const input = { clientRequestId: 'stable', qty: 2, addressVersion: 1 };
  const run = execute({
    running: { current: false },
    scope: 'current',
    orderScope: () => 'current',
    sellerWithdrawalAccess: () => true,
    abort: { current: new AbortController() },
    setBusy() {},
    setNotice: (value) => {
      if (value) effects.push(['notice', value]);
    },
    setPending: (v) => (pending = v),
    setError() {},
    persistPendingWithdrawal: (v) => effects.push(['persist', v]),
    clearPendingWithdrawal: (id) => effects.push(['clear', id]),
    t: (key) => key,
    withdrawalApi: {
      create: async (v) => {
        effects.push(['api', v]);
        return { orderId: 'original', replayed: true };
      },
    },
    form: { reset: (value) => effects.push(['reset', value]) },
    onAccepted: (id, code) => effects.push(['accepted', id, code]),
  });
  await run({ kind: 'WITHDRAWAL', input });
  assert.deepEqual(effects, [
    ['persist', input],
    ['api', input],
    ['clear', 'stable'],
    ['reset', { selection: '', qty: 1 }],
    ['accepted', 'original', 'WD-stable'],
    ['notice', 'recovered'],
  ]);
  assert.equal(pending, null);
});
