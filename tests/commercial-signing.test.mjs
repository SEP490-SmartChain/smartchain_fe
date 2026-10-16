import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { createServer } from 'vite';

let server,
  api,
  store,
  policy,
  safeUrl,
  profileSchema,
  shouldUseSigningWindow,
  launchSigningSession,
  PreparationForm;
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
  ({ shouldUseSigningWindow, launchSigningSession } = await server.ssrLoadModule(
    '/src/features/tenants/lib/signingPresentation.ts',
  ));
  ({ CommercialPreparationForm: PreparationForm } = await server.ssrLoadModule(
    '/src/features/tenants/components/CommercialPreparationForm.tsx',
  ));
});

test('reading sample terms never submits the contract preparation form', () => {
  const messages = JSON.parse(
    readFileSync(new URL('../messages/vi.json', import.meta.url), 'utf8'),
  );
  for (const requiresBusinessProfile of [true, false]) {
    const html = renderToStaticMarkup(
      createElement(
        NextIntlClientProvider,
        { locale: 'vi', timeZone: 'Asia/Ho_Chi_Minh', messages },
        createElement(PreparationForm, {
          plan: { requiresBusinessProfile },
          busy: false,
          onPreview: () => {},
          onSubmit: async () => {},
        }),
      ),
    );
    const buttons = [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)];
    const preview = buttons.find(([, , text]) => text === messages.Commercial.preview);
    const prepare = buttons.find(([, , text]) => text === messages.Commercial.confirmPrepare);
    assert.ok(preview, 'sample preview action must be present');
    assert.match(preview[1], /\btype="button"/, 'sample preview must not submit the form');
    assert.ok(prepare, 'explicit preparation action must be present');
    assert.match(prepare[1], /\btype="submit"/);
  }
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

test('a signing click reserves a detached popup before awaiting the authenticated link', async () => {
  const events = [];
  let finish;
  const popup = {
    opener: 'orca',
    location: { replace: (url) => events.push(url) },
    close: () => events.push('close'),
  };
  const pending = launchSigningSession(
    () => {
      events.push('open');
      return popup;
    },
    () => {
      assert.equal(popup.opener, null);
      events.push('request');
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    () => true,
  );
  assert.deepEqual(events, ['open', 'request']);
  finish({ signingUrl: 'https://app.signnow.com/sign/fixture' });
  assert.deepEqual(await pending, {
    signingUrl: 'https://app.signnow.com/sign/fixture',
    popupBlocked: false,
  });
  assert.deepEqual(events, ['open', 'request', 'https://app.signnow.com/sign/fixture']);
});

test('blocked popups preserve a signing fallback; hosted embedding needs no popup', async () => {
  for (const [open, popupBlocked] of [
    [() => null, true],
    [undefined, false],
  ]) {
    assert.deepEqual(
      await launchSigningSession(
        open,
        async () => ({ signingUrl: 'https://app.signnow.com/sign/fixture' }),
        () => true,
      ),
      { signingUrl: 'https://app.signnow.com/sign/fixture', popupBlocked },
    );
  }
});

test('scope changes close the reserved popup without loading a private signing link', async () => {
  let closeCount = 0;
  const popup = {
    opener: null,
    location: { replace: () => assert.fail('stale signing link must never navigate') },
    close: () => {
      closeCount++;
    },
  };
  assert.equal(
    await launchSigningSession(
      () => popup,
      async () => ({ signingUrl: 'https://app.signnow.com/sign/fixture' }),
      () => false,
    ),
    null,
  );
  assert.equal(closeCount, 1);
});

test('failed signing requests close the empty popup and retain the API error', async () => {
  let closed = false;
  const failure = new Error('fixture API failure');
  const popup = {
    opener: null,
    location: { replace: () => assert.fail('failed request must never navigate') },
    close: () => {
      closed = true;
    },
  };
  await assert.rejects(
    launchSigningSession(
      () => popup,
      async () => {
        throw failure;
      },
      () => true,
    ),
    (error) => error === failure,
  );
  assert.equal(closed, true);
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

test('mock payment posts only the contract reference and reads authoritative service status', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: JSON.parse(options.body) });
    return ok({ contractId: id, serviceStatus: 'ACTIVE', serviceVersion: 2 });
  };
  assert.deepEqual(await api.mockPayment(id), {
    contractId: id,
    serviceStatus: 'ACTIVE',
    serviceVersion: 2,
  });
  assert.deepEqual(calls, [
    { url: '/api/v1/commercial/mock-payments', method: 'POST', body: { contractId: id } },
  ]);
});

test('mock payment cannot confirm a malformed backend status or survive an auth scope change', async () => {
  globalThis.fetch = async () => ok({ contractId: id, serviceStatus: 'FAKE', serviceVersion: 2 });
  await assert.rejects(api.mockPayment(id));
  let finish;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = api.mockPayment(id);
  store.getState().clear();
  finish(ok({ contractId: id, serviceStatus: 'ACTIVE', serviceVersion: 2 }));
  await assert.rejects(pending, (error) => error.code === 'AUTH.SCOPE_CHANGED');
});
