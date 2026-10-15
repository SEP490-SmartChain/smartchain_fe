import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

let server, store, api, access, policy, orderScope, Notice, apiClient;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const user = {
  userId: id,
  tenantId: id,
  actorScope: 'TENANT',
  roles: ['SELLER_OWNER'],
  permissions: [],
  email: 'synthetic@example.test',
  fullName: 'Synthetic Owner',
  serviceStatus: 'PENDING_ACTIVATION',
};
const ok = (data) =>
  Response.json({
    success: true,
    data,
    meta: { timestamp: '2026-10-15T00:00:00.000Z', path: '', requestId: 'synthetic' },
  });
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ useAuthStore: store } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  ({ commercialApi: api } = await server.ssrLoadModule(
    '/src/features/tenants/api/commercialApi.ts',
  ));
  ({ apiClient } = await server.ssrLoadModule('/src/services/apiClient.ts'));
  ({ canStartSellerIntake: access } = await server.ssrLoadModule('/src/lib/sellerService.ts'));
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  orderScope = await server.ssrLoadModule('/src/features/orders/lib/orderScope.ts');
  ({ SellerServiceNotice: Notice } = await server.ssrLoadModule(
    '/src/components/layout/SellerServiceNotice.tsx',
  ));
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});
beforeEach(() => {
  store.getState().clear();
  store.getState().setSession({ user, accessToken: 'synthetic-token', expiresIn: 900 });
});

test('only active seller Owner and Staff can start intake; mixed, legacy and unknown scopes deny', () => {
  for (const role of policy.ORCA_ROLES)
    for (const serviceStatus of [
      'PENDING_ACTIVATION',
      'ACTIVE',
      'SUSPENDED',
      'CLOSED',
      null,
      undefined,
    ]) {
      const seller = role.startsWith('SELLER');
      assert.equal(
        access({
          ...user,
          roles: [role],
          actorScope: seller ? 'TENANT' : 'PLATFORM',
          tenantId: seller ? id : null,
          serviceStatus,
        }),
        seller && serviceStatus === 'ACTIVE',
      );
    }
  for (const patch of [
    { roles: ['SELLER_OWNER', 'ORCA_ADMIN'] },
    { roles: ['TENANT_ADMIN'] },
    { actorScope: null },
    { actorScope: 'UNKNOWN' },
    { tenantId: null },
  ])
    assert.equal(access({ ...user, serviceStatus: 'ACTIVE', ...patch }), false);
  assert.equal(access(null), false);
});
test('an inactive Owner retains read/financial role access while new intake is denied', () => {
  assert.deepEqual(orderScope.sellerOrderAccess(), { read: true, create: true, intake: false });
  const before = orderScope.orderScope();
  store.getState().setUser({ ...user, serviceStatus: 'ACTIVE' });
  assert.equal(orderScope.sellerOrderAccess().intake, true);
  assert.notEqual(orderScope.orderScope(), before);
});
test('own inquiry listing uses the authenticated endpoint and strips internal identity and hash fields', async () => {
  const requests = [];
  const inquiry = {
    operationKey: id,
    message: 'Synthetic custom request',
    submittedAt: '2026-10-15T00:00:00.000Z',
  };
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), method: options.method });
    return ok({ inquiries: [{ ...inquiry, hash: 'private', userId: id }] });
  };
  assert.deepEqual(await api.inquiries(), [inquiry]);
  assert.equal(requests[0].url, '/api/v1/commercial/custom-inquiries');
  assert.equal(requests[0].method, 'GET');
});
test('reload fetches persisted inquiries again and validates the server date', async () => {
  const row = {
    operationKey: id,
    message: 'Persisted inquiry',
    submittedAt: '2026-10-15T00:00:00.000Z',
  };
  globalThis.fetch = async () => ok({ inquiries: [row] });
  assert.deepEqual(await api.inquiries(), [row]);
  assert.deepEqual(await api.inquiries(), [row]);
  globalThis.fetch = async () => ok({ inquiries: [{ ...row, submittedAt: 'invalid' }] });
  await assert.rejects(api.inquiries());
});
test('an old seller inquiry response cannot enter the next session', async () => {
  let finish;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = api.inquiries();
  store.getState().clear();
  finish(ok({ inquiries: [] }));
  await assert.rejects(pending, (error) => error.code === 'AUTH.SCOPE_CHANGED');
});
test('a duplicate custom request returns the conflict and preserves the seller session', async () => {
  globalThis.fetch = async () =>
    Response.json(
      {
        success: false,
        error: {
          code: 'COMMERCIAL.CUSTOM_INQUIRY_PENDING',
          message: 'Pending inquiry',
          statusCode: 409,
        },
        meta: {},
      },
      { status: 409 },
    );
  await assert.rejects(
    api.inquire('Another request', id),
    (error) => error.code === 'COMMERCIAL.CUSTOM_INQUIRY_PENDING' && error.status === 409,
  );
  assert.equal(store.getState().status, 'authenticated');
});
test('current profile preserves and validates the service state received from the server', async () => {
  globalThis.fetch = async () => ok({ ...user, serviceStatus: 'ACTIVE' });
  await apiClient.currentUser();
  assert.equal(store.getState().user.serviceStatus, 'ACTIVE');
  globalThis.fetch = async () => ok({ ...user, serviceStatus: 'UNKNOWN' });
  await assert.rejects(apiClient.currentUser());
  assert.equal(store.getState().user.serviceStatus, 'ACTIVE');
});
test('server rendering exposes no browser-only seller session or contract link', () => {
  const messages = JSON.parse(
    readFileSync(new URL('../messages/vi.json', import.meta.url), 'utf8'),
  );
  const render = () =>
    renderToStaticMarkup(
      createElement(
        NextIntlClientProvider,
        { locale: 'vi', timeZone: 'Asia/Ho_Chi_Minh', messages },
        createElement(MemoryRouter, null, createElement(Notice)),
      ),
    );
  assert.equal(render(), '');
});
