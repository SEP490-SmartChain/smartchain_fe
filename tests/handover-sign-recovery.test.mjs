import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import ts from 'typescript';

const warehouse = '00001193-0000-4000-8000-000000000001';
const manifest = '00001193-0000-4000-8000-000000000002';
const otherWarehouse = '00001193-0000-4000-8000-000000000003';
const values = {
  confirmedParcelCount: 1,
  carrierAckRef: 'Synthetic acknowledgement',
  carrierSignerName: 'Synthetic carrier',
  evidenceKey: 'private/verified-synthetic-photo',
};
const signed = { id: manifest, status: 'SIGNED' };
let server, auth, createRecovery, ApiError;
function login(roles = ['WAREHOUSE_STAFF'], warehouseIds = [warehouse]) {
  auth.getState().setSession({
    accessToken: 'synthetic',
    expiresIn: 900,
    user: {
      userId: manifest,
      tenantId: roles[0]?.startsWith('SELLER') ? manifest : null,
      actorScope: roles[0]?.startsWith('SELLER') ? 'TENANT' : 'PLATFORM',
      roles,
      permissions: [],
      warehouseIds,
      email: 'synthetic@example.test',
      fullName: 'Synthetic staff',
    },
  });
}
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  ({ createHandoverSignRecovery: createRecovery } = await server.ssrLoadModule(
    '/src/features/orders/lib/handoverSignRecovery.ts',
  ));
  ({ ApiError } = await server.ssrLoadModule('/src/services/apiClient.ts'));
});
beforeEach(() => {
  auth.getState().clear();
  login();
});
after(async () => server?.close());
const signal = () => new AbortController().signal;
function harness(sign) {
  let serial = 0;
  return (warehouseId = warehouse, manifestId = manifest) =>
    createRecovery(warehouseId, manifestId, { sign }, () => `operation-${++serial}`);
}

test('timeout and remount reuse exact operation, count, acknowledgement, signer and evidence', async () => {
  const calls = [];
  const mount = harness(async (_warehouse, _manifest, command) => {
    calls.push(command);
    if (calls.length === 1) throw new TypeError('Lost response');
    return signed;
  });
  await assert.rejects(mount().submit(values, signal()), /Lost response/);
  const remounted = mount();
  assert.deepEqual(remounted.pending(), { ...values, operationId: 'operation-1' });
  assert.equal(
    await remounted.submit(
      { ...values, confirmedParcelCount: 2, evidenceKey: 'changed' },
      signal(),
    ),
    true,
  );
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(remounted.pending(), null);
  assert.equal(
    await mount().submit(values, signal()),
    false,
    'completed views must not sign again',
  );
  assert.equal(calls.length, 2);
});

test('two views cannot replace or concurrently send the unresolved command', async () => {
  let rejectFirst;
  const calls = [];
  const mount = harness(async (_warehouse, _manifest, command) => {
    calls.push(command);
    if (calls.length === 1)
      return new Promise((_resolve, reject) => {
        rejectFirst = reject;
      });
    return signed;
  });
  const first = mount().submit(values, signal());
  const second = mount();
  assert.equal(await second.submit({ ...values, carrierAckRef: 'other' }, signal()), false);
  assert.equal(calls.length, 1);
  rejectFirst(new TypeError('Timeout'));
  await assert.rejects(first, /Timeout/);
  assert.equal(await second.submit(values, signal()), true);
  assert.deepEqual(calls[1], calls[0]);
});

test('unmount abort preserves command and ignores a late success before remount retry', async () => {
  let resolveFirst, observed;
  const calls = [];
  const mount = harness(async (_warehouse, _manifest, command, requestSignal) => {
    calls.push(command);
    observed = requestSignal;
    if (calls.length === 1)
      return new Promise((resolve) => {
        resolveFirst = resolve;
      });
    return signed;
  });
  const controller = new AbortController();
  const first = mount().submit(values, controller.signal);
  controller.abort();
  assert.equal(observed.aborted, true);
  resolveFirst(signed);
  assert.equal(await first, false);
  assert.ok(mount().pending());
  assert.equal(await mount().submit(values, signal()), true);
  assert.deepEqual(calls[1], calls[0]);
});

for (const change of ['assignment', 'identity', 'role']) {
  test(`${change} change aborts the write, clears memory and prevents stale replay`, async () => {
    let resolve, observed;
    let calls = 0;
    const mount = harness(async (_warehouse, _manifest, _command, requestSignal) => {
      calls++;
      observed = requestSignal;
      return new Promise((done) => {
        resolve = done;
      });
    });
    const old = mount();
    const request = old.submit(values, signal());
    const user = auth.getState().user;
    auth.getState().setUser({
      ...user,
      ...(change === 'assignment'
        ? { warehouseIds: [] }
        : change === 'identity'
          ? { userId: otherWarehouse }
          : { roles: ['WAREHOUSE_MANAGER'] }),
    });
    assert.equal(observed.aborted, true);
    assert.equal(old.pending(), null);
    assert.equal(mount().pending(), null);
    resolve(signed);
    assert.equal(await request, false);
    assert.equal(await old.submit(values, signal()), false);
    assert.equal(calls, 1);
  });
}

test('only assigned Staff can send sign; seven roles and invalid scope fail closed', async () => {
  let calls = 0;
  const mount = harness(async () => {
    calls++;
    return signed;
  });
  for (const role of [
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'WAREHOUSE_MANAGER',
    'ORCA_ACCOUNTANT',
    'SELLER_OWNER',
    'SELLER_STAFF',
  ]) {
    login([role]);
    assert.equal(await mount().submit(values, signal()), false, role);
  }
  login(['WAREHOUSE_STAFF'], []);
  assert.equal(await mount().submit(values, signal()), false);
  login();
  assert.equal(await mount(otherWarehouse).submit(values, signal()), false);
  auth.getState().setUser({ ...auth.getState().user, actorScope: 'TENANT' });
  assert.equal(await mount().submit(values, signal()), false);
  login();
  assert.equal(await mount().submit(values, signal()), true);
  assert.equal(calls, 1);
});

for (const [code, status, retain] of [
  ['PACK.PARCEL_COUNT_MISMATCH', 422, false],
  ['PACK.IDEMPOTENCY_CONFLICT', 409, true],
  ['PACK.CONTENTION', 409, true],
  ['HTTP.TIMEOUT', 408, true],
  ['HTTP.UNAVAILABLE', 503, true],
]) {
  test(`${code} ${retain ? 'retains' : 'releases'} the exact pending sign`, async () => {
    const mount = harness(async () => {
      throw new ApiError('Synthetic failure', status, code);
    });
    await assert.rejects(mount().submit(values, signal()), /Synthetic failure/);
    assert.equal(Boolean(mount().pending()), retain);
  });
}

test('unconfirmed or wrong-manifest responses retain recovery rather than declaring success', async () => {
  for (const response of [
    { id: manifest, status: 'DRAFT' },
    { id: otherWarehouse, status: 'SIGNED' },
  ]) {
    auth.getState().clear();
    login();
    const mount = harness(async () => response);
    await assert.rejects(mount().submit(values, signal()), /not confirmed/);
    assert.ok(mount().pending());
  }
});

test('SignManifest component remount restores the form and submits the same recovered command', async () => {
  const source = readFileSync(
    new URL('../src/features/orders/components/HandoverWorkspace.tsx', import.meta.url),
    'utf8',
  );
  const tree = ts.createSourceFile(
    'handover.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const fn = tree.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === 'SignManifest',
  );
  const code = ts.transpileModule(fn.getText(tree), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const calls = [];
  const recovery = harness(async (_warehouse, _manifest, command) => {
    calls.push(command);
    if (calls.length === 1) throw new TypeError('Lost response');
    return signed;
  });
  let defaults,
    completions = 0;
  const bindings = {
    React: { createElement: (type, props, ...children) => ({ type, props, children }) },
    useTranslations: () => (key) => key,
    useState: (initial) => [initial, () => {}],
    useRef: (current) => ({ current }),
    useEffect: () => {},
    useForm: (options) => {
      defaults = options.defaultValues;
      return { register: () => ({}), handleSubmit: (f) => f, formState: { errors: {} } };
    },
    zodResolver: () => ({}),
    handoverAckSchema: {},
    createHandoverSignRecovery: recovery,
    isRejectedOperation: () => false,
    ApiError,
    Alert: 'Alert',
    Input: 'Input',
    Button: 'Button',
  };
  const mount = () =>
    new Function(...Object.keys(bindings), code + ';return SignManifest;')(
      ...Object.values(bindings),
    )({
      warehouse,
      id: manifest,
      parcelCount: 1,
      onSigned: () => {
        completions++;
      },
    });
  await mount().props.onSubmit(values);
  assert.equal(completions, 0);
  const remount = mount();
  assert.deepEqual(defaults, { ...values, operationId: 'operation-1' });
  await remount.props.onSubmit(defaults);
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(completions, 1);
});
