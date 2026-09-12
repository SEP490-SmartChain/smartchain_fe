import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let policy;
let getPostLoginPath;

const SA = ['SUPER_ADMIN'];
const TA = ['TENANT_ADMIN'];
const DISPATCHER = ['DISPATCHER'];
const ACCOUNTANT = ['ACCOUNTANT'];

function user(roles, tenantId = 'tenant-1') {
  return {
    userId: 'user-1',
    tenantId,
    email: 'user@example.test',
    fullName: 'Test User',
    roles,
    permissions: [],
  };
}

function groupKeys(roles) {
  return policy.getVisibleNavGroups(roles, false).map((group) => group.key);
}

function hrefs(roles) {
  return policy.getSearchLinks(roles, false).map((link) => link.href);
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

test('effective roles keep SUPER_ADMIN separate from workspace roles', () => {
  assert.deepEqual(policy.getEffectiveRoles(['SUPER_ADMIN', 'TENANT_ADMIN']), SA);
  assert.deepEqual(policy.getEffectiveRoles(['DISPATCHER', 'ACCOUNTANT']), [
    'DISPATCHER',
    'ACCOUNTANT',
  ]);
  assert.deepEqual(policy.getEffectiveRoles(['UNKNOWN_ROLE']), []);
});

test('capabilities are the union of a user workspace roles', () => {
  assert.equal(policy.can(TA, 'orders.view'), true);
  assert.equal(policy.can(DISPATCHER, 'orders.operate'), true);
  assert.equal(policy.can(DISPATCHER, 'reconciliation.operate'), false);
  assert.equal(policy.can(['DISPATCHER', 'ACCOUNTANT'], 'reconciliation.operate'), true);
  assert.equal(policy.can(['DISPATCHER', 'ACCOUNTANT'], 'orders.operate'), true);
  // SUPER_ADMIN does not inherit workspace capabilities.
  assert.equal(policy.can(SA, 'orders.view'), false);
  assert.equal(policy.can(SA, 'platform.tenants.manage'), true);
});

test('action visibility follows the section 7 action matrix', () => {
  // Kho / SKU / tồn kho
  assert.equal(policy.can(TA, 'warehouses.manage'), true);
  assert.equal(policy.can(DISPATCHER, 'warehouses.manage'), false);
  assert.equal(policy.can(DISPATCHER, 'warehouses.view'), true);
  assert.equal(policy.can(ACCOUNTANT, 'warehouses.view'), false);
  // Routing rules
  assert.equal(policy.can(TA, 'rules.create_delete'), true);
  assert.equal(policy.can(DISPATCHER, 'rules.create_delete'), false);
  assert.equal(policy.can(DISPATCHER, 'rules.operate'), true);
  assert.equal(policy.can(TA, 'rules.operate'), false);
  // Orders / shipments
  assert.equal(policy.can(DISPATCHER, 'orders.operate'), true);
  assert.equal(policy.can(TA, 'orders.operate'), false);
  assert.equal(policy.can(DISPATCHER, 'shipments.operate'), true);
  // Reconciliation
  assert.equal(policy.can(ACCOUNTANT, 'reconciliation.operate'), true);
  assert.equal(policy.can(TA, 'reconciliation.operate'), false);
  assert.equal(policy.can(TA, 'reconciliation.view'), true);
  assert.equal(policy.can(DISPATCHER, 'reconciliation.view'), false);
  // Platform admin (Super Admin only)
  assert.equal(policy.can(SA, 'platform.tenants.manage'), true);
  assert.equal(policy.can(TA, 'platform.tenants.manage'), false);
  // Audit split
  assert.equal(policy.can(TA, 'audit.tenant.view'), true);
  assert.equal(policy.can(SA, 'audit.platform.view'), true);
  assert.equal(policy.can(DISPATCHER, 'audit.tenant.view'), false);
});

test('route policy normalizes a trailing slash', () => {
  assert.equal(policy.isRouteAllowed(TA, '/dashboard/'), true);
  assert.equal(policy.isRouteAllowed(TA, '/billing/'), true);
  assert.equal(policy.isRouteAllowed(TA, '/settings/profile/'), true);
  assert.equal(policy.isRouteAllowed(DISPATCHER, '/orders/'), true);
  assert.equal(policy.isRouteAllowed(DISPATCHER, '/reconciliation/'), false);
  assert.equal(getPostLoginPath(user(TA), { from: '/orders/' }), '/orders/');
});

test('route matrix authorizes each role per section 6', () => {
  assert.equal(policy.isRouteAllowed(SA, '/admin/tenants'), true);
  assert.equal(policy.isRouteAllowed(SA, '/dashboard'), false);
  assert.equal(policy.isRouteAllowed(TA, '/dashboard'), true);
  assert.equal(policy.isRouteAllowed(TA, '/reconciliation'), true);
  assert.equal(policy.isRouteAllowed(TA, '/billing'), true);
  assert.equal(policy.isRouteAllowed(DISPATCHER, '/reconciliation'), false);
  assert.equal(policy.isRouteAllowed(ACCOUNTANT, '/reconciliation'), true);
  assert.equal(policy.isRouteAllowed(ACCOUNTANT, '/orders'), false);
  assert.equal(policy.isRouteAllowed(TA, '/roles-permissions/roles'), true);
  assert.equal(policy.isRouteAllowed(DISPATCHER, '/roles-permissions/roles'), false);
  // Profile is shared by all four roles.
  for (const roles of [SA, TA, DISPATCHER, ACCOUNTANT]) {
    assert.equal(policy.isRouteAllowed(roles, '/settings/profile'), true);
    assert.equal(policy.isRouteAllowed(roles, '/settings/general'), roles.includes('TENANT_ADMIN'));
  }
});

test('default path points each role to its home route', () => {
  assert.equal(policy.getDefaultPath(SA), '/admin/tenants');
  assert.equal(policy.getDefaultPath(TA), '/dashboard');
  assert.equal(policy.getDefaultPath(DISPATCHER), '/dashboard');
  assert.equal(policy.getDefaultPath(ACCOUNTANT), '/dashboard');
});

test('sidebar shows the correct groups per role', () => {
  assert.deepEqual(groupKeys(SA), ['platform_heading', 'monitoring_heading', 'account_heading']);

  assert.deepEqual(groupKeys(TA), [
    'workspace_heading',
    'operations_heading',
    'finance_heading',
    'reports_heading',
    'integrations_heading',
    'manage_accounts_heading',
    'workspace_settings_heading',
    'monitoring_heading',
    'account_heading',
  ]);

  assert.deepEqual(groupKeys(DISPATCHER), [
    'workspace_heading',
    'operations_heading',
    'reports_heading',
    'monitoring_heading',
    'account_heading',
  ]);

  assert.deepEqual(groupKeys(ACCOUNTANT), [
    'workspace_heading',
    'finance_heading',
    'reports_heading',
    'account_heading',
  ]);
});

test('SUPER_ADMIN never receives workspace menu items', () => {
  const links = hrefs(SA);
  assert.equal(links.includes('/dashboard'), false);
  assert.equal(links.includes('/orders'), false);
  assert.equal(links.includes('/settings/profile'), true);
  assert.equal(links.includes('/admin/tenants'), true);
  assert.equal(links.includes('/admin/plans'), true);
});

test('global search never exposes unauthorized routes', () => {
  const dispatcherLinks = hrefs(DISPATCHER);
  assert.equal(dispatcherLinks.includes('/orders'), true);
  assert.equal(dispatcherLinks.includes('/reconciliation'), false);
  assert.equal(dispatcherLinks.includes('/iam/users'), false);
  assert.equal(dispatcherLinks.includes('/admin/tenants'), false);

  const accountantLinks = hrefs(ACCOUNTANT);
  assert.equal(accountantLinks.includes('/reconciliation'), true);
  assert.equal(accountantLinks.includes('/orders'), false);
  assert.equal(accountantLinks.includes('/integration-errors'), false);
});

test('component catalog is dev-only', () => {
  assert.equal(
    policy.getVisibleNavGroups(TA, true).some((group) => group.key === 'ui_heading'),
    true,
  );
  assert.equal(
    policy.getVisibleNavGroups(TA, false).some((group) => group.key === 'ui_heading'),
    false,
  );
});

test('post-login redirect honors the route matrix for every role', () => {
  assert.equal(getPostLoginPath(user(SA, null), null), '/admin/tenants');
  assert.equal(getPostLoginPath(user(DISPATCHER), null), '/dashboard');
  assert.equal(getPostLoginPath(user(ACCOUNTANT), null), '/dashboard');
  assert.equal(getPostLoginPath(user(TA), { from: '/reconciliation' }), '/reconciliation');
  // Dispatcher cannot be redirected into a route they may not access.
  assert.equal(getPostLoginPath(user(DISPATCHER), { from: '/reconciliation' }), '/dashboard');
  // Accountant cannot be redirected into the admin console.
  assert.equal(getPostLoginPath(user(ACCOUNTANT), { from: '/admin/tenants' }), '/dashboard');
  // Internal destinations that are allowed are preserved with their query string.
  assert.equal(getPostLoginPath(user(DISPATCHER), { from: '/orders?page=2#items' }), '/orders?page=2#items');
});
