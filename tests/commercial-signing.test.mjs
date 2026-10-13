import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server, api, store, policy, safeUrl, profileSchema, shouldUseSigningWindow;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001';
const agreementId = '00000000-0000-4000-8000-000000000002';
const ok = (data) =>
  Response.json({
    success: true,
    data,
    meta: { timestamp: '2026-10-12T00:00:00Z', path: '', requestId: 'fixture' },
  });
const request = {
  id,
  contractId: id,
  status: 'PREPARING',
  errorCode: null,
  completedAt: null,
  hasEvidence: false,
};
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ commercialApi: api, validatedSigningUrl: safeUrl } = await server.ssrLoadModule(
    '/src/features/tenants/api/commercialApi.ts',
  ));
  ({ useAuthStore: store } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  ({ contractBusinessProfileSchema: profileSchema } = await server.ssrLoadModule(
    '/src/features/tenants/schemas/contractBusinessProfileSchema.ts',
  ));
  ({ shouldUseSigningWindow } = await server.ssrLoadModule(
    '/src/features/tenants/lib/signingPresentation.ts',
  ));
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

test('signing returns use a separate window for local origins and preserve hosted HTTPS embedding', () => {
  for (const origin of [
    'http://localhost:2326',
    'https://localhost:2326',
    'https://127.0.0.1',
    'https://[::1]',
    'https://192.168.1.2',
    'https://orca.local',
    'http://orca.example.test',
    'invalid',
  ]) {
    assert.equal(shouldUseSigningWindow(origin), true);
  }
  assert.equal(shouldUseSigningWindow('https://orca.example.test'), false);
});
beforeEach(() => {
  store.getState().clear();
  store.getState().setSession({
    accessToken: 'fixture-token',
    expiresIn: 900,
    user: {
      userId: id,
      tenantId: id,
      email: 'seller@example.test',
      fullName: 'Owner',
      actorScope: 'TENANT',
      roles: ['SELLER_OWNER'],
      permissions: [],
    },
  });
});
test('only Seller Owner sees the signing route and menu; mixed or Staff scopes deny', () => {
  for (const role of policy.ORCA_ROLES) {
    assert.equal(policy.can([role], 'contract.sign'), role === 'SELLER_OWNER');
    assert.equal(policy.isRouteAllowed([role], '/settings/contract'), role === 'SELLER_OWNER');
    assert.equal(
      policy.getSearchLinks([role], false).some((item) => item.href === '/settings/contract'),
      role === 'SELLER_OWNER',
    );
  }
  assert.equal(policy.can(['SELLER_OWNER', 'ORCA_ADMIN'], 'contract.sign'), false);
});
test('start retries send the same operation reference without trusting a client seller or signing result', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    return ok(request);
  };
  await api.start(agreementId, 'V1', id);
  await api.start(agreementId, 'V1', id);
  assert.deepEqual(calls[0].body, { agreementId, agreementVersionRef: 'V1', operationKey: id });
  assert.deepEqual(calls[1].body, calls[0].body);
});

test('party details are explicit input while signer identity and money stay server controlled', async () => {
  const profile = {
    legalName: 'Demo Seller',
    address: 'Demo address',
    representativeName: 'Demo Owner',
    representativeTitle: 'Owner',
    authorityBasis: 'Self represented',
    phone: '0900000000',
  };
  let body;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return ok(request);
  };
  await api.start(agreementId, 'V3', id, undefined, profile);
  assert.deepEqual(body, {
    agreementId,
    agreementVersionRef: 'V3',
    operationKey: id,
    businessProfile: profile,
  });
});

test('a new contracting party template requires complete details and explicit review', () => {
  const values = {
    legalName: 'Demo Seller',
    address: 'Demo address',
    registrationNumber: '',
    representativeName: 'Demo Owner',
    representativeTitle: 'Owner',
    authorityBasis: 'Self represented',
    phone: '0900000000',
    hasReviewedTerms: true,
  };
  assert.equal(profileSchema(true).safeParse(values).success, true);
  for (const change of [
    { legalName: '  ' },
    { address: 'four' },
    { phone: 'invalid' },
    { representativeName: 'Owner\nAdmin' },
    { authorityBasis: 'a'.repeat(201) },
    { hasReviewedTerms: false },
  ]) {
    assert.equal(profileSchema(true).safeParse({ ...values, ...change }).success, false);
  }
  assert.equal(
    profileSchema(false).safeParse({
      legalName: '',
      address: '',
      registrationNumber: '',
      representativeName: '',
      representativeTitle: '',
      authorityBasis: '',
      phone: '',
      hasReviewedTerms: true,
    }).success,
    true,
  );
});
test('signing links accept only the provider HTTPS origins', () => {
  assert.equal(safeUrl('https://app.signnow.com/sign/token'), 'https://app.signnow.com/sign/token');
  for (const url of [
    'http://app.signnow.com/sign/token',
    'https://app.signnow.com.attacker.test/sign/token',
    'https://user:secret@app.signnow.com/sign/token',
    'https://app.signnow.com:444/sign/token',
    'javascript:alert(1)',
  ])
    assert.throws(() => safeUrl(url));
});
test('an old signing link cannot cross an auth scope revision', async () => {
  let finish;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = api.session(id);
  store.getState().clear();
  finish(ok({ signingUrl: 'https://app.signnow.com/sign/token', expiresInSeconds: 900 }));
  await assert.rejects(pending, (error) => error.code === 'AUTH.SCOPE_CHANGED');
});

test('agreement preview requests the authorized agreement without changing the seller contract', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options.method });
    return ok({ downloadUrl: 'https://storage.example.test/original.pdf', expiresInSeconds: 300 });
  };

  const result = await api.preview(agreementId);

  assert.equal(result.downloadUrl, 'https://storage.example.test/original.pdf');
  assert.equal(calls.length, 1);
  assert(calls[0].url.endsWith(`/v1/commercial/agreements/${agreementId}/preview`));
  assert.equal(calls[0].method, 'GET');
});

test('a pending PDF preview cannot return a private link after the auth scope changes', async () => {
  let finish;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = api.preview(agreementId);

  store.getState().clear();
  finish(ok({ downloadUrl: 'https://storage.example.test/original.pdf', expiresInSeconds: 300 }));

  await assert.rejects(pending, (error) => error.code === 'AUTH.SCOPE_CHANGED');
});
