import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, api, store, policy;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const row = {
  id,
  contractId: id,
  invoiceNo: 'SUB-2026-11-SYNTHETIC',
  documentType: 'PLAN',
  invoiceKind: 'SUBSCRIPTION',
  documentStatus: 'ISSUED',
  periodKey: '2026-11',
  issuedAt: '2026-10-31T17:00:00Z',
  dueOn: '2026-11-08',
  totalVnd: '9007199254740993',
  paidVnd: '0',
  outstandingVnd: '9007199254740993',
  paymentStatus: 'UNPAID',
  paymentRequired: true,
};
const ok = (data, pagination) =>
  Response.json({
    success: true,
    data,
    meta: {
      timestamp: '2026-11-01T00:00:00Z',
      path: '',
      requestId: 'synthetic',
      ...(pagination ? { pagination } : {}),
    },
  });
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ invoiceApi: api } = await server.ssrLoadModule('/src/features/tenants/api/invoiceApi.ts'));
  ({ useAuthStore: store } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
beforeEach(() => {
  store.getState().clear();
  store
    .getState()
    .setSession({
      accessToken: 'synthetic-token',
      expiresIn: 3600,
      user: {
        userId: id,
        tenantId: id,
        actorScope: 'TENANT',
        roles: ['SELLER_OWNER'],
        permissions: [],
        email: 'synthetic@example.test',
        fullName: 'Synthetic Owner',
      },
    });
});
test('reads cursor metadata and preserves money beyond the JS integer range', async () => {
  globalThis.fetch = async (url) => {
    assert.ok(String(url).includes('/v1/billing/invoices'));
    assert.ok(!String(url).includes('tenantId'));
    return ok([row], { limit: 20, hasNext: false, nextCursor: null });
  };
  const result = await api.list({ limit: 20 });
  assert.equal(result.items[0].totalVnd, '9007199254740993');
  assert.equal(result.pagination.nextCursor, null);
});
test('rejects numeric money and absent pagination rather than presenting a false invoice', async () => {
  globalThis.fetch = async () =>
    ok([{ ...row, totalVnd: 7000000 }], { limit: 20, hasNext: false, nextCursor: null });
  await assert.rejects(api.list({}));
  globalThis.fetch = async () => ok([row]);
  await assert.rejects(api.list({}));
});
test('keeps operating-ledger statements distinct from subscription payment obligations', async () => {
  globalThis.fetch = async () =>
    ok({
      ...row,
      documentType: 'SERVICE',
      invoiceKind: 'SERVICE',
      paymentStatus: 'LEDGER',
      paymentRequired: false,
      outstandingVnd: '0',
    });
  const result = await api.detail(id);
  assert.equal(result.paymentStatus, 'LEDGER');
  assert.equal(result.paymentRequired, false);
});
test('payment action only reads verified-transfer instructions and never posts a receipt', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, 'GET');
    assert.ok(String(url).endsWith(`/invoices/${id}/payment-instructions`));
    return ok({
      invoiceId: id,
      reference: row.invoiceNo,
      amountVnd: row.totalVnd,
      dueOn: row.dueOn,
      method: 'VERIFIED_BANK_TRANSFER',
      verificationRequired: true,
    });
  };
  assert.equal((await api.payment(id)).verificationRequired, true);
});
test('Accountant closure sends only the selected month and seller resource', async () => {
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).includes(`/tenants/${id}/periods/close`));
    assert.deepEqual(JSON.parse(options.body), { month: '2026-10' });
    return ok({ invoiceIds: [id] });
  };
  assert.deepEqual(await api.close(id, '2026-10'), { invoiceIds: [id] });
});
test('only Accountant has period closure across all seven roles and mixed identities deny', () => {
  for (const role of [
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'ORCA_ACCOUNTANT',
    'SELLER_OWNER',
    'SELLER_STAFF',
  ]) {
    const roles = policy.getEffectiveRoles(
      [role],
      role.startsWith('SELLER') ? 'TENANT' : 'PLATFORM',
    );
    assert.equal(policy.can(roles, 'invoice.period.close'), role === 'ORCA_ACCOUNTANT', role);
  }
  assert.equal(
    policy.can(
      policy.getEffectiveRoles(['ORCA_ACCOUNTANT', 'SELLER_OWNER'], 'PLATFORM'),
      'invoice.period.close',
    ),
    false,
  );
});
test('PDF export validates the response rather than downloading an error page', async () => {
  globalThis.fetch = async () =>
    new Response('%PDF-1.4\nsynthetic copy', { headers: { 'content-type': 'application/pdf' } });
  assert.ok((await api.pdf(id)).size > 5);
  globalThis.fetch = async () =>
    new Response('<html>proxy error</html>', { headers: { 'content-type': 'text/html' } });
  await assert.rejects(api.pdf(id));
});
