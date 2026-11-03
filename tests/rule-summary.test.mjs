import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, summarizeCondition, matchesEveryOrder, findDefaultCarrierRule;
const labels = {
  field: (field) => `f:${field}`,
  operator: (operator) => `o:${operator}`,
  boolean: (value) => (value ? 'yes' : 'no'),
};

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ summarizeCondition, matchesEveryOrder, findDefaultCarrierRule } = await server.ssrLoadModule(
    '/src/features/rules/lib/ruleSummary.ts',
  ));
});
after(async () => {
  await server?.close();
});

test('an empty group matches every order', () => {
  assert.deepEqual(summarizeCondition({ kind: 'ALL', conditions: [] }, labels), {
    joiner: 'ALL',
    clauses: [],
  });
});

test('comparison, list and boolean predicates read as plain clauses', () => {
  const summary = summarizeCondition(
    {
      kind: 'ALL',
      conditions: [
        { kind: 'PREDICATE', field: 'weightG', operator: 'GT', value: 5000 },
        { kind: 'PREDICATE', field: 'provinceCode', operator: 'IN', values: ['48', '46'] },
        { kind: 'PREDICATE', field: 'isCod', operator: 'EQ', value: true },
        { kind: 'PREDICATE', field: 'wardCode', operator: 'EXISTS' },
      ],
    },
    labels,
  );
  assert.equal(summary.joiner, 'ALL');
  assert.deepEqual(summary.clauses, [
    'f:weightG o:GT 5000',
    'f:provinceCode o:IN 48, 46',
    'f:isCod o:EQ yes',
    'f:wardCode o:EXISTS',
  ]);
});

test('nested groups are wrapped and empty nested groups are dropped', () => {
  const summary = summarizeCondition(
    {
      kind: 'ANY',
      conditions: [
        {
          kind: 'ALL',
          conditions: [
            { kind: 'PREDICATE', field: 'weightG', operator: 'LT', value: 1000 },
            { kind: 'PREDICATE', field: 'itemCount', operator: 'GTE', value: 2 },
          ],
        },
        { kind: 'ALL', conditions: [] },
      ],
    },
    labels,
  );
  assert.equal(summary.joiner, 'ANY');
  assert.deepEqual(summary.clauses, ['(f:weightG o:LT 1000 + f:itemCount o:GTE 2)']);
});

const predicate = { kind: 'PREDICATE', field: 'weightG', operator: 'GT', value: 5000 };
const carrierAction = (id, fallbackServiceIds = []) => ({
  carrierServiceId: id,
  fallbackServiceIds,
});
const carrierRule = (id, overrides = {}) => ({
  id,
  kind: 'CARRIER',
  isEnabled: true,
  warehouseId: null,
  exceptionTenantId: null,
  condition: { kind: 'ALL', conditions: [] },
  action: carrierAction('svc-' + id),
  ...overrides,
});

test('only groups without predicates match every order', () => {
  assert.equal(matchesEveryOrder({ kind: 'ALL', conditions: [] }), true);
  assert.equal(
    matchesEveryOrder({ kind: 'ANY', conditions: [{ kind: 'ALL', conditions: [] }] }),
    true,
  );
  assert.equal(matchesEveryOrder(predicate), false);
  assert.equal(matchesEveryOrder({ kind: 'ALL', conditions: [predicate] }), false);
});

test('the default carrier rule is the first enabled, unconditional, unscoped carrier rule', () => {
  const rules = [
    carrierRule('heavy', { condition: { kind: 'ALL', conditions: [predicate] } }),
    carrierRule('off', { isEnabled: false }),
    carrierRule('warehouse', { warehouseId: 'wh-1' }),
    carrierRule('seller', { exceptionTenantId: 'tenant-1' }),
    carrierRule('default'),
    carrierRule('later'),
  ];
  assert.equal(findDefaultCarrierRule(rules)?.id, 'default');
  assert.equal(findDefaultCarrierRule(rules.slice(0, 4)), null);
  assert.equal(
    findDefaultCarrierRule([
      { ...carrierRule('alloc'), action: { strategy: 'NEAREST_WAREHOUSE' } },
    ]),
    null,
  );
});
