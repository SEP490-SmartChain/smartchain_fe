import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const publishedTerms = { plans: [], serviceTariffs: [], freightTariffs: [] };
const label = { labelVi: 'Lưu kho', labelEn: 'Inventory storage' };
const option = { code: 'STORAGE_M3_DAY', ...label };
const reply = (data) => async () => Response.json({ success: true, data });
let server, api, authStore;

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root,
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ commercialApi: api } = await server.ssrLoadModule(
    '/src/features/tenants/api/commercialApi.ts',
  ));
  ({ useAuthStore: authStore } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});

beforeEach(() => {
  authStore.getState().setSession({
    accessToken: 'synthetic-token',
    expiresIn: 900,
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

after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

test('Admin uses the server options and distinguishes new empty selections from legacy text', async () => {
  const newest = {
    id,
    name: 'Basic',
    code: 'BASIC',
    versionNo: 2,
    monthlyFeeVnd: '4000000',
    includedServices: [],
    includedServiceSelections: [],
  };
  const old = { ...newest, versionNo: 1, includedServices: ['STORAGE_M3_DAY', 'Mô tả cũ'] };
  delete old.includedServiceSelections;
  globalThis.fetch = reply({
    ...publishedTerms,
    plans: [newest, old],
    includedServiceOptions: [option],
  });
  const result = await api.publishedTerms();
  assert.deepEqual(result.includedServiceOptions, [option]);
  assert.deepEqual(result.plans[0].includedServiceSelections, []);
  assert.equal(result.plans[1].includedServiceSelections, undefined);
  assert.deepEqual(result.plans[1].includedServices, old.includedServices);
});

test('Admin can read old terms and rejects duplicate or malformed catalogs', async () => {
  globalThis.fetch = reply(publishedTerms);
  assert.equal((await api.publishedTerms()).includedServiceOptions, undefined);
  for (const includedServiceOptions of [[option, option], [{ ...option, labelVi: '' }]]) {
    globalThis.fetch = reply({ ...publishedTerms, includedServiceOptions });
    await assert.rejects(() => api.publishedTerms(), { name: 'ZodError' });
  }
});

test('Seller quota response keeps labels without retaining fields for internal codes', async () => {
  globalThis.fetch = reply({
    tenantId: id,
    serviceStatus: 'ACTIVE',
    plan: {
      id,
      name: 'Basic',
      code: 'BASIC',
      versionNo: 2,
      monthlyFeeVnd: '4000000',
      warehouseAllowance: 1,
      salesOrderAllowance: 500,
      storageAllowanceM3: '10',
      includedServiceLabels: [option],
    },
    usage: null,
    changes: [],
  });
  assert.deepEqual((await api.quotas()).plan.includedServiceLabels, [label]);
});
