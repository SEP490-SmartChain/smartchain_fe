import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

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

/** Danh sách file nguồn `.ts`/`.tsx` dưới `src/`, đường dẫn tương đối repo. */
function listSourceFiles(dir = join(REPO_ROOT, 'src')) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name))
      files.push(relative(REPO_ROOT, full).split(sep).join('/'));
  }
  return files;
}

/** Các file nguồn có câu lệnh import module `needle` (bỏ qua comment). */
function filesImporting(needle) {
  const pattern = new RegExp(
    `from\\s+['"][^'"]*${needle}['"]|import\\s*\\(\\s*['"][^'"]*${needle}['"]\\s*\\)`,
  );
  return listSourceFiles().filter((file) =>
    pattern.test(readFileSync(join(REPO_ROOT, file), 'utf8')),
  );
}

/** Các file nguồn có chứa chuỗi `needle` (mọi ngữ cảnh). */
function filesContaining(needle) {
  return listSourceFiles().filter((file) =>
    readFileSync(join(REPO_ROOT, file), 'utf8').includes(needle),
  );
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
  assert.deepEqual([...policy.ORCA_ROLES].sort(), [
    'OPS_DISPATCHER',
    'ORCA_ACCOUNTANT',
    'ORCA_ADMIN',
    'SELLER_OWNER',
    'SELLER_STAFF',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
  ]);
  for (const [role, scope] of ALL_ROLES) {
    assert.equal(policy.ROLE_ACTOR_SCOPE[role], scope, `${role} scope`);
    assert.deepEqual(effective([role], scope), [role]);
  }
});

test('getEffectiveRoles is fail-closed for missing scope, unknown/legacy roles and mixed scopes', () => {
  assert.deepEqual(effective([], TENANT), []);
  assert.deepEqual(effective(['UNKNOWN_ROLE'], PLATFORM), []);
  assert.deepEqual(
    effective(['SUPER_ADMIN', 'TENANT_ADMIN', 'DISPATCHER', 'ACCOUNTANT'], PLATFORM),
    [],
  );
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

test('any non-ORCA role code denies the whole principal (no skip-and-continue)', () => {
  // Happy path hợp lệ vẫn nguyên vẹn.
  assert.deepEqual(effective(OWNER, TENANT), ['SELLER_OWNER']);

  // Tenant scope có kèm code legacy ⇒ deny toàn bộ, không giữ role hợp lệ.
  assert.deepEqual(effective(['SELLER_OWNER', 'TENANT_ADMIN'], TENANT), []);
  assert.deepEqual(effective(['TENANT_ADMIN', 'SELLER_OWNER'], TENANT), []);
  assert.deepEqual(effective(['SELLER_OWNER', 'ACCOUNTANT'], TENANT), []);
  assert.deepEqual(effective(['ORCA_ADMIN', 'SUPER_ADMIN'], PLATFORM), []);

  // Code lạ (kể cả rỗng/khác hoa thường) trộn với role hợp lệ ⇒ deny toàn bộ.
  assert.deepEqual(effective(['ORCA_ADMIN', 'UNKNOWN_ROLE'], PLATFORM), []);
  assert.deepEqual(effective(['SELLER_OWNER', ''], TENANT), []);
  assert.deepEqual(effective(['SELLER_OWNER', 'seller_owner'], TENANT), []);

  // Trộn scope vẫn deny toàn bộ; rỗng vẫn deny; trùng lặp hợp lệ vẫn dedupe.
  assert.deepEqual(effective(['ORCA_ADMIN', 'SELLER_OWNER'], PLATFORM), []);
  assert.deepEqual(effective([], TENANT), []);
  assert.deepEqual(effective(['SELLER_OWNER', 'SELLER_OWNER'], TENANT), ['SELLER_OWNER']);
  assert.equal(policy.resolveActorScope(['ORCA_ADMIN', 'SUPER_ADMIN']), null);
  assert.equal(policy.can(['ORCA_ADMIN', 'SUPER_ADMIN'], 'platform.tenants.manage'), false);
  assert.equal(policy.getDefaultPath(['ORCA_ADMIN', 'SUPER_ADMIN']), '/403');
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
    ['SELLER_STAFF', TENANT, 'catalog.products.manage'],
    ['SELLER_STAFF', TENANT, 'orders.operate'],
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
    assert.equal(
      policy.can(whStaff, capability),
      false,
      `WAREHOUSE_STAFF must not have ${capability}`,
    );
  }
  assert.equal(
    policy.canAny(whStaff, ['finance.view', 'cod.view', 'invoice.view', 'apikey.manage']),
    false,
  );
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
        allow: [
          '/admin/tenants',
          '/dashboard',
          '/orders',
          '/reconciliation',
          '/analytics',
          '/admin/warehouses',
          '/exceptions',
        ],
        deny: [
          '/settings/general',
          '/settings/webhooks',
          '/audit',
          '/asns',
          '/returns',
          '/statements',
        ],
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
          '/admin/warehouses',
          '/exceptions',
        ],
        deny: [
          '/reconciliation',
          '/billing',
          '/iam/users',
          '/settings/general',
          '/admin/tenants',
          '/asns',
          '/returns',
          '/statements',
          '/warehouse/inbound',
        ],
      },
    ],
    [
      'WAREHOUSE_MANAGER',
      PLATFORM,
      {
        allow: [
          '/warehouses',
          '/inventory',
          '/orders',
          '/shipments',
          '/analytics',
          '/warehouse/inbound',
          '/admin/warehouses',
          '/exceptions',
        ],
        deny: [
          '/reconciliation',
          '/rules',
          '/billing',
          '/iam/users',
          '/admin/tenants',
          '/asns',
          '/returns',
          '/statements',
        ],
      },
    ],
    [
      'WAREHOUSE_STAFF',
      PLATFORM,
      {
        allow: ['/warehouses', '/inventory', '/orders', '/warehouse/inbound'],
        deny: [
          '/dashboard',
          '/reconciliation',
          '/billing',
          '/rules',
          '/shipments',
          '/settings/integrations',
          '/settings/general',
          '/admin/tenants',
          '/iam/users',
          '/admin/warehouses',
          '/exceptions',
          '/asns',
          '/returns',
          '/statements',
        ],
      },
    ],
    [
      'ORCA_ACCOUNTANT',
      PLATFORM,
      {
        allow: ['/reconciliation', '/billing', '/orders', '/dashboard', '/analytics'],
        deny: [
          '/rules',
          '/integration-errors',
          '/warehouses',
          '/settings/general',
          '/settings/integrations',
          '/iam/users',
          '/admin/tenants',
          '/admin/warehouses',
          '/exceptions',
          '/asns',
          '/returns',
          '/statements',
          '/warehouse/inbound',
        ],
      },
    ],
    [
      'SELLER_OWNER',
      TENANT,
      {
        allow: [
          '/dashboard',
          '/catalog/skus',
          '/asns',
          '/orders',
          '/returns',
          '/inventory',
          '/warehouses',
          '/shipments',
          '/billing',
          '/statements',
          '/settings/general',
          '/settings/api-keys',
          '/settings/webhooks',
          '/iam/users',
        ],
        deny: [
          '/audit',
          '/integration-errors',
          '/rules',
          '/reconciliation',
          '/admin/tenants',
          '/settings/integrations',
          '/admin/warehouses',
          '/exceptions',
          '/warehouse/inbound',
        ],
      },
    ],
    [
      'SELLER_STAFF',
      TENANT,
      {
        allow: ['/dashboard', '/asns', '/orders', '/inventory', '/shipments', '/analytics'],
        deny: [
          '/catalog/skus',
          '/warehouses',
          '/returns',
          '/statements',
          '/reconciliation',
          '/billing',
          '/rules',
          '/settings/general',
          '/settings/webhooks',
          '/iam/users',
          '/audit',
          '/admin/tenants',
          '/admin/warehouses',
          '/exceptions',
          '/warehouse/inbound',
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
    OPS_DISPATCHER: '/shipments',
    WAREHOUSE_MANAGER: '/warehouse/inbound',
    WAREHOUSE_STAFF: '/warehouse/inbound',
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
      'platform_staff_heading',
      'platform_tenants_heading',
      'network_warehouses_heading',
      'shipping_heading',
      'operations_queue_heading',
      'finance_heading',
      'monitoring_heading',
      'account_heading',
    ],
    OPS_DISPATCHER: [
      'network_warehouses_heading',
      'shipping_heading',
      'operations_queue_heading',
      'monitoring_heading',
      'account_heading',
    ],
    WAREHOUSE_MANAGER: [
      'warehouse_ops_heading',
      'network_warehouses_heading',
      'shipping_heading',
      'operations_queue_heading',
      'monitoring_heading',
      'account_heading',
    ],
    WAREHOUSE_STAFF: ['warehouse_ops_heading', 'account_heading'],
    ORCA_ACCOUNTANT: ['finance_heading', 'monitoring_heading', 'account_heading'],
    SELLER_OWNER: [
      'overview_heading',
      'goods_heading',
      'orders_heading',
      'finance_heading',
      'integrations_heading',
      'workspace_settings_heading',
      'account_heading',
    ],
    SELLER_STAFF: ['overview_heading', 'goods_heading', 'orders_heading', 'account_heading'],
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
  assert.equal(
    policy.getVisibleNavGroups(admin, false).some((group) => group.key === 'ui_heading'),
    false,
  );
  assert.equal(
    policy.getVisibleNavGroups(admin, true).some((group) => group.key === 'ui_heading'),
    true,
  );
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

test('PROPOSED capabilities never grant routes or actions', () => {
  const admin = effective(ADMIN, PLATFORM);
  const owner = effective(OWNER, TENANT);

  assert.equal(policy.can(admin, 'finance.view'), false);
  assert.equal(policy.can(admin, 'carriers.credentials.manage'), false);
  assert.equal(policy.can(owner, 'carriers.credentials.manage'), false);
  assert.equal(policy.isRouteAllowed(owner, '/settings/integrations'), false);
  assert.equal(policy.isRouteAllowed(admin, '/admin/tenants'), true);
});

test('seller API key settings use approved ORCA action while reservation controls remain closed', () => {
  const owner = effective(OWNER, TENANT);
  const sellerStaff = effective(['SELLER_STAFF'], TENANT);
  const platformAdmin = effective(ADMIN, PLATFORM);

  assert.equal(policy.can(owner, 'apikey.manage'), true);
  assert.equal(policy.isRouteAllowed(owner, '/settings/api-keys'), true);
  assert.equal(hrefs(OWNER, TENANT).includes('/settings/api-keys'), true);
  assert.equal(policy.isRouteAllowed(sellerStaff, '/settings/api-keys'), false);
  assert.equal(policy.isRouteAllowed(platformAdmin, '/settings/api-keys'), false);

  for (const roles of [owner, sellerStaff, platformAdmin]) {
    assert.equal(policy.can(roles, 'inventory.reservations.view'), false);
    assert.equal(policy.can(roles, 'inventory.reservations.release'), false);
  }
});

test('post-login redirect honors ORCA scope, route matrix and open-redirect guard', () => {
  assert.equal(getPostLoginPath(user(OWNER, TENANT), null), '/dashboard');
  assert.equal(getPostLoginPath(user(OPS, PLATFORM), null), '/shipments');
  assert.equal(getPostLoginPath(user(ADMIN, PLATFORM), null), '/admin/tenants');
  assert.equal(getPostLoginPath(user(WH_STAFF, PLATFORM), null), '/warehouse/inbound');

  assert.equal(
    getPostLoginPath(user(OWNER, TENANT), { from: '/orders?page=2#items' }),
    '/orders?page=2#items',
  );
  assert.equal(getPostLoginPath(user(OPS, PLATFORM), { from: '/reconciliation' }), '/shipments');
  assert.equal(getPostLoginPath(user(OWNER, TENANT), { from: '/admin/tenants' }), '/dashboard');

  for (const from of ['//evil.test', 'https://evil.test', '/\\evil.test', '/login']) {
    assert.equal(getPostLoginPath(user(OWNER, TENANT), { from }), '/dashboard');
  }

  assert.equal(getPostLoginPath(user(['TENANT_ADMIN'], null), null), '/403');
  // Trộn role hợp lệ với code legacy/khác scope ⇒ deny ⇒ `/403`, không nâng quyền.
  assert.equal(getPostLoginPath(user(['SELLER_OWNER', 'TENANT_ADMIN'], TENANT), null), '/403');
  assert.equal(getPostLoginPath(user(['ORCA_ADMIN', 'SELLER_OWNER'], PLATFORM), null), '/403');
});

test('legacy roles/permissions page and legacy access policy are completely removed', () => {
  const legacyPolicyPath = join(REPO_ROOT, 'src/lib/legacyAccessPolicy.ts');
  const rolesPermissionsPagePath = join(REPO_ROOT, 'src/pages/workspace/RolesPermissionsPage.tsx');

  assert.equal(existsSync(legacyPolicyPath), false, 'legacyAccessPolicy.ts must be deleted');
  assert.equal(
    existsSync(rolesPermissionsPagePath),
    false,
    'RolesPermissionsPage.tsx must be deleted',
  );

  const importers = filesImporting('legacyAccessPolicy');
  assert.deepEqual(importers, [], 'no source file should import legacyAccessPolicy');

  // Không page/component nào gọi API gán role legacy; chỉ còn định nghĩa trong feature.
  for (const file of filesContaining('updateRoles')) {
    assert.ok(
      file.startsWith('src/features/tenants/'),
      `${file} must not call the legacy role update API`,
    );
  }
});

test('a direct URL outside permission routes to /403 without touching the session', () => {
  const guard = readFileSync(join(REPO_ROOT, 'src/components/layout/ProtectedRoute.tsx'), 'utf8');
  assert.match(guard, /Navigate[\s\S]*to="\/403"/, 'denied access must render /403');
  assert.match(guard, /to="\/login"/, 'anonymous access must go to /login');
  assert.equal(
    /useAuthStore\.getState\(\)\.clear|\.clear\(\)/.test(guard),
    false,
    'the route guard must never clear the session',
  );

  // Tầng policy: route ngoài quyền bị deny nhưng tập role hiệu lực không đổi.
  const seller = effective(OWNER, TENANT);
  assert.equal(policy.isRouteAllowed(seller, '/admin/tenants'), false);
  assert.deepEqual(effective(OWNER, TENANT), ['SELLER_OWNER']);
  assert.equal(policy.isRouteAllowed(seller, '/settings/profile'), true);
});

test('role display shows every effective ORCA role and never a legacy label', () => {
  const files = {
    Topbar: 'src/components/layout/Topbar.tsx',
    ProfileSettings: 'src/features/settings/components/ProfileSettings.tsx',
  };
  const orcaRoleCodes = [
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'ORCA_ACCOUNTANT',
    'SELLER_OWNER',
    'SELLER_STAFF',
  ];
  for (const [name, path] of Object.entries(files)) {
    const source = readFileSync(join(REPO_ROOT, path), 'utf8');
    assert.equal(source.includes('roles[0]'), false, `${name} must not render roles[0]`);
    assert.ok(source.includes('useAccess'), `${name} must read effective roles from policy`);
    for (const role of orcaRoleCodes) {
      assert.ok(source.includes(role), `${name} must handle ORCA role ${role}`);
    }
    for (const legacy of ['SUPER_ADMIN', 'TENANT_ADMIN', 'DISPATCHER', 'ACCOUNTANT']) {
      assert.equal(
        new RegExp(`\\b${legacy}\\b`).test(source),
        false,
        `${name} must not label legacy role ${legacy}`,
      );
    }
  }

  // Multi-role: hiển thị dùng union hiệu lực trong cùng scope, không lấy phần tử đầu.
  const multi = effective(['SELLER_OWNER', 'SELLER_STAFF'], TENANT);
  assert.deepEqual(multi, ['SELLER_OWNER', 'SELLER_STAFF']);
});

test('SS-976: login and portal selection agree for all seven roles', () => {
  const destinations = {
    ORCA_ADMIN: ['/admin/tenants', 'operations'],
    OPS_DISPATCHER: ['/shipments', 'operations'],
    WAREHOUSE_MANAGER: ['/warehouse/inbound', 'warehouse'],
    WAREHOUSE_STAFF: ['/warehouse/inbound', 'warehouse'],
    ORCA_ACCOUNTANT: ['/reconciliation', 'operations'],
    SELLER_OWNER: ['/dashboard', 'seller'],
    SELLER_STAFF: ['/dashboard', 'seller'],
  };
  for (const [role, scope] of ALL_ROLES) {
    const [path, portal] = destinations[role];
    assert.equal(getPostLoginPath(user([role], scope), null), path);
    assert.equal(policy.getPortal([role], path), portal);
    assert.equal(policy.isRouteAllowed([role], path), true);
  }
  assert.equal(policy.getPortal(['ORCA_ADMIN', 'SELLER_OWNER'], '/admin/tenants'), null);
  assert.equal(policy.getPortal(['SUPER_ADMIN'], '/admin/tenants'), null);
  assert.equal(policy.getPortal(['OPS_DISPATCHER'], '/warehouse/inbound'), null);
});

test('SS-972: Seller Staff only reads orders and stock and prepares ASNs', () => {
  const roles = effective(SELLER_STAFF, TENANT);
  for (const capability of ['catalog.products.manage', 'orders.operate']) {
    assert.equal(policy.can(roles, capability), false, capability);
  }
  for (const path of ['/catalog/skus', '/warehouses', '/billing', '/iam/users']) {
    assert.equal(policy.isRouteAllowed(roles, path), false, path);
    assert.equal(hrefs(SELLER_STAFF, TENANT).includes(path), false, path);
  }
  for (const path of ['/asns', '/orders', '/inventory']) {
    assert.equal(policy.isRouteAllowed(roles, path), true, path);
  }
  assert.equal(policy.can(effective(OWNER, TENANT), 'catalog.products.manage'), true);
});

test('SS-972: business evidence does not grant technical logs or routing rules', () => {
  for (const [role, scope] of [
    ['SELLER_OWNER', TENANT],
    ['ORCA_ACCOUNTANT', PLATFORM],
  ]) {
    const roles = effective([role], scope);
    for (const path of ['/audit', '/integration-errors', '/rules']) {
      assert.equal(policy.isRouteAllowed(roles, path), false, `${role}: ${path}`);
      assert.equal(hrefs([role], scope).includes(path), false, `${role}: ${path}`);
    }
  }
  assert.equal(policy.isRouteAllowed(effective(OPS, PLATFORM), '/integration-errors'), true);
});
