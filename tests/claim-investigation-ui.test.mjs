import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { createServer } from 'vite';

let server, Form, auth, policy;
const messages = JSON.parse(readFileSync(new URL('../messages/vi.json', import.meta.url), 'utf8'));
const claim = {
  id: '00001314-0000-4000-8000-000000000001',
  version: 4,
  status: 'INVESTIGATING',
  responsibility: 'ORCA_WAREHOUSE',
  investigationNote: 'Đã đối chiếu ảnh tại kho',
  investigationCompletedAt: '2026-11-03T12:00:00Z',
  evidence: [{ verifiedAt: '2026-11-03T11:00:00Z' }],
  canInvestigate: true,
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
  ({ ClaimReviewForm: Form } = await server.ssrLoadModule(
    '/src/features/claims/components/ClaimReviewForm.tsx',
  ));
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
});
after(async () => server?.close());
function render(overrides = {}, role = 'OPS_DISPATCHER') {
  auth.getState().setSession({
    accessToken: 'synthetic',
    expiresIn: 900,
    user: {
      userId: claim.id,
      tenantId: role === 'SELLER_OWNER' ? claim.id : null,
      actorScope: role === 'SELLER_OWNER' ? 'TENANT' : 'PLATFORM',
      roles: [role],
      permissions: [],
      warehouseIds: [],
      email: 'test@example.test',
      fullName: 'Synthetic',
    },
  });
  // Zustand's server snapshot is the initial state; seed it for this SSR-only render.
  auth.getInitialState().user = auth.getState().user;
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'vi', messages, timeZone: 'Asia/Ho_Chi_Minh' },
      createElement(Form, {
        claim: { ...claim, ...overrides },
        mode: 'investigate',
        scope: {},
        signal: new AbortController().signal,
        onChanged() {},
      }),
    ),
  );
}
test('completed Ops investigation shows saved summary and explicit update, without a blank form', () => {
  const html = render();
  assert.match(html, /Đã đối chiếu ảnh tại kho/);
  assert.match(html, /Chờ kế toán xem xét/);
  assert.match(html, /Cập nhật điều tra/);
  assert.doesNotMatch(html, /<form|<textarea|type="checkbox"/);
  assert.equal((html.match(/Điều tra của Ops/g) ?? []).length, 1);
});
test('saved draft is collapsed but explicitly requires completion', () => {
  const html = render({ investigationCompletedAt: null });
  assert.match(html, /Đã đối chiếu ảnh tại kho/);
  assert.match(html, /Chờ Ops hoàn tất/);
  assert.match(html, /Cập nhật điều tra/);
  assert.doesNotMatch(html, /<form/);
});
test('first investigation opens a form; read-only roles never receive Ops edit actions', () => {
  assert.match(render({ investigationNote: null, investigationCompletedAt: null }), /<form/);
  for (const role of ['SELLER_OWNER', 'ORCA_ACCOUNTANT', 'ORCA_ADMIN']) {
    const html = render({}, role);
    assert.match(html, /Đã đối chiếu ảnh tại kho/);
    assert.doesNotMatch(html, /Cập nhật điều tra|<form/);
  }
  assert.equal(
    render({ investigationNote: null, investigationCompletedAt: null }, 'SELLER_OWNER'),
    '',
  );
});
test('closed investigation remains read-only even for Ops', () => {
  assert.doesNotMatch(
    render({ status: 'APPROVED', canInvestigate: false }),
    /Cập nhật điều tra|<form|Chờ kế toán xem xét/,
  );
});
test('evidence terminology describes the business purpose and scoped access', () => {
  assert.equal(messages.Claims.evidence, 'Ảnh minh chứng');
  assert.equal(messages.Claims.addPhoto, 'Thêm ảnh minh chứng');
  assert.match(messages.Claims.evidenceHint, /quyền truy cập/);
});
test('photo upload stays with Owner and Ops; investigation and decision remain separate duties', () => {
  for (const role of [
    'SELLER_OWNER',
    'SELLER_STAFF',
    'OPS_DISPATCHER',
    'WH_MANAGER',
    'WH_STAFF',
    'ORCA_ACCOUNTANT',
    'ORCA_ADMIN',
  ]) {
    assert.equal(
      policy.can([role], 'claims.evidence.add'),
      ['SELLER_OWNER', 'OPS_DISPATCHER'].includes(role),
      role,
    );
    assert.equal(policy.can([role], 'claims.investigate'), role === 'OPS_DISPATCHER', role);
    assert.equal(policy.can([role], 'claims.decide'), role === 'ORCA_ACCOUNTANT', role);
  }
});
