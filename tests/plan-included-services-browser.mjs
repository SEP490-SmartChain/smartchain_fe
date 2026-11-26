import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const oldText = 'Miễn phí đóng gói';
const options = [
  {
    code: 'PICK_PACK_ORDER',
    labelVi: 'Soạn và đóng gói đơn hàng',
    labelEn: 'Order picking and packing',
  },
  {
    code: 'INBOUND_CARTON',
    labelVi: 'Tiếp nhận thùng hàng nhập kho',
    labelEn: 'Inbound carton receiving',
  },
  { code: 'STORAGE_M3_DAY', labelVi: 'Lưu kho hàng hóa', labelEn: 'Inventory storage' },
];
const labels = (items) => items.map(({ labelVi, labelEn }) => ({ labelVi, labelEn }));
const initialPlan = {
  id: id(1),
  planId: id(10),
  code: 'BASIC',
  name: 'Basic',
  versionNo: 1,
  monthlyFeeVnd: '4000000',
  warehouseAllowance: 1,
  salesOrderAllowance: 500,
  storageAllowanceM3: '10',
  effectiveFrom: '2026-10-13T00:00:00.000Z',
  effectiveTo: null,
  agreementId: null,
  agreementVersionRef: null,
};
const legacy = { ...initialPlan, includedServices: [oldText, 'PICK_PACK_ORDER'] };
const legacyLabels = [{ labelVi: oldText, labelEn: oldText }];
const retired = { code: 'OLD_SERVICE', labelVi: 'Dịch vụ đã ngừng', labelEn: 'Retired service' };
let versions = [
  legacy,
  {
    ...initialPlan,
    id: id(9),
    planId: id(19),
    code: 'STANDARD',
    name: 'Standard',
    includedServices: [retired.labelVi],
    includedServiceSelections: [retired],
  },
];
const commands = [];

const fixture = `<!doctype html><html lang="vi"><meta charset="UTF-8"><title>ORCA plan service checks</title>
<div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { NextIntlClientProvider } from 'next-intl';
import vi from '/messages/vi.json';
import en from '/messages/en.json';
import '/src/styles/globals.css';
import { CommercialPlanAdmin } from '/src/features/tenants/components/CommercialPlanAdmin.tsx';
import { SellerContractOnboarding } from '/src/features/tenants/components/SellerContractOnboarding.tsx';
import { useAuthStore } from '/src/stores/authStore.ts';
import { useLocaleStore } from '/src/stores/localeStore.ts';
const view = new URLSearchParams(location.search).get('view');
const admin = view.startsWith('admin');
const locale = view === 'applied' ? 'en' : 'vi';
useLocaleStore.getState().setLocale(locale);
useAuthStore.getState().setSession({ accessToken: 'synthetic-fixture', expiresIn: 900, user: {
  userId: '${id(31)}', tenantId: admin ? null : '${id(30)}', actorScope: admin ? 'PLATFORM' : 'TENANT',
  roles: [admin ? 'ORCA_ADMIN' : 'SELLER_OWNER'], permissions: [],
  serviceStatus: ['catalog', 'draft'].includes(view) ? 'PENDING_ACTIVATION' : 'ACTIVE',
  email: 'synthetic@example.test', fullName: 'Synthetic user',
} });
createRoot(document.getElementById('root')).render(React.createElement(
  NextIntlClientProvider, { locale, messages: locale === 'en' ? en : vi, timeZone: 'Asia/Ho_Chi_Minh' },
  React.createElement(BrowserRouter, null, React.createElement(admin ? CommercialPlanAdmin : SellerContractOnboarding)),
));
</script></html>`;

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);
const cacheDir = await mkdtemp(join(tmpdir(), 'orca-plan-services-vite-'));
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
        name: 'orca-plan-services-test',
        configureServer(vite) {
          vite.middlewares.use(async (request, response, next) => {
            if (!request.headers.accept?.includes('text/html')) return next();
            response.setHeader('Content-Type', 'text/html');
            response.end(await vite.transformIndexHtml(request.url, fixture));
          });
        },
      },
    ],
    server: { host: '127.0.0.1', port: 24375, strictPort: true },
  });
  await server.listen();
  const address = 'http://127.0.0.1:24375';
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE,
    args: ['--disable-background-networking'],
  });

  async function open(view) {
    const page = await browser.newPage({ timezoneId: 'Asia/Ho_Chi_Minh' });
    page.setDefaultTimeout(15000);
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== address) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const resource = url.pathname.split('/').at(-1);
      const ok = (data) => route.fulfill({ json: { success: true, data } });
      if (resource === 'published-terms') {
        return ok({
          plans: versions,
          serviceTariffs: [],
          freightTariffs: [],
          ...(view === 'admin-old' ? {} : { includedServiceOptions: options }),
        });
      }
      if (resource === 'plan-versions' && request.method() === 'POST') {
        const command = request.postDataJSON();
        commands.push(command);
        const latest = Math.max(
          ...versions.filter((item) => item.code === command.code).map((item) => item.versionNo),
        );
        if (command.expectedVersionNo !== latest) {
          return route.fulfill({
            status: 409,
            json: {
              success: false,
              error: {
                code: 'COMMERCIAL.PLAN_VERSION_STALE',
                statusCode: 409,
                message: 'Synthetic stale version',
              },
            },
          });
        }
        const selected = options.filter(({ code }) => command.includedServices.includes(code));
        const created = {
          ...initialPlan,
          ...command,
          id: id(latest + 1),
          versionNo: latest + 1,
          effectiveFrom: `${command.effectiveFrom}T00:00:00.000Z`,
          includedServiceSelections: selected,
          includedServices: selected.map(({ labelVi }) => labelVi),
        };
        versions = [...versions, created];
        return ok({ id: created.id });
      }
      const tenantId = id(30);
      const currentContractId = view === 'catalog' ? null : id(32);
      const serviceStatus = ['catalog', 'draft'].includes(view) ? 'PENDING_ACTIVATION' : 'ACTIVE';
      const published = {
        ...initialPlan,
        id: id(4),
        versionNo: 4,
        includedServiceLabels: labels([options[2]]),
      };
      if (resource === 'plans') return ok({ plans: [published], signingConfigured: true });
      if (resource === 'contracts') {
        return ok({
          currentContractId,
          serviceStatus,
          serviceVersion: 1,
          signingRequests: [],
          contracts: currentContractId
            ? [
                {
                  id: currentContractId,
                  tenantId,
                  contractKind: 'STANDARD',
                  status: view === 'draft' ? 'DRAFT' : 'CONFIRMED',
                  agreementVersionRef: 'BASIC-V1',
                  planVersionId: legacy.id,
                  planName: legacy.name,
                  monthlyFeeVnd: legacy.monthlyFeeVnd,
                  depositRequiredVnd: '3000000',
                  creditLimitVnd: '5000000',
                  effectiveFrom: '2026-10-13',
                  version: 1,
                  acceptedAt: null,
                  confirmedAt: view === 'draft' ? null : '2026-10-13T00:00:00.000Z',
                  includedServiceLabels: legacyLabels,
                },
              ]
            : [],
        });
      }
      if (resource === 'quotas') {
        const applied = view === 'applied';
        return ok({
          tenantId,
          serviceStatus,
          plan: {
            ...initialPlan,
            ...(applied ? { id: id(2), versionNo: 2 } : {}),
            includedServiceLabels: applied ? labels(options.slice(0, 2)) : legacyLabels,
          },
          changes: [],
          usage: null,
        });
      }
      if (resource === 'invoices') return ok({ invoices: [] });
      if (resource === 'custom-inquiries') return ok({ inquiries: [] });
      return route.abort();
    });
    await page.goto(`${address}/?view=${view}`);
    return page;
  }

  const admin = await open('admin');
  const createTab = admin.locator('#commercial-plan-create');
  await createTab.click();
  const form = admin.locator('#commercial-plan-panel-create');
  const pickPack = form.getByRole('checkbox', { name: options[0].labelVi });
  const cartons = form.getByRole('checkbox', { name: options[1].labelVi });
  await form.getByText(oldText, { exact: true }).waitFor();
  await form.getByText('PICK_PACK_ORDER', { exact: true }).waitFor();
  assert.equal(await pickPack.isChecked(), false);
  assert.equal(await cartons.isChecked(), false);
  await form
    .getByText('Danh sách này hiển thị trên gói. Phí và hạn mức được cấu hình riêng.')
    .waitFor();
  await form.locator('select[name=code]').selectOption('STANDARD');
  await form.getByText(retired.labelVi, { exact: true }).waitFor();
  assert.equal(await form.getByRole('checkbox', { name: retired.labelVi }).count(), 0);
  await form.locator('select[name=code]').selectOption('BASIC');
  await pickPack.focus();
  await pickPack.press('Space');
  await cartons.check();
  await form.getByRole('button', { name: 'Công bố phiên bản gói' }).click();
  await admin.getByRole('button', { name: 'Xem chi tiết Basic, phiên bản 2' }).click();
  const detail = admin.getByRole('dialog');
  await detail.getByText(options[0].labelVi, { exact: true }).waitFor();
  await detail.getByText(options[1].labelVi, { exact: true }).waitFor();
  assert.equal(await detail.getByRole('listitem').count(), 2);
  assert.equal(await detail.getByText('PICK_PACK_ORDER', { exact: true }).count(), 0);
  await admin.keyboard.press('Escape');
  assert.deepEqual(commands[0].includedServices, ['PICK_PACK_ORDER', 'INBOUND_CARTON']);
  assert.equal(commands[0].expectedVersionNo, 1);
  assert.equal(commands[0].monthlyFeeVnd, '4000000');
  assert.equal(commands[0].salesOrderAllowance, 500);
  assert.equal(commands[0].warehouseAllowance, 1);
  assert.equal(commands[0].storageAllowanceM3, '10');

  await createTab.click();
  assert.equal(await pickPack.isChecked(), true);
  assert.equal(await cartons.isChecked(), true);
  const newest = {
    ...versions.at(-1),
    id: id(3),
    versionNo: 3,
    includedServiceSelections: [],
    includedServices: [],
  };
  versions = [...versions, newest];
  await cartons.uncheck();
  await form.getByRole('button', { name: 'Công bố phiên bản gói' }).click();
  await admin.getByText('Synthetic stale version', { exact: true }).waitFor();
  assert.equal(commands[1].expectedVersionNo, 2);
  assert.equal(await pickPack.isChecked(), true);
  assert.equal(await cartons.isChecked(), false);
  await form.getByRole('button', { name: 'Tải lại danh mục và chọn lại' }).click();
  await form.getByRole('button', { name: 'Công bố phiên bản gói' }).click();
  await admin.getByRole('button', { name: 'Xem chi tiết Basic, phiên bản 4' }).waitFor();
  assert.deepEqual(commands[2].includedServices, []);
  assert.equal(commands[2].expectedVersionNo, 3);
  await admin.close();

  const oldAdmin = await open('admin-old');
  await oldAdmin.locator('#commercial-plan-create').click();
  await oldAdmin.getByText('Danh mục dịch vụ chưa sẵn sàng.', { exact: false }).waitFor();
  assert.equal(
    await oldAdmin.getByRole('button', { name: 'Công bố phiên bản gói' }).isDisabled(),
    true,
  );
  await oldAdmin.close();

  for (const [view, expected] of [
    ['history', [oldText]],
    ['draft', [oldText]],
    ['applied', [options[0].labelEn, options[1].labelEn]],
    ['catalog', [options[2].labelVi]],
  ]) {
    const seller = await open(view);
    try {
      for (const label of expected) await seller.getByText(label, { exact: true }).waitFor();
    } catch (error) {
      throw new Error(
        `${view} did not display the expected labels.\n${await seller.locator('body').innerText()}`,
        { cause: error },
      );
    }
    for (const { code } of options)
      assert.equal(await seller.getByText(code, { exact: true }).count(), 0);
    if (view === 'applied')
      assert.equal(await seller.getByText(oldText, { exact: true }).count(), 0);
    if (view !== 'catalog')
      assert.equal(await seller.getByText(options[2].labelVi, { exact: true }).count(), 0);
    await seller.close();
  }
  console.log(
    'PASS Admin selection, re-open, stale draft, empty list and older API guard; Seller legacy, draft, effective version and catalog',
  );
} finally {
  await browser?.close();
  await server?.close();
  await rm(cacheDir, { recursive: true, force: true });
}
