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
const headers = ['ID', 'Name', 'Slug', 'Email', 'Plan', 'Status', 'Used', 'Total', 'Created'];
const row = {
  id: '13020001-0000-4000-8000-000000000001',
  name: 'Synthetic seller',
  slug: 'synthetic',
  adminEmail: 'synthetic@example.test',
  status: 'ACTIVE',
  subscription: { planCode: 'BASIC' },
  quota: { ordersUsed: 2, ordersTotal: 500 },
  createdAt: '2026-10-14T00:00:00Z',
  apiSecret: 'private-marker',
  recipientPhone: 'private-marker',
  bankAccount: 'private-marker',
};
let server, exportCsv;
const actor = (role) => ({
  userId: row.id,
  tenantId: role.startsWith('SELLER') ? row.id : null,
  actorScope: role.startsWith('SELLER') ? 'TENANT' : 'PLATFORM',
  roles: [role],
});
before(async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  server = await createServer({
    configFile: false,
    envFile: false,
    root,
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': `${root}/src` } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ tenantCsvExport: exportCsv } = await server.ssrLoadModule(
    '/src/features/tenants/lib/tenantCsvExport.ts',
  ));
});
after(async () => {
  await server?.close();
});
for (const role of roles) {
  test(`SS-1302: seller directory CSV is Admin-only for ${role}`, () => {
    if (role === 'ORCA_ADMIN')
      assert.ok(exportCsv([row], actor(role), headers).includes('Synthetic seller'));
    else assert.throws(() => exportCsv([row], actor(role), headers), /AUTH.FORBIDDEN/);
  });
}
for (const roles of [
  [],
  ['SUPER_ADMIN'],
  ['ORCA_ADMIN', 'SELLER_OWNER'],
  ['ORCA_ADMIN', 'UNKNOWN'],
]) {
  test(`SS-1302: CSV rejects invalid authority ${roles.join('+') || 'empty'}`, () => {
    assert.throws(
      () => exportCsv([row], { ...actor('ORCA_ADMIN'), roles }, headers),
      /AUTH.FORBIDDEN/,
    );
  });
}
test('SS-1302: revoked export is denied before reading cached row fields', () => {
  const unreadable = new Proxy(row, {
    get() {
      throw new Error('PRIVATE_DATA_READ');
    },
  });
  assert.throws(() => exportCsv([unreadable], actor('SELLER_STAFF'), headers), /AUTH.FORBIDDEN/);
});
for (const value of [
  '=HYPERLINK("https://example.test")',
  '+SUM(1,2)',
  '-1+1',
  '@SUM(1,2)',
  ' \t=1+1',
  '\t=1+1',
  '\r=1+1',
  '\n=1+1',
]) {
  test(`SS-1302: CSV neutralizes untrusted formula ${JSON.stringify(value)}`, () => {
    const csv = exportCsv(
      [{ ...row, name: value, slug: value, adminEmail: value, subscription: { planCode: value } }],
      actor('ORCA_ADMIN'),
      headers,
    );
    assert.equal(csv.split(`"'${value.replaceAll('"', '""')}"`).length - 1, 4);
  });
}
test('SS-1302: CSV escapes every column and preserves only the nine allowlisted fields', () => {
  const csv = exportCsv(
    [{ ...row, name: 'Seller, "A"', slug: 'slug,with,comma' }],
    actor('ORCA_ADMIN'),
    headers,
  );
  assert.ok(csv.startsWith('\uFEFF"ID","Name"'));
  assert.ok(csv.includes('"Seller, ""A"""'));
  assert.ok(csv.includes('"slug,with,comma"'));
  assert.ok(csv.endsWith('"2026-10-14"'));
  assert.equal(csv.includes('private-marker'), false);
  assert.equal(csv.split('\r\n').length, 2);
});
