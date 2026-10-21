import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, api, schemas, auth;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001',
  warehouse = '00000000-0000-4000-8000-000000000002';
const input = {
  operationKey: id,
  expectedVersion: 4,
  actualCartonCount: 3,
  reason: 'Counted physical cartons',
};
const confirmation = {
  id,
  reviewId: id,
  actualCartonCount: 3,
  reason: input.reason,
  confirmedAt: '2026-10-20T00:00:00.000Z',
};
const state = { receiptId: id, receiptVersion: 4, canConfirm: false, confirmation };
const ok = (data) => Response.json({ success: true, data, meta: {} });
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  schemas = await server.ssrLoadModule('/src/features/inbound/api/receiptCartonApi.ts');
  api = schemas.receiptCartonApi;
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  auth.getState().setSession({
    accessToken: 'synthetic-carton-test',
    expiresIn: 900,
    user: {
      userId: id,
      tenantId: null,
      email: 'manager@example.test',
      fullName: 'Test Manager',
      actorScope: 'PLATFORM',
      roles: ['WAREHOUSE_MANAGER'],
      permissions: [],
    },
  });
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
test('sends only physical evidence and the original retry identity', async () => {
  const commands = [];
  globalThis.fetch = async (url, options) => {
    assert.match(
      String(url),
      new RegExp(`/v1/warehouses/${warehouse}/asns/${id}/receiving/cartons$`),
    );
    commands.push(JSON.parse(options.body));
    if (commands.length === 1) throw new TypeError('Synthetic lost response');
    return ok(confirmation);
  };
  await assert.rejects(api.confirm(warehouse, id, input));
  assert.deepEqual(await api.confirm(warehouse, id, input), confirmation);
  assert.deepEqual(commands, [input, input]);
});
test('loads operational confirmation scoped to the selected receipt', async () => {
  const controller = new AbortController();
  globalThis.fetch = async (_, options) => {
    assert.equal(options.signal, controller.signal);
    return ok(state);
  };
  assert.deepEqual(await api.get(warehouse, id, id, controller.signal), state);
  await assert.rejects(api.get(warehouse, id, warehouse, controller.signal));
});
for (const [name, change] of Object.entries({
  financial: { amountVnd: '20000' },
  contract: { contractId: id },
  identity: { tenantId: id },
  eligibility: { canConfirm: true },
})) {
  test(`rejects ${name} data outside the operational projection`, async () => {
    globalThis.fetch = async () => ok({ ...state, ...change });
    await assert.rejects(api.get(warehouse, id, id));
  });
}
for (const [name, change] of Object.entries({
  count: { actualCartonCount: 999 },
  reason: { reason: 'Different confirmation' },
  financial: { unitPriceVnd: '20000' },
  time: { confirmedAt: 'not a date' },
})) {
  test(`rejects mismatched ${name} confirmation`, async () => {
    globalThis.fetch = async () => ok({ ...confirmation, ...change });
    await assert.rejects(api.confirm(warehouse, id, input));
  });
}
for (const value of ['', '-1', '0.5', '1e2', '01', '1000001', ' 3 '])
  test(`rejects invalid physical input ${JSON.stringify(value)}`, () => {
    assert.equal(
      schemas.cartonFormSchema.safeParse({ actualCartonCount: value, reason: input.reason })
        .success,
      false,
    );
  });
test('validates zero and maximum without filling from a seller declaration', () => {
  for (const actualCartonCount of ['0', '1000000'])
    assert.equal(
      schemas.cartonFormSchema.safeParse({ actualCartonCount, reason: input.reason }).success,
      true,
    );
  assert.equal(schemas.cartonInputSchema.safeParse({ ...input, tenantId: id }).success, false);
  assert.equal(schemas.cartonInputSchema.safeParse({ ...input, reason: '   ' }).success, false);
});
