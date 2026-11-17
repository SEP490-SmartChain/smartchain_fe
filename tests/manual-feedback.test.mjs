import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { NextIntlClientProvider } from 'next-intl';
import { createServer } from 'vite';

let server, products, notices, auth, api, Evidence, Breadcrumbs;
const originalFetch = globalThis.fetch;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = {
  userId: id(1),
  tenantId: null,
  actorScope: 'PLATFORM',
  roles: ['WAREHOUSE_MANAGER'],
  permissions: [],
  warehouseIds: [id(2)],
  email: 'manager@example.test',
  fullName: 'Manager',
};
const config = {
  trackLot: true,
  trackExpiry: true,
  manufactureRequired: false,
  shelfLifeDays: null,
  minInboundShelfLifePct: 50,
  minOutboundDays: 30,
  nearExpiryDays: 30,
};
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    esbuild: { jsx: 'automatic' },
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  products = await server.ssrLoadModule('/src/features/catalog/schemas/productSchema.ts');
  notices = await server.ssrLoadModule('/src/lib/warehouseAssignmentNotices.ts');
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  ({ apiClient: api } = await server.ssrLoadModule('/src/services/apiClient.ts'));
  ({ ReceiptReviewEvidence: Evidence } = await server.ssrLoadModule(
    '/src/features/inbound/components/ReceiptReviewEvidence.tsx',
  ));
  ({ default: Breadcrumbs } = await server.ssrLoadModule(
    '/src/components/layout/RouteBreadcrumbs.tsx',
  ));
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

test('optional shelf life remains null on reset, clearing and whitespace; zero is still invalid', () => {
  for (const value of [null, undefined, '', '  ']) {
    const shelfLifeDays = products.parseOptionalShelfLifeDays(value);
    assert.equal(shelfLifeDays, null);
    assert.equal(
      products.productConfigurationSchema.safeParse({ ...config, shelfLifeDays }).success,
      true,
    );
  }
  for (const value of [0, -1, 'bad', '1.5', '36501']) {
    assert.equal(
      products.productConfigurationSchema.safeParse({
        ...config,
        shelfLifeDays: products.parseOptionalShelfLifeDays(value),
      }).success,
      false,
      String(value),
    );
  }
  assert.equal(products.parseOptionalShelfLifeDays('180'), 180);
});

test('assignment notices retain read acknowledgements, identify added grants and clear revoked grants', () => {
  const initial = notices.reconcileAssignmentNotices([id(2)], null);
  assert.deepEqual(initial.readIds, []);
  const read = { ...initial, readIds: [id(2)] };
  assert.deepEqual(notices.reconcileAssignmentNotices([id(2), id(3)], read).readIds, [id(2)]);
  const removed = notices.reconcileAssignmentNotices([], read);
  assert.deepEqual(notices.reconcileAssignmentNotices([id(2)], removed).readIds, []);
  assert.deepEqual(notices.reconcileAssignmentNotices([id(2)], { readIds: [id(2)] }).readIds, []);
});

test('assignment notices fail closed for other scopes, legacy roles and unrelated platform roles', () => {
  for (const role of ['WAREHOUSE_STAFF', 'WAREHOUSE_MANAGER', 'OPS_DISPATCHER']) {
    assert.deepEqual(notices.assignedWarehouseIds({ ...user, roles: [role] }), [id(2)]);
  }
  for (const roles of [
    ['ORCA_ADMIN'],
    ['ORCA_ACCOUNTANT'],
    ['SELLER_OWNER'],
    ['SELLER_STAFF'],
    ['TENANT_ADMIN'],
    ['WAREHOUSE_MANAGER', 'SELLER_OWNER'],
    ['WAREHOUSE_MANAGER', 'UNKNOWN'],
  ]) {
    assert.deepEqual(notices.assignedWarehouseIds({ ...user, roles }), [], roles.join(','));
  }
  assert.deepEqual(notices.assignedWarehouseIds({ ...user, actorScope: 'TENANT' }), []);
  assert.deepEqual(notices.assignedWarehouseIds({ ...user, tenantId: id(9) }), []);
});

test('unchanged profile refresh preserves open form identity; changed grants invalidate scope', async () => {
  auth.getState().setSession({ accessToken: 'synthetic-local-token', expiresIn: 900, user });
  const initial = auth.getState().user;
  const revision = auth.getState().revision;
  globalThis.fetch = async () => Response.json({ success: true, data: user, meta: {} });
  await api.currentUser();
  assert.equal(auth.getState().user, initial);
  assert.equal(auth.getState().revision, revision);
  globalThis.fetch = async () =>
    Response.json({ success: true, data: { ...user, warehouseIds: [id(2), id(3)] }, meta: {} });
  await api.currentUser();
  assert.notEqual(auth.getState().user, initial);
  assert.equal(auth.getState().revision, revision + 1);
});

test('Manager evidence separates report reasons and product/lot identities without decision controls', () => {
  const records = [1, 2].map((n) => ({
    receivingRecordId: id(10 + n),
    lotCode: `LOT-${n}`,
    receivedQty: 10,
    inspection: {
      acceptedQty: 8,
      quarantinedQty: 2,
      rejectedQty: 0,
      reason: `QC reason ${n}`,
      photoIds: [],
    },
  }));
  const lines = [1, 2].map((n) => ({
    id: id(20 + n),
    sku: `SKU-${n}`,
    productName: `Product ${n}`,
    count: { lots: [{ recordId: id(10 + n) }] },
  }));
  const reports = [1, 2].map((n) => ({
    id: id(30 + n),
    inboundLineId: id(20 + n),
    receivingRecordId: id(10 + n),
    discrepancyType: 'OTHER',
    qty: 2,
    reason: `Separate report reason ${n}`,
    photoIds: [],
    reportedAt: '2026-11-05T10:00:00Z',
  }));
  const messages = JSON.parse(
    readFileSync(new URL('../messages/vi.json', import.meta.url), 'utf8'),
  );
  const html = renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'vi', messages, timeZone: 'UTC' },
      createElement(Evidence, { records, lines, reports }),
    ),
  );
  assert.equal((html.match(/<article/g) ?? []).length, 2);
  for (const n of [1, 2]) {
    assert.match(html, new RegExp(`SKU-${n}`));
    assert.match(html, new RegExp(`LOT-${n}`));
    assert.match(html, new RegExp(`Separate report reason ${n}`));
  }
  assert.doesNotMatch(html, /<button|<form|COD|Bearer/);
});

test('claim evidence breadcrumb uses the translated warehouse label in both locales', () => {
  auth.getState().setSession({ accessToken: 'synthetic-local-token', expiresIn: 900, user });
  for (const locale of ['vi', 'en']) {
    const messages = JSON.parse(
      readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'),
    );
    const html = renderToStaticMarkup(
      createElement(
        NextIntlClientProvider,
        { locale, messages, timeZone: 'UTC' },
        createElement(
          MemoryRouter,
          { initialEntries: ['/warehouse/claim-evidence'] },
          createElement(Breadcrumbs),
        ),
      ),
    );
    assert.ok(html.includes(messages.Sidebar.warehouse_claim_evidence), locale);
    assert.doesNotMatch(html, /Sidebar\.warehouse_claim-evidence/);
  }
});
