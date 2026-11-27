// Browser regression tests against real forms with a synthetic, local-only API.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const largestInput = '99999999999999.999999';
const availableVolume = '999999999999999999999999.012345';
const fixture = `<!doctype html><html lang="vi"><meta charset="UTF-8"><title>ORCA volume checks</title>
<div id="root"></div>
<script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { NextIntlClientProvider } from 'next-intl';
import vi from '/messages/vi.json';
import en from '/messages/en.json';
import '/src/styles/globals.css';
import { WarehouseLayoutPanel } from '/src/features/catalog/components/WarehouseLayoutPanel.tsx';
import { CommercialPlanAdmin } from '/src/features/tenants/components/CommercialPlanAdmin.tsx';
import { AsnForm } from '/src/features/inbound/components/AsnForm.tsx';
import { useAuthStore } from '/src/stores/authStore.ts';

const params = new URLSearchParams(location.search);
const flow = params.get('flow');
const locale = params.get('locale') === 'en' ? 'en' : 'vi';
const id = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const role = { layout: 'WAREHOUSE_MANAGER', plan: 'ORCA_ADMIN', asn: 'SELLER_OWNER' }[flow];
const stamp = '2026-11-26T08:00:00.000Z';
const pagination = { limit: 100, hasNext: false, nextCursor: null };
const user = {
  userId: id(1), tenantId: flow === 'asn' ? id(2) : null,
  actorScope: flow === 'asn' ? 'TENANT' : 'PLATFORM', roles: [role], permissions: [],
  warehouseIds: [id(3)], serviceStatus: 'ACTIVE', email: 'synthetic@example.test',
  fullName: 'Synthetic user', phone: null, avatarUrl: null,
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
const warehouses = [
  warehouse,
  { ...warehouse, id: id(4), code: 'ZERO', name: 'Empty space: zero' },
  { ...warehouse, id: id(5), code: 'UNKNOWN', name: 'Unknown capacity' },
];
const capacities = { [id(3)]: '${availableVolume}', [id(4)]: '0.000000', [id(5)]: null };
const zone = {
  id: id(6), warehouseId: warehouse.id, code: 'STORAGE-A', zoneType: 'STORAGE',
  isActive: true, updatedAt: stamp,
};
const bin = {
  id: id(7), warehouseId: warehouse.id, zoneId: zone.id, code: 'BIN-ORIGINAL',
  barcode: 'BIN-ORIGINAL', maxWeightG: '100000', maxVolumeM3: '1',
  isActive: true, version: 1,
};
let bins = [bin];
const ok = (data, paging) => Response.json({
  success: true,
  data,
  meta: { timestamp: stamp, requestId: 'volume-fixture', path: '', ...(paging && { pagination }) },
});
const commands = [];
window.__volumeCommands = commands;
window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
  const path = url.pathname;
  const method = init.method ?? 'GET';
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
  if (method !== 'GET') commands.push({ path, method, body });
  if (path.endsWith('/zones')) return ok([zone], true);
  if (path.endsWith('/bins') && method === 'GET') return ok(bins, true);
  if (path.endsWith('/bins') && method === 'POST') {
    const created = { ...bin, ...body, id: id(8), barcode: body.code };
    bins = [...bins, created];
    return ok(created);
  }
  if (path.endsWith('/bins/' + bin.id) && method === 'PATCH') {
    const { expectedVersion, ...changes } = body;
    const updated = { ...bin, ...changes, version: expectedVersion + 1 };
    bins = bins.map((item) => item.id === bin.id ? updated : item);
    return ok(updated);
  }
  if (path.endsWith('/bins/bulk') && method === 'POST') {
    const created = { ...bin, id: id(9), code: 'BIN-BULK', barcode: 'BIN-BULK',
      maxWeightG: body.maxWeightG, maxVolumeM3: body.maxVolumeM3 };
    bins = [...bins, created];
    return ok([created]);
  }
  if (path.endsWith('/published-terms')) {
    return ok({ plans: [], serviceTariffs: [], freightTariffs: [], includedServiceOptions: [] });
  }
  if (path.endsWith('/plan-versions') && method === 'POST') return ok({ id: id(10) });
  if (path.endsWith('/warehouses')) return ok(warehouses, true);
  if (path.endsWith('/asns/sku-options')) return ok([], true);
  if (path.endsWith('/storage-capacity')) {
    const warehouseId = path.split('/').at(-2);
    return ok({ warehouseId, availableVolumeM3: capacities[warehouseId] });
  }
  return Response.json({
    success: false,
    error: { code: 'SYNTHETIC.NOT_IMPLEMENTED', message: 'Local fixture only', statusCode: 404 },
  }, { status: 404 });
};

const views = {
  layout: React.createElement(WarehouseLayoutPanel, { warehouse, zoneType: 'STORAGE' }),
  plan: React.createElement(CommercialPlanAdmin),
  asn: React.createElement(AsnForm, { draft: null, onClose() {}, onSaved() {} }),
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
const cacheDir = await mkdtemp(join(tmpdir(), 'orca-volume-vite-'));
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
        name: 'orca-volume-test',
        configureServer(vite) {
          vite.middlewares.use(async (request, response, next) => {
            if (!request.headers.accept?.includes('text/html')) return next();
            response.setHeader('Content-Type', 'text/html');
            response.end(await vite.transformIndexHtml(request.url, fixture));
          });
        },
      },
    ],
    server: { host: '127.0.0.1', port: 24371, strictPort: true },
  });
  await server.listen();
  const address = 'http://127.0.0.1:24371';
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE,
    args: ['--disable-background-networking'],
  });

  async function open(flow, locale) {
    const page = await browser.newPage({ locale, timezoneId: 'Asia/Ho_Chi_Minh' });
    page.setDefaultTimeout(10000);
    await page.route('**/*', (route) =>
      new URL(route.request().url()).origin === address ? route.continue() : route.abort(),
    );
    await page.goto(`${address}/?flow=${flow}&locale=${locale}`);
    return page;
  }
  const button = (page, name) => page.getByRole('button', { name, exact: true });
  const field = (page, name) => page.locator(`[name="${name}"]`);
  const getCommands = (page) => page.evaluate(() => window.__volumeCommands);
  const loadCommands = async (page, count) => {
    await page.waitForFunction((n) => window.__volumeCommands.length >= n, count);
    return getCommands(page);
  };
  async function rejects(page, field, submit, input, error, count) {
    await field.fill(input);
    await submit.click();
    await page.getByText(error, { exact: true }).waitFor();
    assert.equal(await field.getAttribute('aria-invalid'), 'true');
    assert.equal(await field.inputValue(), input);
    assert.equal((await getCommands(page)).length, count);
  }

  for (const locale of ['vi', 'en']) {
    const messages = JSON.parse(await readFile(join(root, `messages/${locale}.json`), 'utf8'));
    const vol = messages.VolumeValidation;
    const layout = messages.WarehouseLayout;
    const warehousePage = await open('layout', locale);
    const openCreate = button(warehousePage, layout.createBin);
    const dialog = warehousePage.getByRole('dialog');
    const binVolume = field(dialog, 'maxVolumeM3');
    const save = button(dialog, layout.save);
    await openCreate.click();
    await field(dialog, 'code').fill('BIN-CREATE');
    await dialog.getByText(vol.decimalHint, { exact: true }).waitFor();
    await rejects(dialog, binVolume, save, '0,000000', vol.positive, 0);
    await binVolume.fill(locale === 'vi' ? '1,5' : '1.5');
    await save.click();
    let commands = await loadCommands(warehousePage, 1);
    assert.equal(commands[0].path.endsWith('/bins'), true);
    assert.equal(commands[0].method, 'POST');
    assert.equal(commands[0].body.maxVolumeM3, '1.5');
    await dialog.waitFor({ state: 'hidden' });

    await button(warehousePage, layout.editCode.replace('{code}', 'BIN-ORIGINAL')).click();
    await rejects(dialog, binVolume, save, '100000000000000', vol.invalid, 1);
    await binVolume.fill(largestInput.replace('.', ','));
    await save.click();
    commands = await loadCommands(warehousePage, 2);
    assert.equal(commands[1].path.endsWith(`/bins/${id(7)}`), true);
    assert.equal(commands[1].method, 'PATCH');
    assert.equal(commands[1].body.maxVolumeM3, largestInput);
    assert.equal(commands[1].body.expectedVersion, 1);
    await dialog.waitFor({ state: 'hidden' });
    const exactBinLabel =
      locale === 'vi' ? '99.999.999.999.999,999999' : '99,999,999,999,999.999999';
    await warehousePage.getByRole('cell', { name: exactBinLabel, exact: true }).waitFor();

    await openCreate.click();
    await field(dialog, 'mode').selectOption('bulk');
    await rejects(dialog, binVolume, save, '1.234,5', vol.invalid, 2);
    await rejects(dialog, binVolume, save, '0,0000001', vol.invalid, 2);
    await binVolume.fill(' 0,000001 ');
    await save.click();
    commands = await loadCommands(warehousePage, 3);
    assert.equal(commands[2].path.endsWith('/bins/bulk'), true);
    assert.equal(commands[2].method, 'POST');
    assert.equal(commands[2].body.maxVolumeM3, '0.000001');
    assert.equal(commands[2].body.zoneId, id(6));
    await warehousePage.close();

    const plan = await open('plan', locale);
    const commercial = messages.CommercialAdmin;
    const planTab = plan.getByRole('tab', { name: commercial.newPlan });
    const allowance = field(plan, 'storageAllowanceM3');
    const publish = button(plan, commercial.publishPlan);
    await planTab.click();
    await rejects(plan, allowance, publish, '-1', vol.invalid, 0);
    await allowance.fill('0');
    await publish.click();
    commands = await loadCommands(plan, 1);
    assert.equal(commands[0].path.endsWith('/plan-versions'), true);
    assert.equal(commands[0].body.storageAllowanceM3, '0');
    await publish.waitFor({ state: 'hidden' });
    await planTab.click();
    await allowance.fill(' 99999999999999,999999 ');
    await publish.click();
    commands = await loadCommands(plan, 2);
    assert.equal(commands[1].body.storageAllowanceM3, largestInput);
    await plan.close();

    const asn = await open('asn', locale);
    const warehouseSelect = field(asn, 'warehouseId');
    const exactAsnLabel =
      locale === 'vi'
        ? '999.999.999.999.999.999.999.999,012345'
        : '999,999,999,999,999,999,999,999.012345';
    await warehouseSelect.selectOption(id(3));
    await asn
      .getByText(messages.Asns.warehouseAvailableVolume.replace('{volume}', exactAsnLabel), {
        exact: true,
      })
      .waitFor();
    await warehouseSelect.selectOption(id(4));
    await asn
      .getByText(messages.Asns.warehouseAvailableVolume.replace('{volume}', '0'), { exact: true })
      .waitFor();
    await warehouseSelect.selectOption(id(5));
    await asn.getByText(messages.Asns.warehouseVolumeUnavailable, { exact: true }).waitFor();
    assert.deepEqual(await getCommands(asn), []);
    await asn.close();

    console.log(
      `${locale}: single/edit/bulk bin commands, plan allowance and ASN capacity passed.`,
    );
  }
} finally {
  await browser?.close();
  await server?.close();
  await rm(cacheDir, { recursive: true, force: true });
}
