import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server, policy, sepayMatchSchema;

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, watch: null, ws: false },
  });
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  ({ sepayMatchSchema } = await server.ssrLoadModule(
    '/src/features/reconciliation/schemas/sepayMatchSchema.ts',
  ));
});
after(async () => {
  await server?.close();
});

test('UC-127 manual SePay matching is visible only to the ORCA Accountant', () => {
  assert.equal(policy.can(['ORCA_ACCOUNTANT'], 'invoice.bankReceipt.post'), true);
  for (const role of [
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'SELLER_OWNER',
    'SELLER_STAFF',
    'ACCOUNTANT',
  ])
    assert.equal(policy.can([role], 'invoice.bankReceipt.post'), false, role);
  assert.equal(
    policy.can(['ORCA_ACCOUNTANT', 'SELLER_OWNER'], 'invoice.bankReceipt.post'),
    false,
    'mixed scope must not grant',
  );
});

test('invoice number for manual matching mirrors the API contract', () => {
  assert.equal(sepayMatchSchema.parse({ invoiceNo: '  ONB-1a2b-3c  ' }).invoiceNo, 'ONB-1a2b-3c');
  for (const invoiceNo of ['', 'AB', 'ONB 123', 'ONB-<script>', 'x'.repeat(65)])
    assert.equal(sepayMatchSchema.safeParse({ invoiceNo }).success, false, invoiceNo);
});

test('carrier settlement upload and lock are Accountant-only actions', () => {
  assert.equal(policy.can(['ORCA_ACCOUNTANT'], 'reconciliation.operate'), true);
  for (const role of ['ORCA_ADMIN', 'OPS_DISPATCHER', 'WAREHOUSE_MANAGER', 'SELLER_OWNER'])
    assert.equal(policy.can([role], 'reconciliation.operate'), false, role);
});
