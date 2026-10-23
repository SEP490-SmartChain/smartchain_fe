import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createServer } from 'vite';

const id = '12990001-0000-4000-8000-000000000001';
const fixtureKey = '__orcaContractRouteTest';
const messages = JSON.parse(readFileSync(new URL('../messages/vi.json', import.meta.url), 'utf8'));
let server, SettingsPage;

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, ws: false },
    plugins: [
      {
        name: 'contract-route-boundary-fixtures',
        enforce: 'pre',
        load(path) {
          const normalized = path.replaceAll('\\', '/');
          // Fixtures replace session/server-data boundaries only. Real routing,
          // access policy, onboarding composition and lifecycle panel are rendered.
          if (normalized.endsWith('/stores/authStore.ts'))
            return `export const useAuthStore = (selector) => selector(globalThis.${fixtureKey}.auth);
              useAuthStore.getState = () => globalThis.${fixtureKey}.auth;`;
          if (normalized.endsWith('/hooks/useSellerCommercial.ts'))
            return `export const useSellerCommercial = () => globalThis.${fixtureKey}.flow;`;
          // Browser-only PDF rendering is irrelevant when no preview is open.
          if (normalized.endsWith('/components/CommercialPdfPreview.tsx'))
            return 'export function CommercialPdfPreview() { return null; }';
        },
      },
    ],
  });
  ({ default: SettingsPage } = await server.ssrLoadModule('/src/pages/workspace/SettingsPage.tsx'));
});

beforeEach(() => {
  globalThis[fixtureKey] = {
    auth: {
      revision: 1,
      status: 'authenticated',
      user: {
        userId: id,
        tenantId: id,
        actorScope: 'TENANT',
        roles: ['SELLER_OWNER'],
        permissions: [],
        email: 'owner@example.test',
        fullName: 'Synthetic Owner',
        serviceStatus: 'ACTIVE',
      },
    },
    flow: {
      state: {
        currentContractId: id,
        serviceStatus: 'ACTIVE',
        contracts: [
          {
            id,
            tenantId: id,
            contractKind: 'STANDARD',
            status: 'ACCEPTED',
            planName: 'Synthetic Standard',
            agreementVersionRef: 'SYNTHETIC-ROUTE',
            monthlyFeeVnd: '12000000',
            depositRequiredVnd: '3000000',
            creditLimitVnd: '5000000',
            version: 1,
          },
        ],
        signingRequests: [],
      },
      plans: [],
      invoices: [],
      loading: false,
      busy: false,
      configured: true,
      mockPaymentsEnabled: false,
      error: null,
      pdfUrl: null,
      signingUrl: null,
    },
  };
});

after(async () => {
  await server?.close();
  delete globalThis[fixtureKey];
});

function renderContractRoute() {
  return renderToStaticMarkup(
    h(
      NextIntlClientProvider,
      { locale: 'vi', timeZone: 'Asia/Ho_Chi_Minh', messages },
      h(
        MemoryRouter,
        { initialEntries: ['/settings/contract'] },
        h(Routes, null, h(Route, { path: '/settings/:tab', element: h(SettingsPage) })),
      ),
    ),
  );
}

for (const [status, serviceStatus] of [
  ['ACCEPTED', 'ACTIVE'],
  ['ACCEPTED', 'SUSPENDED'],
  ['CONFIRMED', 'ACTIVE'],
  ['TERMINATING', 'SUSPENDED'],
]) {
  test(`Owner contract route mounts lifecycle panel once for ${status}/${serviceStatus}`, () => {
    const { auth, flow } = globalThis[fixtureKey];
    flow.state.contracts[0].status = status;
    flow.state.serviceStatus = serviceStatus;
    auth.user.serviceStatus = serviceStatus;
    const html = renderContractRoute();
    assert.ok(html.includes('SYNTHETIC-ROUTE'), 'the actual contract screen must be rendered');
    assert.equal(
      html.split(messages.CommercialQuota.title.replaceAll('&', '&amp;')).length - 1,
      1,
      'Owner must reach the real lifecycle panel from Settings, not a standalone preview',
    );
  });
}

for (const status of ['DRAFT', 'TERMINATED']) {
  test(`does not mount financial lifecycle reads for a ${status} contract`, () => {
    globalThis[fixtureKey].flow.state.contracts[0].status = status;
    const html = renderContractRoute();
    assert.ok(html.includes('SYNTHETIC-ROUTE'));
    assert.ok(!html.includes(messages.CommercialQuota.title.replaceAll('&', '&amp;')));
  });
}

test('keeps initial onboarding separate when no current contract exists', () => {
  const { state } = globalThis[fixtureKey].flow;
  state.currentContractId = null;
  state.contracts = [];
  const html = renderContractRoute();
  assert.ok(!html.includes(messages.CommercialQuota.title.replaceAll('&', '&amp;')));
});

for (const [actorScope, roles] of [
  ['TENANT', ['SELLER_STAFF']],
  ['PLATFORM', ['ORCA_ADMIN']],
  ['TENANT', ['SELLER_OWNER', 'ORCA_ADMIN']],
  [null, ['SELLER_OWNER']],
  ['TENANT', ['TENANT_ADMIN']],
]) {
  test(`contract URL does not expose the lifecycle panel to ${actorScope}/${roles.join(',')}`, () => {
    const { user } = globalThis[fixtureKey].auth;
    Object.assign(user, { actorScope, roles, tenantId: actorScope === 'PLATFORM' ? null : id });
    const html = renderContractRoute();
    assert.ok(!html.includes(messages.CommercialQuota.title.replaceAll('&', '&amp;')));
    assert.ok(!html.includes('SYNTHETIC-ROUTE'));
  });
}
