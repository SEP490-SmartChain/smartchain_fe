import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

let server;
let staffAccountApi;
let useAuthStore;
const originalFetch = globalThis.fetch;
const admin = {
  userId: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  email: 'admin@example.test',
  fullName: 'Tenant Admin',
  actorScope: 'TENANT',
  roles: ['SELLER_OWNER'],
  permissions: [],
};
const staff = {
  userId: '00000000-0000-4000-8000-000000000004',
  fullName: 'Test Staff',
  email: 'staff@example.test',
  roles: ['SELLER_STAFF'],
  lastSessionAt: '2026-09-10T02:00:00.000Z',
  status: 'ACTIVE',
};
const ok = (data, pagination) =>
  Response.json({
    success: true,
    data,
    meta: {
      timestamp: '2026-09-11T02:00:00.000Z',
      path: '',
      requestId: 'test',
      pagination,
    },
  });

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ staffAccountApi } = await server.ssrLoadModule(
    '/src/features/tenants/api/staffAccountApi.ts',
  ));
  ({ useAuthStore } = await server.ssrLoadModule('/src/stores/authStore.ts'));
});

after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

beforeEach(() => {
  useAuthStore.getState().clear();
  useAuthStore.getState().setSession({ accessToken: 'admin-token', expiresIn: 900, user: admin });
});

test('staff directory sends tenant filters through the authenticated API client', async () => {
  globalThis.fetch = async (url, options) => {
    const requestUrl = new URL(url, 'https://app.example.test');
    assert.equal(requestUrl.pathname, '/api/v1/iam/users');
    assert.equal(requestUrl.searchParams.get('limit'), '100');
    assert.equal(requestUrl.searchParams.get('search'), 'staff');
    assert.equal(requestUrl.searchParams.get('role'), 'SELLER_STAFF');
    assert.equal(requestUrl.searchParams.get('status'), 'ACTIVE');
    assert.equal(options.headers.get('Authorization'), 'Bearer admin-token');
    return ok([staff], { limit: 100, hasNext: false, nextCursor: null });
  };

  const page = await staffAccountApi.list({
    search: ' staff ',
    role: 'SELLER_STAFF',
    status: 'ACTIVE',
  });

  assert.deepEqual(page.items, [staff]);
  assert.deepEqual(page.pagination, { limit: 100, hasNext: false, nextCursor: null });
});

test('lock action uses PATCH with only the allowed status field', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, `/api/v1/iam/users/${staff.userId}/status`);
    assert.equal(options.method, 'PATCH');
    assert.equal(options.headers.get('Authorization'), 'Bearer admin-token');
    assert.deepEqual(JSON.parse(options.body), { status: 'LOCKED' });
    return ok({ ...staff, status: 'LOCKED' });
  };

  await assert.doesNotReject(staffAccountApi.changeStatus(staff.userId, 'LOCKED'));
});

test('malformed staff responses are rejected before reaching the UI', async () => {
  globalThis.fetch = async () =>
    ok([{ ...staff, status: 'SUSPENDED' }], {
      limit: 100,
      hasNext: false,
      nextCursor: null,
    });

  await assert.rejects(staffAccountApi.list({ search: '', role: '', status: '' }), {
    name: 'ZodError',
  });
});

test('updateProfile sends PATCH to /v1/iam/users/me and accepts user profile data', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/iam/users/me');
    assert.equal(options.method, 'PATCH');
    assert.deepEqual(JSON.parse(options.body), { phone: '0901234567' });
    return ok({
      userId: 'usr-12345',
      fullName: 'orca Admin',
      email: 'admin@orca.vn',
      phone: '0901234567',
      roles: ['SUPER_ADMIN'],
    });
  };

  const updated = await staffAccountApi.updateProfile('me', { phone: '0901234567' });
  assert.equal(updated.phone, '0901234567');
});

test('invitation validates name/email and normalizes the submitted identity', async () => {
  const { createStaffInvitationSchema } = await server.ssrLoadModule(
    '/src/features/tenants/schemas/staffInvitationSchema.ts',
  );
  const schema = createStaffInvitationSchema({
    nameLength: 'name-length',
    emailInvalid: 'email-invalid',
  });
  assert.deepEqual(
    schema.parse({
      fullName: '  Nguyen Van A  ',
      email: '  STAFF@EXAMPLE.TEST  ',
      tenantId: 'foreign',
      roleCode: 'ORCA_ADMIN',
    }),
    { fullName: 'Nguyen Van A', email: 'staff@example.test' },
  );
  for (const fullName of ['', ' ', 'A', 'A'.repeat(101)]) {
    assert.equal(schema.safeParse({ fullName, email: 'staff@example.test' }).success, false);
  }
  assert.equal(schema.safeParse({ fullName: 'Valid Name', email: 'invalid-email' }).success, false);
});

test('invitation posts only the fixed Seller Staff contract and preserves server PENDING', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/iam/users');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.get('Authorization'), 'Bearer admin-token');
    assert.deepEqual(JSON.parse(options.body), {
      fullName: 'Test Staff',
      email: 'staff@example.test',
      roleCode: 'SELLER_STAFF',
    });
    return ok({ ...staff, lastSessionAt: null, status: 'PENDING' });
  };
  const account = await staffAccountApi.create({
    fullName: 'Test Staff',
    email: 'staff@example.test',
    roleCode: 'ORCA_ADMIN',
    tenantId: 'other-seller',
    status: 'ACTIVE',
    password: 'must-not-be-sent',
  });
  assert.equal(account.status, 'PENDING');
  assert.equal(account.lastSessionAt, null);
});

test('a rejected duplicate invitation keeps the existing session', async () => {
  globalThis.fetch = async () =>
    Response.json(
      {
        success: false,
        error: { code: 'IAM.EMAIL_ALREADY_EXISTS', message: 'Already exists', statusCode: 409 },
      },
      { status: 409 },
    );
  await assert.rejects(
    staffAccountApi.create({ fullName: 'Test Staff', email: 'staff@example.test' }),
    (error) => error.status === 409,
  );
  assert.equal(useAuthStore.getState().user.userId, admin.userId);
});

test('invitation links reject missing or ambiguous tokens', async () => {
  const { readInvitationToken } = await server.ssrLoadModule(
    '/src/features/auth/api/staffInvitationApi.ts',
  );
  assert.equal(
    readInvitationToken('?token=tenant.synthetic-one-time-token'),
    'tenant.synthetic-one-time-token',
  );
  for (const search of [
    '',
    '?token=',
    '?token=one&token=two',
    '?token=%20one',
    '?token=' + 'a'.repeat(513),
  ])
    assert.equal(readInvitationToken(search), null);
});

test('accepting an invitation uses the public endpoint without changing the current session', async () => {
  const { acceptStaffInvitation } = await server.ssrLoadModule(
    '/src/features/auth/api/staffInvitationApi.ts',
  );
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/iam/users/accept-invitation');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.has('Authorization'), false);
    assert.deepEqual(JSON.parse(options.body), {
      token: 'synthetic-test-token',
      newPassword: 'SyntheticTest!123',
    });
    return ok(staff);
  };
  assert.equal(
    (await acceptStaffInvitation('synthetic-test-token', 'SyntheticTest!123')).status,
    'ACTIVE',
  );
  assert.equal(useAuthStore.getState().user.userId, admin.userId);
});

test('used or expired invitations surface the backend error and cannot grant a session', async () => {
  const { acceptStaffInvitation } = await server.ssrLoadModule(
    '/src/features/auth/api/staffInvitationApi.ts',
  );
  globalThis.fetch = async () =>
    Response.json(
      {
        success: false,
        error: { code: 'IAM.INVITATION_INVALID', message: 'Invalid invitation', statusCode: 400 },
      },
      { status: 400 },
    );
  await assert.rejects(
    acceptStaffInvitation('used-synthetic-token', 'SyntheticTest!123'),
    (error) => error.code === 'IAM.INVITATION_INVALID',
  );
  assert.equal(useAuthStore.getState().user.userId, admin.userId);
});

test('invitation acceptance rejects unexpected platform roles or an unactivated account', async () => {
  const { acceptStaffInvitation } = await server.ssrLoadModule(
    '/src/features/auth/api/staffInvitationApi.ts',
  );
  for (const response of [
    { ...staff, status: 'PENDING' },
    { ...staff, roles: ['ORCA_ADMIN'] },
  ]) {
    globalThis.fetch = async () => ok(response);
    await assert.rejects(acceptStaffInvitation('synthetic-token', 'SyntheticTest!123'), {
      name: 'ZodError',
    });
  }
});
