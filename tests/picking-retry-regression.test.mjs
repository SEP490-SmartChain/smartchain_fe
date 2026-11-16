import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
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

function extractPickingExecute(bindings) {
  const source = readFileSync(
    new URL('../src/features/orders/components/PickingWorkspace.tsx', import.meta.url),
    'utf8',
  );
  const tree = ts.createSourceFile(
    'PickingWorkspace.tsx',
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

test('picking preserves the exact command when the response is uncertain', async () => {
  const command = { path: 'confirm-pick', payload: { operationId: 'stable', qty: 2 } };
  const changes = [];
  const run = extractPickingExecute({
    ApiError,
    isRejectedOperation,
    busy: false,
    setBusy: (value) => changes.push(['busy', value]),
    setPending: (value) => changes.push(['pending', value]),
    setError: (value) => changes.push(['error', value]),
    setNotice() {},
    setWaveRequest() {},
    setLineCursor() {},
    setRefresh() {},
    setWaveId() {},
    actorId: 'actor-a',
    warehouse: 'warehouse-1',
    persistFulfillmentPending() {},
    clearFulfillmentPending() {},
    abort: { current: new AbortController() },
    mounted: { current: true },
    pickingApi: {
      execute: async () => {
        throw new ApiError('Timed out', 408, 'REQUEST.TIMEOUT');
      },
    },
    t: Object.assign((key) => key, { has: () => false }),
  });

  await run(command);

  assert.deepEqual(
    changes.find(([kind]) => kind === 'pending'),
    ['pending', command],
  );
  assert.equal(
    changes.some(([kind, value]) => kind === 'pending' && value === null),
    false,
  );
  assert.deepEqual(changes.filter(([kind]) => kind === 'error').at(-1), ['error', 'unknown']);
});

test('definite picking rejection releases the command for correction', async () => {
  const command = { path: 'confirm-pick', payload: { operationId: 'stable', qty: 2 } };
  const pendingValues = [],
    errors = [];
  const run = extractPickingExecute({
    ApiError,
    isRejectedOperation,
    busy: false,
    setBusy: () => {},
    setPending: (value) => pendingValues.push(value),
    setError: (value) => errors.push(value),
    setNotice() {},
    setWaveRequest() {},
    setLineCursor() {},
    setRefresh() {},
    setWaveId() {},
    actorId: 'actor-a',
    warehouse: 'warehouse-1',
    persistFulfillmentPending() {},
    clearFulfillmentPending() {},
    abort: { current: new AbortController() },
    mounted: { current: true },
    pickingApi: {
      execute: async () => {
        throw new ApiError('Invalid pick quantity', 422, 'ALLOCATION.INVALID_QUANTITY');
      },
    },
    t: Object.assign((key) => key, { has: () => false }),
  });

  await run(command);

  assert.deepEqual(pendingValues, [command, null]);
  assert.equal(errors.at(-1), 'rejected');
});

test('each wave line keeps its order and parcel identity visible while picking by location', () => {
  const source = readFileSync(
    new URL('../src/features/orders/components/PickingWorkspace.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /pickForOrder/);
  assert.match(source, /orderCode: line\.orderCode, parcelNo: line\.parcelNo/);
  assert.match(source, /line\.binCode/);
});
