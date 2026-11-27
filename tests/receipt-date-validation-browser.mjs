// Chromium test of the live React forms with a synthetic, local-only API.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = `<!doctype html><html lang="vi"><meta charset="UTF-8"><title>ORCA date validation</title>
<div id="root"></div>
<script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { NextIntlClientProvider } from 'next-intl';
import vi from '/messages/vi.json';
import en from '/messages/en.json';
import '/src/styles/globals.css';
import { AsnForm } from '/src/features/inbound/components/AsnForm.tsx';
import { WebhookDeliveryWorkspace } from '/src/features/analytics/components/WebhookDeliveryWorkspace.tsx';
import { PickingWorkspace } from '/src/features/orders/components/PickingWorkspace.tsx';
import { OnDemandStatementForm } from '/src/features/tenants/components/OnDemandStatementForm.tsx';
import { PayoutStatementDetail } from '/src/features/tenants/components/PayoutStatementDetail.tsx';
import { useAuthStore } from '/src/stores/authStore.ts';

const params = new URLSearchParams(location.search);
const flow = params.get('flow');
const locale = params.get('locale') === 'en' ? 'en' : 'vi';
const id = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const role = { asn: 'SELLER_OWNER', webhook: 'ORCA_ADMIN', pick: 'WAREHOUSE_MANAGER', cod: 'ORCA_ACCOUNTANT', transfer: 'ORCA_ACCOUNTANT' }[flow];
const stamp = '2026-11-26T08:00:00.000Z';
const page = { limit: 50, hasNext: false, nextCursor: null };
const user = {
  userId: id(1), tenantId: flow === 'asn' ? id(2) : null,
  actorScope: flow === 'asn' ? 'TENANT' : 'PLATFORM', roles: [role],
  permissions: [], warehouseIds: [id(3)], serviceStatus: 'ACTIVE',
  email: 'synthetic@example.test', fullName: 'Synthetic user', phone: null, avatarUrl: null,
};
useAuthStore.getState().setSession({ user, accessToken: 'local-fixture', expiresIn: 900 });
const warehouse = {
  id: id(3), tenantId: null, region: 'NORTH', timeZone: 'Asia/Ho_Chi_Minh',
  cutoffMinute: 1020, operatingStartMinute: 480, operatingEndMinute: 1080,
  version: 1, code: 'WH-HN', name: 'Kho Hà Nội', address: 'Synthetic address',
  provinceCode: '01', districtCode: null, wardCode: '00001', latitude: 21, longitude: 105,
  dailyCapacity: 1000, priority: 1, status: 'ACTIVE', contactName: null, contactPhone: null,
  contactEmail: null, createdAt: stamp, updatedAt: stamp,
};
const product = { id: id(4), sku: 'SKU-LOT', name: 'Synthetic SKU', trackLot: true, trackExpiry: true };
const draft = {
  id: id(5), tenantId: user.tenantId, warehouseId: warehouse.id, asnCode: 'ASN-TEST',
  externalReference: 'DATE-TEST', status: 'DRAFT', expectedArrivalAt: '2026-11-26T08:00:21.000Z',
  arrivedAt: null, submittedAt: null, cartonLabelRefs: [], cartonCount: 1,
  cancellationReason: null, cancelledAt: null, receiptIds: [], discrepancyIds: [],
  createdByUserId: user.userId, version: 1, createdAt: stamp, updatedAt: stamp,
  lines: [{
    id: id(6), productId: product.id, lineNo: 1, sku: product.sku, productName: product.name,
    declaredQty: 4, receivedQty: 0, acceptedQty: 0, quarantinedQty: 0, rejectedQty: 0,
    declaredLotCode: 'LOT-TEST', declaredExpiryOn: '2026-11-20T00:00:00.000Z',
  }],
};
const ok = (data, pagination) => Response.json({
  success: true,
  data,
  meta: { timestamp: stamp, requestId: 'date-fixture', path: '', ...(pagination && { pagination }) },
});
const fail = (status, code) => Response.json({
  success: false,
  error: { code, message: code, statusCode: status },
  meta: { timestamp: stamp, requestId: 'date-fixture', path: '' },
}, { status });

const requests = [];
window.__dateRequests = requests;
window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
  const path = url.pathname;
  const method = init.method ?? 'GET';
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
  requests.push({ path, method, body, query: Object.fromEntries(url.searchParams) });
  if (path.endsWith('/warehouses')) return ok([warehouse], page);
  if (path.endsWith('/asns/sku-options')) return ok([product], page);
  if (path.endsWith('/asns/' + draft.id) && method === 'PATCH') {
    return ok({ ...draft, expectedArrivalAt: body.expectedArrivalAt, version: 2 });
  }
  if (path.endsWith('/webhooks/summary')) {
    return ok({
      from: url.searchParams.get('from'), to: url.searchParams.get('to'), total: '0',
      counts: { PENDING: '0', DELIVERED: '0', FAILED: '0', EXHAUSTED: '0' },
    });
  }
  if (path.endsWith('/reports/webhooks')) return ok([], page);
  if (path.endsWith('/warehouse-ops/waves') && method === 'GET') return ok({ items: [], nextCursor: null });
  if (path.endsWith('/warehouse-ops/backlog')) {
    return ok({ lines: [], nextCursor: null, pageTotals: { lines: 0, readyLines: 0, blockedLines: 0 } });
  }
  if (path.endsWith('/putaway/staff')) return ok([{ id: id(1), fullName: 'Synthetic warehouse worker' }]);
  if (path.endsWith('/warehouse-ops/waves/preview')) {
    return ok({
      parcelLimit: body.maxParcels, proposedParcels: 0, proposedOrders: 0, proposedLines: 0,
      firstParcelTooLarge: false, candidateScanLimitReached: false,
    });
  }
  if (path.endsWith('/statements/' + id(8))) {
    return ok({
      id: id(8), tenantId: id(2), cycleKind: 'ON_DEMAND', status: 'APPROVED', version: 1,
      periodStart: '2026-11-25', periodEnd: '2026-11-26', cutoffAt: null,
      reviewDeadlineAt: stamp, eligibleAmountVnd: '1000', openingBalanceVnd: '0',
      closingBalanceVnd: '1000', approvedAmountVnd: '1000', sentAt: null, confirmedAt: null,
      approvedAt: '2026-11-26T07:50:45.000Z', closedAt: null, isLegacy: false,
    });
  }
  if (path.endsWith('/statements/' + id(8) + '/lines')) return ok([], page);
  if (path.endsWith('/statements/' + id(8) + '/transfer-evidence')) {
    return ok({ evidenceKey: 'synthetic-pdf', sha256: '0'.repeat(64) });
  }
  if (path.endsWith('/statements/' + id(8) + '/transfers')) {
    return ok({ statementId: id(8), status: 'PAID', version: 2 });
  }
  if (path.endsWith('/statements/on-demand')) {
    const tries = requests.filter((request) => request.path === path).length;
    if (tries === 1) return fail(503, 'SYNTHETIC.RETRY');
    return ok({ statementId: id(7), status: 'SENT', version: 1 });
  }
  return fail(404, 'SYNTHETIC.NOT_IMPLEMENTED');
};

const views = {
  asn: React.createElement(AsnForm, { draft, onClose() {}, onSaved() {} }),
  webhook: React.createElement(WebhookDeliveryWorkspace),
  pick: React.createElement(PickingWorkspace),
  cod: React.createElement(OnDemandStatementForm, { tenantId: id(2), onCreated() {}, onCancel() {} }),
  transfer: React.createElement(PayoutStatementDetail, { id: id(8), tenantId: id(2), onClose() {}, onChanged() {} }),
};
createRoot(document.getElementById('root')).render(React.createElement(
  NextIntlClientProvider,
  { locale, messages: locale === 'vi' ? vi : en, timeZone: 'Asia/Ho_Chi_Minh' },
  React.createElement(BrowserRouter, null, views[flow]),
));
</script></html>`;

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);
const vi = JSON.parse(await readFile(join(root, 'messages/vi.json'), 'utf8'));
const en = JSON.parse(await readFile(join(root, 'messages/en.json'), 'utf8'));
const cacheDir = await mkdtemp(join(tmpdir(), 'orca-date-vite-'));
let browser;
let server;
try {
  server = await createServer({
    root,
    configFile: false,
    envFile: false,
    cacheDir,
    resolve: { alias: { '@': join(root, 'src'), '@messages': join(root, 'messages') } },
    plugins: [
      react(),
      {
        name: 'orca-date-test',
        configureServer(vite) {
          vite.middlewares.use(async (request, response, next) => {
            if (!request.headers.accept?.includes('text/html')) return next();
            response.setHeader('Content-Type', 'text/html');
            response.end(await vite.transformIndexHtml(request.url, fixture));
          });
        },
      },
    ],
    server: { host: '127.0.0.1', port: 24367, strictPort: true },
  });
  await server.listen();
  const address = 'http://127.0.0.1:24367';
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE,
    args: ['--disable-background-networking'],
  });
  const now = new Date('2026-11-26T08:00:00.000Z');

  async function open(flow, { locale = 'vi', timezoneId = 'Asia/Ho_Chi_Minh' } = {}) {
    const page = await browser.newPage({ locale, timezoneId });
    page.setDefaultTimeout(10000);
    await page.route('**/*', (route) =>
      new URL(route.request().url()).origin === address ? route.continue() : route.abort(),
    );
    await page.clock.setFixedTime(now);
    await page.goto(`${address}/?flow=${flow}&locale=${locale}`);
    return page;
  }
  const button = (page, name) => page.getByRole('button', { name, exact: true });
  const byName = (page, name) => page.locator(`input[name="${name}"]`);
  const getRequests = (page, match) =>
    page.evaluate(
      ({ suffix, method }) =>
        window.__dateRequests.filter((row) => row.path.endsWith(suffix) && row.method === method),
      match,
    );
  const waitForRequests = (page, match, count) =>
    page.waitForFunction(
      ({ suffix, method, count }) =>
        window.__dateRequests.filter((row) => row.path.endsWith(suffix) && row.method === method)
          .length >= count,
      { ...match, count },
    );

  const asn = await open('asn', { timezoneId: 'America/Los_Angeles' });
  const eta = byName(asn, 'expectedArrivalAt');
  const patch = { suffix: '/asns/00000000-0000-4000-8000-000000000005', method: 'PATCH' };
  assert.equal(await eta.inputValue(), '2026-11-26T00:00');
  await eta.fill('2026-03-08T02:30');
  await button(asn, vi.Asns.saveDraft).click();
  await asn.getByText(vi.DateValidation.invalidDateTime, { exact: true }).waitFor();
  assert.deepEqual(await getRequests(asn, patch), []);
  assert.equal(await eta.inputValue(), '2026-03-08T02:30');
  await eta.fill('2026-11-26T00:00');
  await button(asn, vi.Asns.saveDraft).click();
  await waitForRequests(asn, patch, 1);
  await eta.fill('');
  await button(asn, vi.Asns.saveDraft).click();
  await waitForRequests(asn, patch, 2);
  const [unchanged, update] = await getRequests(asn, patch);
  assert.equal(unchanged.body.expectedArrivalAt, '2026-11-26T08:00:21.000Z');
  assert.equal(update.body.expectedArrivalAt, null);
  assert.equal(update.body.lines[0].declaredExpiryOn, '2026-11-20');
  await asn.close();
  console.log('ASN draft rejects an impossible local time and supports removing its ETA.');

  const webhooks = await open('webhook', { locale: 'en' });
  const summary = { suffix: '/webhooks/summary', method: 'GET' };
  await waitForRequests(webhooks, summary, 1);
  await byName(webhooks, 'from').fill('2026-04-30');
  await byName(webhooks, 'to').fill('2026-04-29');
  await button(webhooks, en.WebhookReports.apply).click();
  await webhooks.getByText(en.WebhookReports.invalidRange, { exact: true }).waitFor();
  assert.equal((await getRequests(webhooks, summary)).length, 1);
  await byName(webhooks, 'to').fill('2026-04-30');
  await button(webhooks, en.WebhookReports.apply).click();
  await waitForRequests(webhooks, summary, 2);
  const [, applied] = await getRequests(webhooks, summary);
  assert.deepEqual(applied.query, { from: '2026-04-30', to: '2026-04-30' });
  await webhooks.close();
  console.log('Webhook filters show an English field error and send only the corrected range.');

  const picking = await open('pick');
  const preview = { suffix: '/warehouse-ops/waves/preview', method: 'POST' };
  await picking.locator('summary').filter({ hasText: vi.Picking.createWave }).click();
  const cutoff = byName(picking, 'cutoffAt');
  for (const value of ['2026-11-18T15:00', '2026-11-26T15:01']) {
    await cutoff.fill(value);
    await button(picking, vi.Picking.previewWave).click();
    await picking.getByText(vi.DateValidation.pickCutoff, { exact: true }).waitFor();
    assert.deepEqual(await getRequests(picking, preview), []);
  }
  await cutoff.fill('2026-11-19T15:00');
  await button(picking, vi.Picking.previewWave).click();
  await waitForRequests(picking, preview, 1);
  const [estimate] = await getRequests(picking, preview);
  assert.deepEqual(estimate.body, { cutoffAt: '2026-11-19T08:00:00.000Z', maxParcels: 20 });
  await picking.close();
  console.log(
    'Picking preview blocks both invalid bounds and accepts the exact seven-day boundary.',
  );

  const cod = await open('cod');
  const demand = { suffix: '/statements/on-demand', method: 'POST' };
  const codSubmit = cod.locator('button[type="submit"]');
  await byName(cod, 'periodTo').fill('2026-11-27');
  await codSubmit.click();
  await cod.getByText(vi.DateValidation.payoutPeriod, { exact: true }).waitFor();
  assert.deepEqual(await getRequests(cod, demand), []);
  await byName(cod, 'periodTo').fill('2026-11-26');
  await codSubmit.click();
  await waitForRequests(cod, demand, 1);
  await cod.getByText('SYNTHETIC.RETRY', { exact: true }).waitFor();
  await cod.clock.setFixedTime(new Date('2026-11-26T08:05:00.000Z'));
  await codSubmit.click();
  await waitForRequests(cod, demand, 2);
  const [initial, retry] = await getRequests(cod, demand);
  assert.deepEqual(retry.body, initial.body);
  assert.equal(initial.body.periodFrom, '2026-11-25T17:00:00.000Z');
  assert.equal(initial.body.periodTo, now.toISOString());
  await cod.close();
  console.log('COD blocks future periods and reuses the exact payload and key on retry.');

  const transfer = await open('transfer');
  const transfers = { suffix: '/transfers', method: 'POST' };
  const transferredAt = transfer.getByLabel(vi.Payouts.transferredAt);
  await transferredAt.waitFor();
  assert.equal(await transferredAt.getAttribute('step'), '1');
  const transferForm = transfer.locator('form').filter({ has: transferredAt });
  await transferForm.locator('input[name="bankReference"]').fill('BANK-TEST-123');
  await transferForm.locator('input[type="file"]').setInputFiles({
    name: 'receipt.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7 fixture'),
  });
  await transferForm.getByText(vi.Payouts.evidenceReady, { exact: true }).waitFor();
  await transferredAt.fill('2026-11-26T14:50:44');
  await button(transferForm, vi.Payouts.recordTransfer).click();
  await transfer.getByText(vi.DateValidation.transferWindow, { exact: true }).waitFor();
  assert.deepEqual(await getRequests(transfer, transfers), []);
  await transferredAt.fill('2026-11-26T14:50:45');
  await button(transferForm, vi.Payouts.recordTransfer).click();
  await waitForRequests(transfer, transfers, 1);
  const [recorded] = await getRequests(transfer, transfers);
  assert.equal(recorded.body.transferredAt, '2026-11-26T07:50:45.000Z');
  await transfer.close();
  console.log(
    'Payout transfer rejects the second before approval and sends the exact allowed second.',
  );
} finally {
  await browser?.close();
  await server?.close();
  await rm(cacheDir, { recursive: true, force: true });
}
