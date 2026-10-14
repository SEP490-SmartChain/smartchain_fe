import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const roles = [
  'ORCA_ADMIN',
  'OPS_DISPATCHER',
  'WAREHOUSE_MANAGER',
  'WAREHOUSE_STAFF',
  'ORCA_ACCOUNTANT',
  'SELLER_OWNER',
  'SELLER_STAFF',
];
const A = ['ORCA_ADMIN'],
  O = ['SELLER_OWNER'],
  sellers = ['SELLER_OWNER', 'SELLER_STAFF'];
const reporting = roles.filter((role) => role !== 'WAREHOUSE_STAFF');
const financial = ['ORCA_ADMIN', 'ORCA_ACCOUNTANT', 'SELLER_OWNER'];
const routes = {
  '/admin/staff': A,
  '/dashboard': reporting,
  '/catalog/skus': O,
  '/asns': sellers,
  '/orders': roles,
  '/returns': O,
  '/billing': financial,
  '/statements': O,
  '/warehouses': [
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'SELLER_OWNER',
  ],
  '/inventory': roles,
  '/warehouse': ['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'],
  '/rules': ['ORCA_ADMIN', 'OPS_DISPATCHER'],
  '/shipments': [
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'WAREHOUSE_MANAGER',
    'SELLER_OWNER',
    'SELLER_STAFF',
  ],
  '/exceptions': ['ORCA_ADMIN', 'OPS_DISPATCHER', 'WAREHOUSE_MANAGER'],
  '/reconciliation': ['ORCA_ADMIN', 'ORCA_ACCOUNTANT'],
  '/analytics': reporting,
  '/iam/users': ['ORCA_ADMIN', 'SELLER_OWNER'],
  '/settings/profile': roles,
  '/settings/general': O,
  '/settings/api-keys': O,
  '/settings/contract': O,
  '/settings/webhooks': O,
  '/audit': [],
  '/integration-errors': ['ORCA_ADMIN', 'OPS_DISPATCHER'],
  '/components': [],
  '/admin/warehouses': ['ORCA_ADMIN', 'OPS_DISPATCHER', 'WAREHOUSE_MANAGER'],
  '/admin': A,
};
let server, policy;
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
});
after(async () => {
  await server?.close();
});

test('SS-1302: every production route policy is inventoried', () => {
  assert.deepEqual(
    policy.ROUTE_POLICY.map((entry) => entry.path).sort(),
    Object.keys(routes).sort(),
  );
});
for (const [path, allowed] of Object.entries(routes)) {
  test(`SS-1302: direct URL matrix ${path}`, () => {
    for (const role of roles)
      assert.equal(
        policy.isRouteAllowed([role], path, false),
        allowed.includes(role),
        `${role}: ${path}`,
      );
  });
}
for (const role of roles) {
  test(`SS-1302: menu and search links obey direct URL access for ${role}`, () => {
    const links = policy
      .getVisibleNavGroups([role], false)
      .flatMap((group) => group.items.flatMap((item) => item.children ?? [item]));
    assert.deepEqual(
      new Set(policy.getSearchLinks([role], false).map((link) => link.href)),
      new Set(links.map((link) => link.href)),
    );
    for (const link of links)
      assert.equal(policy.isRouteAllowed([role], link.href, false), true, `${role}: ${link.href}`);
    assert.equal(policy.isRouteAllowed([role], '/components/buttons', false), false);
    assert.equal(policy.isRouteAllowed([role], '/not-an-approved-route', false), false);
  });
}
test('SS-1302: role revocation removes financial settings from route, menu and search together', () => {
  assert.equal(policy.isRouteAllowed(['SELLER_OWNER'], '/settings/api-keys'), true);
  for (const revoked of [[], ['SELLER_STAFF']]) {
    assert.equal(policy.isRouteAllowed(revoked, '/settings/api-keys'), false);
    assert.equal(
      policy.getSearchLinks(revoked, false).some((link) => link.href === '/settings/api-keys'),
      false,
    );
  }
});
