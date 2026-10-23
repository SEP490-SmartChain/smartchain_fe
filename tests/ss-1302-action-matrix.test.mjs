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
  M = ['WAREHOUSE_MANAGER'],
  S = ['WAREHOUSE_STAFF'];
const AO = ['ORCA_ADMIN', 'OPS_DISPATCHER'];
const finance = ['ORCA_ADMIN', 'ORCA_ACCOUNTANT', 'SELLER_OWNER'];
const reporting = [
  'ORCA_ADMIN',
  'OPS_DISPATCHER',
  'WAREHOUSE_MANAGER',
  'ORCA_ACCOUNTANT',
  'SELLER_OWNER',
  'SELLER_STAFF',
];
// Independently reviewed UI action expectations; proposed actions remain denied.
const expected = {
  'tariffs.manage': ['ORCA_ADMIN', 'ORCA_ACCOUNTANT'],
  'iam.warehouses.assign': A,
  'workspace.dashboard.view': reporting,
  'workspace.settings.manage': O,
  'workspace.billing.view': finance,
  'iam.users.manage': ['ORCA_ADMIN', 'SELLER_OWNER'],
  'iam.roles.assign': ['ORCA_ADMIN', 'SELLER_OWNER'],
  'carriers.credentials.manage': A,
  'warehouses.view': [
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'SELLER_OWNER',
  ],
  'warehouses.manage': A,
  'warehouses.update': M,
  'warehouses.layout.view': ['ORCA_ADMIN', 'WAREHOUSE_MANAGER'],
  'warehouses.layout.manage': M,
  'warehouses.downtime.view': ['ORCA_ADMIN', 'WAREHOUSE_MANAGER', 'OPS_DISPATCHER'],
  'warehouses.downtime.manage': M,
  'catalog.products.view': O,
  'catalog.products.manage': O,
  'inventory.view': roles,
  // GET /v1/inventory/stocks and /summary are tenant-only at the backend controller.
  'inventory.stocks.view': ['SELLER_OWNER', 'SELLER_STAFF'],
  'inventory.expiry.view': ['SELLER_OWNER', 'WAREHOUSE_MANAGER'],
  'inventory.notifications.manage': O,
  'inventory.positions.view': ['SELLER_OWNER', 'SELLER_STAFF', 'WAREHOUSE_MANAGER'],
  'inventory.ledger.view': ['SELLER_OWNER', 'OPS_DISPATCHER', 'WAREHOUSE_MANAGER'],
  'inventory.reservations.view': [],
  'inventory.reservations.release': [],
  'rules.view': AO,
  'routing.rule.set': AO,
  'rules.create_delete': A,
  'rules.operate': ['OPS_DISPATCHER'],
  'rules.simulate.allocation': ['OPS_DISPATCHER'],
  'rules.simulate.carrier': AO,
  'orders.view': roles,
  'orders.cancellation.manage': O,
  'warehouse.packing.confirm': S,
  'warehouse.handover.create': ['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'],
  'warehouse.handover.confirm': S,
  'warehouse.putback.confirm': S,
  // UC-66/67 intake does not grant Staff writes or platform intake.
  'orders.seller.read': ['SELLER_OWNER', 'SELLER_STAFF'],
  'orders.create': O,
  'orders.withdrawal.create': O,
  'orders.operate': ['OPS_DISPATCHER', 'WAREHOUSE_MANAGER', 'SELLER_OWNER'],
  'shipments.view': [
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'WAREHOUSE_MANAGER',
    'SELLER_OWNER',
    'SELLER_STAFF',
  ],
  'shipments.operate': ['OPS_DISPATCHER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'],
  'shipments.label.download': ['ORCA_ADMIN', 'OPS_DISPATCHER'],
  'reconciliation.view': ['ORCA_ADMIN', 'ORCA_ACCOUNTANT'],
  'reconciliation.operate': ['ORCA_ACCOUNTANT'],
  'analytics.operations.view': reporting,
  'analytics.finance.view': finance,
  'integration.errors.view': AO,
  'audit.tenant.view': [],
  'audit.platform.view': A,
  'platform.tenants.manage': A,
  'platform.carriers.manage': A,
  'platform.plans.manage': A,
  'platform.observability.view': A,
  'finance.view': [],
  'cod.view': ['ORCA_ACCOUNTANT', 'SELLER_OWNER'],
  'invoice.view': finance,
  'invoice.bankReceipt.post': ['ORCA_ACCOUNTANT'],
  // SS-1022 / UC-123: closing a seller period is an Accountant action.
  'invoice.period.close': ['ORCA_ACCOUNTANT'],
  'apikey.manage': O,
  'contract.sign': O,
  'asns.view': ['SELLER_OWNER', 'SELLER_STAFF'],
  'returns.view': O,
  'statements.view': O,
  // SS-1012 / UC-131–134: Owner reviews; Accountant posts evidenced payout.
  'statement.review': O,
  'payout.manage': ['ORCA_ACCOUNTANT'],
  'warehouse.operations.view': ['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'],
  'warehouse.asn.checkIn': S,
  'warehouse.asn.recordCount': S,
  'warehouse.asn.uploadPhoto': S,
  'warehouse.asn.packagingAssist': S,
  'warehouse.asn.inspect': S,
  'warehouse.asn.reportDiscrepancy': S,
  'warehouse.asn.review': M,
  'warehouse.asn.postStock': S,
  'warehouse.putaway.assign': ['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'],
  'warehouse.putaway.confirm': S,
  'warehouse.picking.manage': M,
  'warehouse.picking.confirm': S,
  'warehouse.putaway.overrideBin': M,
  'warehouse.putaway.relocate': ['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'],
  'platform.warehouses.view': ['ORCA_ADMIN', 'OPS_DISPATCHER', 'WAREHOUSE_MANAGER'],
  'exceptions.view': ['ORCA_ADMIN', 'OPS_DISPATCHER', 'WAREHOUSE_MANAGER'],
};
let server, policy;
before(async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  server = await createServer({
    configFile: false,
    envFile: false,
    root,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
});
after(async () => {
  await server?.close();
});

test('SS-1302: every UI capability has an independent audit expectation', () => {
  assert.deepEqual(
    policy.CAPABILITIES.map((entry) => entry.code).sort(),
    Object.keys(expected).sort(),
  );
});
for (const [capability, allowed] of Object.entries(expected)) {
  test(`SS-1302: seven-role action matrix ${capability}`, () => {
    for (const role of roles)
      assert.equal(
        policy.can([role], capability),
        allowed.includes(role),
        `${role}: ${capability}`,
      );
    for (const invalid of [
      [],
      ['SUPER_ADMIN'],
      ['SELLER_OWNER', 'ORCA_ADMIN'],
      ['WAREHOUSE_STAFF', 'UNKNOWN'],
    ]) {
      assert.equal(policy.can(invalid, capability), false);
    }
  });
}
test('SS-1302: unknown exports and print capabilities never acquire a screen grant', () => {
  for (const role of roles)
    for (const capability of [
      'orders.export',
      'inventory.export',
      'finance.export',
      'invoice.print',
    ]) {
      assert.equal(policy.can([role], capability), false);
    }
});
