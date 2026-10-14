import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const id = '00000000-0000-4000-8000-000000000010';
const sellerId = '00000000-0000-4000-8000-000000000020';
const carrierId = '00000000-0000-4000-8000-000000000030';
const fallbackId = '00000000-0000-4000-8000-000000000040';
const originalFetch = globalThis.fetch;
let server, api, schema, policy, store;
const actor = () => ({
  userId: id,
  tenantId: null,
  actorScope: 'PLATFORM',
  roles: ['OPS_DISPATCHER'],
  permissions: [],
  email: 'synthetic-simulator@example.test',
  fullName: 'Synthetic',
});
const sample = () => ({
  kind: 'ALLOCATION',
  sample: { sellerId, weightG: 0, isCod: false, codAmountVnd: '0' },
});
const trace = () => ({
  ruleId: id,
  ruleVersion: 2,
  name: 'Synthetic rule',
  priority: 5,
  scope: 'GLOBAL',
  outcome: 'SELECTED',
  missingFields: [],
});
const result = () => ({
  kind: 'ALLOCATION',
  mode: 'PUBLISHED',
  match: {
    ruleId: id,
    ruleVersion: 2,
    name: 'Synthetic rule',
    priority: 5,
    scope: 'GLOBAL',
    action: { strategy: 'EXPIRY_FIRST' },
  },
  trace: [trace()],
  carrierServices: [],
  pending: ['ALLOCATION_PREVIEW'],
});
const ok = (data) =>
  Response.json({
    success: true,
    data,
    meta: {
      path: '/api/v1/rules/simulate',
      requestId: 'synthetic',
      timestamp: '2026-10-14T00:00:00Z',
    },
  });
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ ruleSimulationApi: api } = await server.ssrLoadModule(
    '/src/features/rules/api/ruleSimulationApi.ts',
  ));
  schema = await server.ssrLoadModule('/src/features/rules/schemas/ruleSimulationSchema.ts');
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  ({ useAuthStore: store } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  store
    .getState()
    .setSession({ accessToken: 'synthetic-simulation-token', expiresIn: 900, user: actor() });
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
test('sends only synthetic sample fields, uses POST and preserves cancellation signal', async () => {
  const signal = new AbortController().signal;
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url, 'https://example.test').pathname, '/api/v1/rules/simulate');
    assert.equal(options.method, 'POST');
    assert.equal(options.signal, signal);
    assert.deepEqual(JSON.parse(options.body), sample());
    return ok(result());
  };
  assert.deepEqual(await api.simulate(sample(), signal), result());
});
test('form conversion retains explicit zero/false, exact VND and omits empty optional facts', () => {
  const value = {
    sellerId: ' ' + sellerId + ' ',
    provinceCode: '',
    wardCode: '',
    warehouseId: '',
    weightG: '0',
    itemCount: '',
    codAmountVnd: '999999999999999999',
    isCod: 'false',
    ruleId: '',
    ruleVersion: '',
  };
  const parsed = schema.simulationFormSchema('invalid').parse(value);
  assert.deepEqual(schema.toSimulationRequest('ALLOCATION', parsed), {
    kind: 'ALLOCATION',
    sample: { sellerId, weightG: 0, codAmountVnd: '999999999999999999', isCod: false },
  });
});
test('supports exact saved draft/historical preview without a publication command', async () => {
  const input = { ...sample(), candidate: { ruleId: id, version: 2 } };
  globalThis.fetch = async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), input);
    return ok({ ...result(), mode: 'SAVED_VERSION' });
  };
  assert.equal((await api.simulate(input)).mode, 'SAVED_VERSION');
});
test('returns explicit no match and no fabricated selection', async () => {
  const value = {
    kind: 'ALLOCATION',
    mode: 'PUBLISHED',
    match: null,
    trace: [],
    carrierServices: [],
    pending: [],
  };
  globalThis.fetch = async () => ok(value);
  assert.deepEqual(await api.simulate(sample()), value);
});
test('accepts primary/fallback metadata only in the rule-defined order and keeps price pending', async () => {
  const value = {
    ...result(),
    kind: 'CARRIER',
    match: {
      ...result().match,
      action: { carrierServiceId: carrierId, fallbackServiceIds: [fallbackId] },
    },
    carrierServices: [
      { id: carrierId, name: 'Primary', role: 'PRIMARY' },
      { id: fallbackId, name: 'Fallback', role: 'FALLBACK' },
    ],
    pending: ['CARRIER_QUOTE'],
  };
  globalThis.fetch = async () => ok(value);
  assert.deepEqual(await api.simulate({ ...sample(), kind: 'CARRIER' }), value);
  globalThis.fetch = async () =>
    ok({ ...value, carrierServices: [...value.carrierServices].reverse() });
  await assert.rejects(api.simulate({ ...sample(), kind: 'CARRIER' }), { name: 'ZodError' });
});
for (const changed of [
  { tenantId: sellerId },
  { rules: [] },
  { actorScope: 'TENANT' },
  { sample: { sellerId, tenantId: sellerId } },
  { sample: { sellerId, weightG: -1 } },
  { sample: { sellerId, weightG: 0.5 } },
  { sample: { sellerId, itemCount: Number.MAX_SAFE_INTEGER + 1 } },
  { sample: { sellerId, codAmountVnd: 0 } },
  { sample: { sellerId, codAmountVnd: '01' } },
  { sample: { sellerId, isCod: 'false' } },
  { candidate: { ruleId: id, version: 0 } },
  { candidate: { ruleId: id, version: 2, definition: {} } },
])
  test(`rejects invalid or authority-bearing request ${JSON.stringify(changed)} before network`, async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return ok(result());
    };
    await assert.rejects(api.simulate({ ...sample(), ...changed }));
    assert.equal(calls, 0);
  });
for (const changed of [
  { quoteVnd: '1000' },
  { selectedWarehouseId: carrierId },
  { token: 'must-not-cache' },
  { trace: [trace(), trace()] },
  { trace: [{ ...trace(), ruleVersion: 1 }] },
  { trace: [{ ...trace(), outcome: 'MATCHED' }] },
  { match: { ...result().match, action: { carrierServiceId: carrierId, fallbackServiceIds: [] } } },
  { pending: [] },
  { match: null },
  { carrierServices: [{ id: carrierId, name: 'Invalid extra', role: 'PRIMARY' }] },
])
  test(`rejects inconsistent/private response ${JSON.stringify(changed)}`, async () => {
    globalThis.fetch = async () => ok({ ...result(), ...changed });
    await assert.rejects(api.simulate(sample()), { name: 'ZodError' });
  });
test('rejects a response for the wrong kind, mode or requested saved version', async () => {
  globalThis.fetch = async () => ok({ ...result(), mode: 'SAVED_VERSION' });
  await assert.rejects(api.simulate(sample()));
  globalThis.fetch = async () => ok({ ...result(), mode: 'SAVED_VERSION' });
  await assert.rejects(api.simulate({ ...sample(), candidate: { ruleId: id, version: 1 } }));
});
test('403/dependency failures preserve session and return the stable server error', async () => {
  const current = store.getState().user;
  for (const [status, code] of [
    [403, 'AUTH.FORBIDDEN'],
    [503, 'RULES.DEPENDENCY_UNAVAILABLE'],
  ]) {
    globalThis.fetch = async () =>
      Response.json(
        {
          success: false,
          error: { code, message: 'Synthetic failure', statusCode: status },
          meta: {},
        },
        { status },
      );
    await assert.rejects(api.simulate(sample()), { status, code });
    assert.equal(store.getState().user, current);
  }
});
test('rejects late results after identity/assignment changes and an aborted request', async () => {
  let release;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const request = api.simulate(sample());
  await new Promise((resolve) => setImmediate(resolve));
  store
    .getState()
    .setSession({
      accessToken: 'synthetic-updated-token',
      expiresIn: 900,
      user: { ...actor(), warehouseIds: [carrierId] },
    });
  release(ok(result()));
  await assert.rejects(request);
  const controller = new AbortController();
  globalThis.fetch = async () => {
    controller.abort();
    return ok(result());
  };
  await assert.rejects(api.simulate(sample(), controller.signal));
});
for (const [role, allocation, carrier] of [
  ['OPS_DISPATCHER', true, true],
  ['ORCA_ADMIN', false, true],
  ['WAREHOUSE_MANAGER', false, false],
  ['WAREHOUSE_STAFF', false, false],
  ['ORCA_ACCOUNTANT', false, false],
  ['SELLER_OWNER', false, false],
  ['SELLER_STAFF', false, false],
  ['SUPER_ADMIN', false, false],
])
  test(`simulation capability for ${role}`, () => {
    const scope = role.startsWith('SELLER') ? 'TENANT' : 'PLATFORM';
    const roles = policy.getEffectiveRoles([role], scope);
    assert.equal(policy.can(roles, 'rules.simulate.allocation'), allocation);
    assert.equal(policy.can(roles, 'rules.simulate.carrier'), carrier);
  });
test('mixed or missing scope cannot acquire simulation from screen access', () => {
  for (const roles of [
    policy.getEffectiveRoles(['OPS_DISPATCHER', 'SELLER_OWNER'], 'PLATFORM'),
    policy.getEffectiveRoles(['OPS_DISPATCHER'], null),
  ])
    assert.equal(policy.can(roles, 'rules.simulate.allocation'), false);
});
test('simulator translations retain identical keys and interpolation variables', () => {
  const load = (locale) =>
    JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'))
      .RuleSimulator;
  const flat = (value, path = '') =>
    Object.entries(value).flatMap(([key, item]) =>
      typeof item === 'string'
        ? [[path + key, [...item.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()]]
        : flat(item, path + key + '.'),
    );
  assert.deepEqual(flat(load('en')), flat(load('vi')));
});
