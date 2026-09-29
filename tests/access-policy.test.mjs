import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let policy;
let getPostLoginPath;

const PLATFORM = 'PLATFORM';
const TENANT = 'TENANT';

const ADMIN = ['ORCA_ADMIN'];
const OPS = ['OPS_DISPATCHER'];
const WH_MANAGER = ['WAREHOUSE_MANAGER'];
const WH_STAFF = ['WAREHOUSE_STAFF'];
const ACCOUNTANT = ['ORCA_ACCOUNTANT'];
const OWNER = ['SELLER_OWNER'];
const SELLER_STAFF = ['SELLER_STAFF'];

/** [role, actorScope] cho cả 7 role ORCA. */
const ALL_ROLES = [
  ['ORCA_ADMIN', PLATFORM],
  ['OPS_DISPATCHER', PLATFORM],
  ['WAREHOUSE_MANAGER', PLATFORM],
  ['WAREHOUSE_STAFF', PLATFORM],
  ['ORCA_ACCOUNTANT', PLATFORM],
  ['SELLER_OWNER', TENANT],
  ['SELLER_STAFF', TENANT],
];

function effective(roles, actorScope) {
  return policy.getEffectiveRoles(roles, actorScope);
}

function user(roles, actorScope, tenantId = actorScope === TENANT ? 'tenant-1' : null) {
  return {
    userId: 'user-1',
    tenantId,
    email: 'user@example.test',
    fullName: 'Test User',
    actorScope,
    roles,
    permissions: [],
  };
}

function hrefs(roles, actorScope) {
  return policy.getSearchLinks(effective(roles, actorScope), false).map((link) => link.href);
}

function groupKeys(roles, actorScope) {
  return policy.getVisibleNavGroups(effective(roles, actorScope), false).map((group) => group.key);
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
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  ({ getPostLoginPath } = await server.ssrLoadModule('/src/lib/authRedirect.ts'));
});

after(async () => {
  await server?.close();
});

test('the seven ORCA roles each map to exactly one actor scope', () => {
  assert.deepEqual(
    [...policy.ORCA_ROLES].sort(),
    [
      'OPS_DISPATCHER',
      'ORCA_ACCOUNTANT',
      'ORCA_ADMIN',
      'SELLER_OWNER',
      'SELLER_STAFF',
      'WAREHOUSE_MANAGER',
      'WAREHOUSE_STAFF',
    ],
  );
  for (const [role, scope] of ALL_ROLES) {
    assert.equal(policy.ROLE_ACTOR_SCOPE[role], scope, `${role} scope`);
    assert.deepEqual(effective([role], scope), [role]);
  }
});

test('getEffectiveRoles is fail-closed for missing scope, unknown/legacy roles and mixed scopes', () => {
  assert.deepEqual(effective([], TENANT), []);
  assert.deepEqual(effective(['UNKNOWN_ROLE'], PLATFORM), []);
  assert.deepEqual(effective(['SUPER_ADMIN', 'TENANT_ADMIN', 'DISPATCHER', 'ACCOUNTANT'], PLATFORM), []);
  assert.deepEqual(effective(['SUPER_ADMIN'], TENANT), []);
  assert.deepEqual(effective(OWNER, undefined), []);
  assert.deepEqual(effective(OWNER, null), []);
  assert.deepEqual(effective(OWNER, 'GUEST'), []);
  // Role thuộc scope khác ⇒ deny toàn bộ principal, không tự chọn scope.
  assert.deepEqual(effective(OWNER, PLATFORM), []);
  assert.deepEqual(effective(ADMIN, TENANT), []);
  assert.deepEqual(effective(['SELLER_OWNER', 'ORCA_ADMIN'], PLATFORM), []);
  assert.deepEqual(effective(['OPS_DISPATCHER', 'OPS_DISPATCHER'], PLATFORM), ['OPS_DISPATCHER']);
});

test('multi-role union applies only within one actor scope', () => {
  const opsAccountant = effective(['OPS_DISPATCHER', 'ORCA_ACCOUNTANT'], PLATFORM);
  assert.deepEqual(opsAccountant, ['OPS_DISPATCHER', 'ORCA_ACCOUNTANT']);
  assert.equal(policy.can(opsAccountant, 'rules.operate'), true);
  assert.equal(policy.can(opsAccountant, 'reconciliation.operate'), true);
  assert.equal(policy.can(opsAccountant, 'platform.tenants.manage'), false);

  const seller = effective(['SELLER_OWNER', 'SELLER_STAFF'], TENANT);
  assert.equal(policy.can(seller, 'apikey.manage'), true);
  assert.equal(policy.can(seller, 'catalog.products.manage'), true);

  const mixed = effective(['ORCA_ADMIN', 'SELLER_OWNER'], PLATFORM);
  assert.deepEqual(mixed, []);
  assert.equal(policy.can(mixed, 'platform.tenants.manage'), false);
  assert.equal(policy.can(mixed, 'apikey.manage'), false);
});

test('each ORCA role has the expected action visibility', () => {
  const allowed = [
    ['ORCA_ADMIN', PLATFORM, 'platform.tenants.manage'],
    ['ORCA_ADMIN', PLATFORM, 'warehouses.manage'],
    ['OPS_DISPATCHER', PLATFORM, 'rules.operate'],
    ['OPS_DISPATCHER', PLATFORM, 'orders.operate'],
    ['WAREHOUSE_MANAGER', PLATFORM, 'shipments.operate'],
    ['WAREHOUSE_MANAGER', PLATFORM, 'orders.operate'],
    ['WAREHOUSE_STAFF', PLATFORM, 'inventory.view'],
    ['WAREHOUSE_STAFF', PLATFORM, 'shipments.operate'],
    ['ORCA_ACCOUNTANT', PLATFORM, 'reconciliation.operate'],
    ['ORCA_ACCOUNTANT', PLATFORM, 'invoice.view'],
    ['SELLER_OWNER', TENANT, 'apikey.manage'],
    ['SELLER_OWNER', TENANT, 'catalog.products.manage'],
    ['SELLER_STAFF', TENANT, 'orders.operate'],
    ['SELLER_STAFF', TENANT, 'inventory.view'],
  ];
  for (const [role, scope, capability] of allowed) {
    assert.equal(policy.can(effective([role], scope), capability), true, `${role} → ${capability}`);
  }

  const denied = [
    ['ORCA_ADMIN', PLATFORM, 'apikey.manage'],
    ['ORCA_ADMIN', PLATFORM, 'workspace.settings.manage'],
    ['OPS_DISPATCHER', PLATFORM, 'rules.create_delete'],
    ['OPS_DISPATCHER', PLATFORM, 'warehouses.manage'],
    ['OPS_DISPATCHER', PLATFORM, 'platform.tenants.manage'],
    ['WAREHOUSE_MANAGER', PLATFORM, 'warehouses.manage'],
    ['WAREHOUSE_MANAGER', PLATFORM, 'reconciliation.view'],
    ['WAREHOUSE_STAFF', PLATFORM, 'workspace.dashboard.view'],
    ['ORCA_ACCOUNTANT', PLATFORM, 'warehouses.view'],
    ['ORCA_ACCOUNTANT', PLATFORM, 'rules.operate'],
    ['SELLER_OWNER', TENANT, 'platform.tenants.manage'],
    ['SELLER_OWNER', TENANT, 'audit.platform.view'],
    ['SELLER_STAFF', TENANT, 'apikey.manage'],
    ['SELLER_STAFF', TENANT, 'iam.users.manage'],
  ];
  for (const [role, scope, capability] of denied) {
    assert.equal(
      policy.can(effective([role], scope), capability),
      false,
      `${role} must not have ${capability}`,
    );
  }
});

test('WAREHOUSE_STAFF is denied financial, COD, invoice and API-key capabilities', () => {
  const whStaff = effective(WH_STAFF, PLATFORM);
  for (const capability of [
    'finance.view',
    'cod.view',
    'invoice.view',
    'apikey.manage',
    'reconciliation.view',
    'reconciliation.operate',
    'workspace.billing.view',
    'carriers.credentials.manage',
    'audit.platform.view',
  ]) {
    assert.equal(policy.can(whStaff, capability), false, `WAREHOUSE_STAFF must not have ${capability}`);
  }
  assert.equal(policy.canAny(whStaff, ['finance.view', 'cod.view', 'invoice.view', 'apikey.manage']), false);
  assert.equal(policy.canAll(whStaff, ['inventory.view', 'finance.view']), false);
});

test('unknown, empty and legacy roles get no route, nav, search or action access', () => {
  for (const roles of [[], ['UNKNOWN_ROLE'], ['TENANT_ADMIN'], ['SUPER_ADMIN']]) {
    const resolved = effective(roles, PLATFORM);
    assert.deepEqual(resolved, []);
    assert.equal(policy.isRouteAllowed(resolved, '/dashboard'), false);
    assert.equal(policy.isRouteAllowed(resolved, '/settings/profile'), false);
    assert.equal(policy.getVisibleNavGroups(resolved, true).length, 0);
    assert.equal(policy.getSearchLinks(resolved, true).length, 0);
    assert.equal(policy.can(resolved, 'orders.view'), false);
    assert.equal(policy.getDefaultPath(resolved), '/403');
  }
});

test('each ORCA role only reaches routes granted by the capability catalog', () => {
  const cases = [
    [
      'ORCA_ADMIN',
      PLATFORM,
      {
        allow: ['/admin/tenants', '/dashboard', '/orders', '/reconciliation', '/analytics'],
        deny: ['/settings/general', '/settings/webhooks', '/audit'],
      },
    ],
    [
      'OPS_DISPATCHER',
      PLATFORM,
      {
        allow: [
          '/orders',
          '/inventory',
          '/warehouses',
          '/rules',
          '/shipments',
          '/analytics',
          '/dashboard',
          '/integration-errors',
        ],
        deny: [
          '/reconciliation',
          '/billing',
          '/iam/users',
          '/roles-permissions/roles',
          '/settings/general',
          '/admin/tenants',
        ],
      },
    ],
    [
      'WAREHOUSE_MANAGER',
      PLATFORM,
      {
        allow: ['/warehouses', '/inventory', '/orders', '/shipments', '/analytics'],
        deny: ['/reconciliation', '/rules', '/billing', '/iam/users', '/admin/tenants'],
      },
    ],
    [
      'WAREHOUSE_STAFF',
      PLATFORM,
      {
        allow: ['/warehouses', '/inventory', '/orders', '/shipments'],
        deny: [
          '/dashboard',
          '/reconciliation',
          '/billing',
          '/rules',
          '/settings/integrations',
          '/settings/general',
          '/admin/tenants',
          '/iam/users',
        ],
      },
    ],
    [
      'ORCA_ACCOUNTANT',
      PLATFORM,
      {
        allow: [
          '/reconciliation',
          '/billing',
          '/rules',
          '/orders',
          '/dashboard',
          '/analytics',
          '/integration-errors',
        ],
        deny: ['/warehouses', '/settings/general', '/settings/integrations', '/iam/users', '/admin/tenants'],
      },
    ],
    [
      'SELLER_OWNER',
      TENANT,
      {
        allow: [
          '/dashboard',
          '/orders',
          '/inventory',
          '/warehouses',
          '/shipments',
          '/billing',
          '/settings/general',
          '/settings/webhooks',
          '/settings/integrations',
          '/roles-permissions/roles',
          '/iam/users',
          '/audit',
          '/integration-errors',
        ],
        deny: ['/rules', '/reconciliation', '/admin/tenants'],
      },
    ],
    [
      'SELLER_STAFF',
      TENANT,
      {
        allow: ['/dashboard', '/orders', '/inventory', '/warehouses', '/shipments', '/analytics'],
        deny: [
          '/reconciliation',
          '/billing',
          '/rules',
          '/settings/general',
          '/settings/webhooks',
          '/iam/users',
          '/roles-permissions/roles',
          '/audit',
          '/admin/tenants',
        ],
      },
    ],
  ];

  for (const [role, scope, matrix] of cases) {
    const resolved = effective([role], scope);
    for (const path of matrix.allow) {
      assert.equal(policy.isRouteAllowed(resolved, path), true, `${role} may reach ${path}`);
    }
    for (const path of matrix.deny) {
      assert.equal(policy.isRouteAllowed(resolved, path), false, `${role} must not reach ${path}`);
    }
  }
});

test('direct URL across portals and scopes is denied in both directions', () => {
  const owner = effective(OWNER, TENANT);
  const ops = effective(OPS, PLATFORM);

  assert.equal(policy.isRouteAllowed(owner, '/admin/tenants'), false);
  assert.equal(policy.isRouteAllowed(owner, '/reconciliation'), false);
  assert.equal(policy.isRouteAllowed(ops, '/settings/general'), false);
  assert.equal(policy.isRouteAllowed(ops, '/settings/webhooks'), false);

  assert.equal(hrefs(OWNER, TENANT).includes('/admin/tenants'), false);
  assert.equal(hrefs(OWNER, TENANT).includes('/reconciliation'), false);
  assert.equal(hrefs(OPS, PLATFORM).includes('/settings/general'), false);
  assert.equal(hrefs(OPS, PLATFORM).includes('/audit'), false);
});

test('trailing slash is normalized before matching a route', () => {
  assert.equal(policy.isRouteAllowed(effective(OWNER, TENANT), '/dashboard/'), true);
  assert.equal(policy.isRouteAllowed(effective(OWNER, TENANT), '/billing/'), true);
  assert.equal(policy.isRouteAllowed(effective(OWNER, TENANT), '/settings/profile/'), true);
  assert.equal(policy.isRouteAllowed(effective(OPS, PLATFORM), '/orders/'), true);
  assert.equal(policy.isRouteAllowed(effective(OPS, PLATFORM), '/reconciliation/'), false);
  assert.equal(policy.isRouteAllowed(effective(OWNER, TENANT), '/does-not-exist'), false);
});

test('default path for every role is a route that role may access', () => {
  const expected = {
    ORCA_ADMIN: '/admin/tenants',
    OPS_DISPATCHER: '/orders',
    WAREHOUSE_MANAGER: '/warehouses',
    WAREHOUSE_STAFF: '/inventory',
    ORCA_ACCOUNTANT: '/reconciliation',
    SELLER_OWNER: '/dashboard',
    SELLER_STAFF: '/dashboard',
  };
  for (const [role, scope] of ALL_ROLES) {
    const resolved = effective([role], scope);
    assert.equal(policy.getDefaultPath(resolved), expected[role], `${role} default path`);
    assert.equal(
      policy.isRouteAllowed(resolved, expected[role]),
      true,
      `${role} default route must be allowed`,
    );
  }
});

test('sidebar derives from the same capability source for every role', () => {
  const expected = {
    ORCA_ADMIN: [
      'platform_heading',
      'monitoring_heading',
      'workspace_heading',
      'operations_heading',
      'finance_heading',
      'reports_heading',
      'integrations_heading',
      'manage_accounts_heading',
      'workspace_settings_heading',
      'account_heading',
    ],
    OPS_DISPATCHER: [
      'workspace_heading',
      'operations_heading',
      'reports_heading',
      'integrations_heading',
      'monitoring_heading',
      'account_heading',
    ],
    WAREHOUSE_MANAGER: [
      'workspace_heading',
      'operations_heading',
      'reports_heading',
      'monitoring_heading',
      'account_heading',
    ],
    WAREHOUSE_STAFF: ['operations_heading', 'account_heading'],
    ORCA_ACCOUNTANT: [
      'workspace_heading',
      'operations_heading',
      'finance_heading',
      'reports_heading',
      'workspace_settings_heading',
      'monitoring_heading',
      'account_heading',
    ],
    SELLER_OWNER: [
      'workspace_heading',
      'operations_heading',
      'reports_heading',
      'integrations_heading',
      'manage_accounts_heading',
      'workspace_settings_heading',
      'monitoring_heading',
      'account_heading',
    ],
    SELLER_STAFF: ['workspace_heading', 'operations_heading', 'reports_heading', 'account_heading'],
  };

  for (const [role, scope] of ALL_ROLES) {
    assert.deepEqual(groupKeys([role], scope), expected[role], `${role} sidebar groups`);
  }
});

test('every visible nav/search href is route-allowed for that role (single source)', () => {
  for (const [role, scope] of ALL_ROLES) {
    const resolved = effective([role], scope);
    for (const link of policy.getSearchLinks(resolved, true)) {
      assert.equal(
        policy.isRouteAllowed(resolved, link.href, true),
        true,
        `${role} nav/search link ${link.href} must be route-allowed`,
      );
    }
  }
});

test('component catalog is dev-only and never grants production access', () => {
  const admin = effective(ADMIN, PLATFORM);
  assert.equal(policy.getVisibleNavGroups(admin, false).some((group) => group.key === 'ui_heading'), false);
  assert.equal(policy.getVisibleNavGroups(admin, true).some((group) => group.key === 'ui_heading'), true);
  assert.equal(policy.isRouteAllowed(admin, '/components/buttons', true), true);
  assert.equal(policy.isRouteAllowed(admin, '/components/buttons', false), false);
});

test('unknown capabilities are denied by default', () => {
  const admin = effective(ADMIN, PLATFORM);
  assert.equal(policy.can(admin, 'orders.superuser'), false);
  assert.equal(policy.can(admin, ''), false);
  assert.equal(policy.can(admin, 'invoice.issue'), false);
  assert.equal(policy.canAny(admin, ['orders.view', 'not.a.capability']), true);
  assert.equal(policy.canAll(admin, ['orders.view', 'not.a.capability']), false);
  assert.equal(policy.can(admin, 'orders.view'), true);
});

test('post-login redirect honors ORCA scope, route matrix and open-redirect guard', () => {
  assert.equal(getPostLoginPath(user(OWNER, TENANT), null), '/dashboard');
  assert.equal(getPostLoginPath(user(OPS, PLATFORM), null), '/orders');
  assert.equal(getPostLoginPath(user(ADMIN, PLATFORM), null), '/admin/tenants');
  assert.equal(getPostLoginPath(user(WH_STAFF, PLATFORM), null), '/inventory');

  assert.equal(
    getPostLoginPath(user(OWNER, TENANT), { from: '/orders?page=2#items' }),
    '/orders?page=2#items',
  );
  assert.equal(getPostLoginPath(user(OPS, PLATFORM), { from: '/reconciliation' }), '/orders');
  assert.equal(getPostLoginPath(user(OWNER, TENANT), { from: '/admin/tenants' }), '/dashboard');

  for (const from of ['//evil.test', 'https://evil.test', '/\\evil.test', '/login']) {
    assert.equal(getPostLoginPath(user(OWNER, TENANT), { from }), '/dashboard');
  }

  assert.equal(getPostLoginPath(user(['TENANT_ADMIN'], null), null), '/403');
});
