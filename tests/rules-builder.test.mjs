import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, api, schema, priority, policy;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';
const third = '00000000-0000-4000-8000-000000000003';
const definition = (override = {}) => ({
  name: 'North allocation',
  kind: 'ALLOCATION',
  warehouseId: null,
  exceptionTenantId: null,
  priority: 4,
  condition: { kind: 'ALL', conditions: [] },
  action: { strategy: 'NEAREST_WAREHOUSE' },
  ...override,
});
const rule = (override = {}) => ({
  ...definition(),
  id,
  version: 3,
  publishedVersion: 2,
  isEnabled: true,
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T00:00:00.000Z',
  ...override,
});
const ok = (data, pagination) =>
  Response.json({
    success: true,
    data,
    meta: {
      timestamp: '2026-10-11T00:00:00.000Z',
      path: '/v1/rules',
      requestId: 'synthetic',
      ...(pagination ? { pagination } : {}),
    },
  });
const page = { limit: 100, hasNext: false, nextCursor: null };
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ ruleApi: api } = await server.ssrLoadModule('/src/features/rules/api/ruleApi.ts'));
  schema = await server.ssrLoadModule('/src/features/rules/schemas/ruleSchema.ts');
  priority = await server.ssrLoadModule('/src/features/rules/lib/rulePriority.ts');
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  const { useAuthStore } = await server.ssrLoadModule('/src/stores/authStore.ts');
  useAuthStore.getState().setSession({
    accessToken: 'synthetic-rule-test-token',
    expiresIn: 900,
    user: {
      userId: id,
      tenantId: null,
      actorScope: 'PLATFORM',
      roles: ['ORCA_ADMIN'],
      permissions: [],
      email: 'synthetic@example.test',
      fullName: 'Synthetic',
    },
  });
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
for (const [field, value] of [
  ['weightG', 0],
  ['weightG', Number.MAX_SAFE_INTEGER],
  ['itemCount', 10],
  ['codAmountVnd', '999999999999999999'],
  ['isCod', false],
  ['warehouseId', second],
]) {
  test(`accepts correctly typed predicate ${field}=${value}`, () => {
    assert.equal(
      schema.definitionSchema.safeParse(
        definition({ condition: { kind: 'PREDICATE', field, operator: 'EQ', value } }),
      ).success,
      true,
    );
  });
}
for (const [field, value, operator = 'EQ'] of [
  ['weightG', -1],
  ['weightG', 0.5],
  ['weightG', '10'],
  ['itemCount', Number.MAX_SAFE_INTEGER + 1],
  ['codAmountVnd', 1000],
  ['codAmountVnd', '01'],
  ['codAmountVnd', '1000000000000000000'],
  ['isCod', 'false'],
  ['isCod', true, 'GT'],
  ['provinceCode', '01', 'GT'],
  ['warehouseId', 'unknown'],
]) {
  test(`rejects invalid unit or comparison ${field}/${operator}/${value}`, () => {
    assert.equal(
      schema.definitionSchema.safeParse(
        definition({ condition: { kind: 'PREDICATE', field, operator, value } }),
      ).success,
      false,
    );
  });
}
for (const override of [
  { name: ' x ' },
  { priority: -1 },
  { priority: 0.5 },
  { warehouseId: 'unknown' },
  { tenantId: second },
  { ownershipScope: 'TENANT' },
  { kind: 'CARRIER', action: { strategy: 'TOTAL_COST' } },
  { condition: { kind: 'ANY', conditions: [] } },
  { condition: { kind: 'PREDICATE', field: 'provinceCode', operator: 'IN', values: [] } },
]) {
  test(`rejects invalid or authority-bearing definition ${JSON.stringify(override)}`, () =>
    assert.equal(schema.definitionSchema.safeParse(definition(override)).success, false));
}
test('accepts nested AND/OR and a typed membership list', () => {
  const condition = {
    kind: 'ALL',
    conditions: [
      {
        kind: 'ANY',
        conditions: [
          { kind: 'PREDICATE', field: 'weightG', operator: 'GTE', value: 500 },
          { kind: 'PREDICATE', field: 'provinceCode', operator: 'IN', values: ['01', '79'] },
        ],
      },
      { kind: 'PREDICATE', field: 'isCod', operator: 'EXISTS' },
    ],
  };
  assert.deepEqual(schema.definitionSchema.parse(definition({ condition })).condition, condition);
});
test('rejects over-depth and over-budget conditions before recursive schema parsing', () => {
  let condition = { kind: 'PREDICATE', field: 'provinceCode', operator: 'EQ', value: '01' };
  for (let i = 0; i < 8; i++) condition = { kind: 'ALL', conditions: [condition] };
  assert.equal(schema.conditionSchema.safeParse(condition).success, false);
  const leaf = { kind: 'PREDICATE', field: 'weightG', operator: 'EQ', value: 1 };
  assert.equal(
    schema.conditionSchema.safeParse({
      kind: 'ALL',
      conditions: [
        { kind: 'ALL', conditions: Array(50).fill(leaf) },
        { kind: 'ALL', conditions: Array(50).fill(leaf) },
      ],
    }).success,
    false,
  );
});
test('keeps an ordered distinct carrier fallback list and rejects duplicates or more than ten', () => {
  const carrier = definition({
    kind: 'CARRIER',
    action: { carrierServiceId: id, fallbackServiceIds: [second, third] },
  });
  assert.deepEqual(schema.definitionSchema.parse(carrier).action, carrier.action);
  for (const fallback of [[id], [second, second], Array(11).fill(second)])
    assert.equal(
      schema.definitionSchema.safeParse({
        ...carrier,
        action: { carrierServiceId: id, fallbackServiceIds: fallback },
      }).success,
      false,
    );
});
test('trims name/reason and converts optional form references to null', () => {
  const form = {
    name: ' North allocation ',
    kind: 'ALLOCATION',
    warehouseId: '',
    exceptionTenantId: '',
    priority: 0,
    condition: { kind: 'ALL', conditions: [] },
    strategy: 'TOTAL_COST',
    carrierServiceId: '',
    fallbackServiceIds: [],
    reason: ' Create tested rule ',
  };
  const result = schema.ruleFormSchema('invalid').parse(form);
  assert.equal(schema.toDefinition(result).name, 'North allocation');
  assert.equal(schema.toDefinition(result).warehouseId, null);
  assert.equal(
    schema.reasonSchema('invalid').parse({ reason: form.reason }).reason,
    'Create tested rule',
  );
  assert.equal(schema.ruleFormSchema('invalid').safeParse({ ...form, reason: ' ' }).success, false);
});
for (const override of [
  { version: 0 },
  { publishedVersion: 4 },
  { isEnabled: false },
  { condition: { kind: 'UNKNOWN' } },
  { action: { strategy: 'UNKNOWN' } },
]) {
  test(`rejects malformed or inconsistent rule response ${JSON.stringify(override)}`, async () => {
    globalThis.fetch = async () => ok([rule(override)], page);
    await assert.rejects(api.list('ALLOCATION'), { name: 'ZodError' });
  });
}
test('list uses rule-kind pagination and the cancellation signal without identity overrides', async () => {
  const signal = new AbortController().signal;
  globalThis.fetch = async (url, options) => {
    const u = new URL(url, 'https://example.test');
    assert.equal(u.pathname, '/api/v1/rules');
    assert.deepEqual(Object.fromEntries(u.searchParams), {
      kind: 'ALLOCATION',
      limit: '100',
      cursor: second,
    });
    assert.equal(options.signal, signal);
    return ok([rule()], page);
  };
  assert.deepEqual((await api.list('ALLOCATION', second, signal)).items, [rule()]);
});
test('metadata chooser reads only ID/name and strips extra response fields', async () => {
  globalThis.fetch = async (url) => {
    assert.match(url, /\/rules\/targets\?kind=CARRIER_SERVICE/);
    return ok([{ id, name: 'Express', credential: 'must-not-cache' }], page);
  };
  assert.deepEqual((await api.targets('CARRIER_SERVICE')).items, [{ id, name: 'Express' }]);
});
test('creation retries reuse the caller operation key, normalized definition and reason', async () => {
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return ok(rule());
  };
  await api.create(second, definition(), ' Create rule ');
  await api.create(second, definition(), ' Create rule ');
  assert.deepEqual(requests, [
    { operationKey: second, definition: definition(), reason: 'Create rule' },
    { operationKey: second, definition: definition(), reason: 'Create rule' },
  ]);
});
test('invalid definitions and missing rollback targets never reach the network', async () => {
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return ok(rule());
  };
  await assert.rejects(api.create(id, definition({ priority: -1 }), 'Create'));
  await assert.rejects(api.command(rule(), 'rollback', 'Restore'));
  assert.equal(requests, 0);
});
for (const operation of ['publish', 'disable', 'rollback', 'delete']) {
  test(`${operation} sends the reviewed version and reason with the correct method`, async () => {
    globalThis.fetch = async (url, options) => {
      assert.equal(
        new URL(url, 'https://example.test').pathname,
        `/api/v1/rules/${id}${operation === 'delete' ? '' : '/' + operation}`,
      );
      assert.equal(options.method, operation === 'delete' ? 'DELETE' : 'POST');
      assert.deepEqual(JSON.parse(options.body), {
        expectedVersion: 3,
        reason: 'Reviewed change',
        ...(operation === 'rollback' ? { targetVersion: 1 } : {}),
      });
      return ok(rule());
    };
    assert.equal((await api.command(rule(), operation, 'Reviewed change', 1)).id, id);
  });
}
test('edit retains the reviewed CAS version and supports a draft response with unchanged effective pointer', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, 'PATCH');
    assert.deepEqual(JSON.parse(options.body), {
      expectedVersion: 3,
      definition: definition(),
      reason: 'Edit draft',
    });
    return ok(rule({ version: 4 }));
  };
  assert.equal((await api.edit(rule(), definition(), 'Edit draft')).publishedVersion, 2);
});
test('stale conflicts keep the authentication session and stable error code', async () => {
  const { useAuthStore } = await server.ssrLoadModule('/src/stores/authStore.ts');
  const user = useAuthStore.getState().user;
  globalThis.fetch = async () =>
    Response.json(
      {
        success: false,
        error: { code: 'RULES.STALE_VERSION', message: 'Synthetic stale', statusCode: 409 },
        meta: {},
      },
      { status: 409 },
    );
  await assert.rejects(api.edit(rule(), definition(), 'Edit draft'), {
    code: 'RULES.STALE_VERSION',
    status: 409,
  });
  assert.equal(useAuthStore.getState().user, user);
});
test('history validates the audit actor, date, operation and stored definition', async () => {
  const row = {
    version: 2,
    definition: definition(),
    operation: 'PUBLISH',
    reason: 'Publish reviewed rule',
    createdBy: id,
    createdAt: '2026-10-11T00:00:00.000Z',
  };
  globalThis.fetch = async () => ok([row], { ...page, limit: 20 });
  assert.deepEqual((await api.history(id)).items, [row]);
  globalThis.fetch = async () => ok([{ ...row, operation: 'UNKNOWN' }], page);
  await assert.rejects(api.history(id), { name: 'ZodError' });
});
test('metadata and directory reject broken cursors instead of silently truncating the list', async () => {
  globalThis.fetch = async () => ok([], { limit: 100, hasNext: true, nextCursor: null });
  await assert.rejects(api.list('ALLOCATION'), { name: 'ZodError' });
});
test('keyboard/drag ordering is immutable and emits reviewed versions for the whole rule kind', () => {
  const a = rule(),
    b = rule({ id: second }),
    c = rule({ id: third });
  const original = [a, b, c];
  const moved = priority.moveRule(original, id, third);
  assert.deepEqual(
    moved.map((r) => r.id),
    [second, third, id],
  );
  assert.deepEqual(original, [a, b, c]);
  assert.deepEqual(priority.priorityEntries(moved), [
    { id: second, expectedVersion: 3, priority: 0 },
    { id: third, expectedVersion: 3, priority: 1 },
    { id, expectedVersion: 3, priority: 2 },
  ]);
  assert.deepEqual(priority.moveRule(original, 'missing', id), original);
  assert.throws(() => priority.priorityEntries([a, a]));
  assert.throws(() => priority.priorityEntries([a, rule({ id: second, kind: 'CARRIER' })]));
});
test('priority mutation does not mutate local rule versions before server confirmation', async () => {
  const entries = priority.priorityEntries([rule({ id: second }), rule()]);
  globalThis.fetch = async (url, options) => {
    assert.match(url, /\/rules\/priority$/);
    assert.equal(options.method, 'PUT');
    assert.deepEqual(JSON.parse(options.body), { entries, reason: 'Reorder drafts' });
    return ok([rule({ id: second, version: 4, priority: 0 }), rule({ version: 4, priority: 1 })]);
  };
  assert.equal((await api.reorder(entries, 'Reorder drafts'))[0].version, 4);
});
for (const [role, scope, allowed] of [
  ['ORCA_ADMIN', 'PLATFORM', true],
  ['OPS_DISPATCHER', 'PLATFORM', true],
  ['WAREHOUSE_MANAGER', 'PLATFORM', false],
  ['WAREHOUSE_STAFF', 'PLATFORM', false],
  ['ORCA_ACCOUNTANT', 'PLATFORM', false],
  ['SELLER_OWNER', 'TENANT', false],
  ['SELLER_STAFF', 'TENANT', false],
  ['SUPER_ADMIN', 'PLATFORM', false],
]) {
  test(`routing configuration policy ${role}/${scope}=${allowed}`, () => {
    const roles = policy.getEffectiveRoles([role], scope);
    assert.equal(policy.can(roles, 'routing.rule.set'), allowed);
    assert.equal(policy.isRouteAllowed(roles, '/rules', false), allowed);
  });
}
test('mixed and missing-scope identities cannot obtain rule authority', () => {
  assert.equal(
    policy.can(
      policy.getEffectiveRoles(['ORCA_ADMIN', 'SELLER_OWNER'], 'PLATFORM'),
      'routing.rule.set',
    ),
    false,
  );
  assert.equal(
    policy.can(policy.getEffectiveRoles(['ORCA_ADMIN'], null), 'routing.rule.set'),
    false,
  );
});
test('English and Vietnamese rule messages preserve the same keys and interpolation fields', () => {
  const load = (locale) =>
    JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8')).Rules;
  const flat = (obj, path = '') =>
    Object.entries(obj).flatMap(([key, v]) =>
      typeof v === 'string'
        ? [[path + key, [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()]]
        : flat(v, path + key + '.'),
    );
  assert.deepEqual(flat(load('en')), flat(load('vi')));
});
