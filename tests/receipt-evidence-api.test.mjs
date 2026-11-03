import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
let server, api, auth, policy, client, imageIntent;
const originalFetch = globalThis.fetch;
const id = '00000000-0000-4000-8000-000000000001',
  warehouse = '00000000-0000-4000-8000-000000000002',
  record = '00000000-0000-4000-8000-000000000003';
const photo = {
  id,
  receivingRecordId: record,
  contentType: 'image/png',
  fileSizeBytes: 68,
  createdAt: '2026-10-12T01:00:00.000Z',
  verifiedAt: null,
};
const input = {
  operationKey: id,
  contentType: 'image/png',
  fileSizeBytes: 68,
  sha256: 'a'.repeat(64),
};
const signed = {
  method: 'PUT',
  uploadUrl: 'https://storage.example.test/private-photo',
  expiresInSeconds: 900,
  headers: {
    'Content-Type': 'image/png',
    'x-amz-checksum-sha256': Buffer.from(input.sha256, 'hex').toString('base64'),
  },
};
const ok = (data) => Response.json({ success: true, data, meta: {} });
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  ({ evidenceApi: api, imageIntent } = await server.ssrLoadModule(
    '/src/features/inbound/api/evidenceApi.ts',
  ));
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  ({ apiClient: client } = await server.ssrLoadModule('/src/services/apiClient.ts'));
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  auth.getState().setSession({
    accessToken: 'synthetic-photo-token',
    expiresIn: 900,
    user: {
      userId: id,
      tenantId: null,
      email: 'staff@example.test',
      fullName: 'Photo Staff',
      actorScope: 'PLATFORM',
      roles: ['WAREHOUSE_STAFF'],
      permissions: [],
    },
  });
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

test('receipt-level video uploads are available before any counted lot exists', async () => {
  const media = {
    ...photo,
    receivingRecordId: null,
    receiptId: record,
    contentType: 'video/mp4',
    fileSizeBytes: 6 * 1024 * 1024,
  };
  globalThis.fetch = async (url) => {
    assert.equal(
      new URL(url, 'https://example.test').pathname,
      `/api/v1/warehouses/${warehouse}/asns/${id}/receiving/evidence`,
    );
    return ok({ items: [media] });
  };
  assert.deepEqual(await api.list(warehouse, id, null), [media]);
  globalThis.fetch = async () => ok({ items: [{ ...media, receiptId: undefined }] });
  await assert.rejects(api.list(warehouse, id, null));
});

test('media limits retain 5 MB for images and allow video up to 50 MB', async () => {
  const video = new File([new Uint8Array(6 * 1024 * 1024)], 'unpacking.webm', {
    type: 'video/webm',
  });
  const intent = await imageIntent(video, id);
  assert.equal(intent.contentType, 'video/webm');
  assert.equal(intent.fileSizeBytes, video.size);
  await assert.rejects(
    imageIntent(
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' }),
      id,
    ),
  );
  await assert.rejects(
    imageIntent(
      new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'large.mp4', { type: 'video/mp4' }),
      id,
    ),
  );
});

test('LAN HTTP upload computes the same SHA-256 when WebCrypto is unavailable', async () => {
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} });
    const bytes = new TextEncoder().encode('receipt-evidence-on-lan');
    const intent = await imageIntent(new File([bytes], 'receipt.jpg', { type: 'image/jpeg' }), id);
    const { createHash } = await import('node:crypto');
    assert.equal(intent.sha256, createHash('sha256').update(bytes).digest('hex'));
  } finally {
    if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
  }
});
test('photo list requires scoped record identity and excludes internal fields', async () => {
  globalThis.fetch = async (url) => {
    assert.equal(
      new URL(url, 'https://example.test').pathname,
      `/api/v1/warehouses/${warehouse}/asns/${id}/receiving/records/${record}/evidence`,
    );
    return ok({ items: [photo] });
  };
  assert.deepEqual(await api.list(warehouse, id, record), [photo]);
  for (const extra of [
    { objectKey: 'private' },
    { sha256: 'a'.repeat(64) },
    { uploadedByPlatformUserId: id },
    { tenantId: id },
  ]) {
    globalThis.fetch = async () => ok({ items: [{ ...photo, ...extra }] });
    await assert.rejects(api.list(warehouse, id, record), { name: 'ZodError' });
  }
  globalThis.fetch = async () => ok({ items: [{ ...photo, receivingRecordId: id }] });
  await assert.rejects(api.list(warehouse, id, record), /another receiving/);
  globalThis.fetch = async () => ok({ items: [photo, photo] });
  await assert.rejects(api.list(warehouse, id, record), /Duplicate/);
});
test('presign preserves operation and exact signed image metadata', async () => {
  const operations = [];
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    operations.push(body.operationKey);
    assert.deepEqual(body, input);
    return ok({ evidence: photo, upload: signed });
  };
  assert.deepEqual(await api.presign(warehouse, id, record, input), {
    evidence: photo,
    upload: signed,
  });
  await api.presign(warehouse, id, record, input);
  assert.deepEqual(operations, [id, id]);
});
test('presign rejects inconsistent ownership, size, MIME, confirmation and checksum', async () => {
  for (const response of [
    { evidence: { ...photo, receivingRecordId: id }, upload: signed },
    { evidence: { ...photo, fileSizeBytes: 69 }, upload: signed },
    { evidence: photo, upload: null },
    { evidence: { ...photo, verifiedAt: '2026-10-12T01:01:00.000Z' }, upload: signed },
    {
      evidence: photo,
      upload: { ...signed, headers: { ...signed.headers, 'Content-Type': 'image/jpeg' } },
    },
    {
      evidence: photo,
      upload: {
        ...signed,
        headers: {
          ...signed.headers,
          'x-amz-checksum-sha256': Buffer.alloc(32).toString('base64'),
        },
      },
    },
  ]) {
    globalThis.fetch = async () => ok(response);
    await assert.rejects(api.presign(warehouse, id, record, input));
  }
});
test('signed upload URLs and headers cannot contain credentials, app authorization or unsafe protocols', async () => {
  for (const upload of [
    { ...signed, uploadUrl: 'javascript:alert(1)' },
    { ...signed, uploadUrl: 'http://storage.example.test/plaintext' },
    { ...signed, uploadUrl: 'https://user:password@storage.example.test/private' },
    { ...signed, headers: { ...signed.headers, Authorization: 'should-never-be-sent' } },
    { ...signed, expiresInSeconds: 901 },
  ]) {
    globalThis.fetch = async () => ok({ evidence: photo, upload });
    await assert.rejects(api.presign(warehouse, id, record, input), { name: 'ZodError' });
  }
});
test('confirmed presign replay returns no new upload', async () => {
  globalThis.fetch = async () =>
    ok({ evidence: { ...photo, verifiedAt: '2026-10-12T01:01:00.000Z' }, upload: null });
  assert.equal((await api.presign(warehouse, id, record, input)).upload, null);
});
test('confirmation requires the requested image, record and verified timestamp', async () => {
  globalThis.fetch = async () => ok({ ...photo, verifiedAt: '2026-10-12T01:01:00.000Z' });
  assert.ok((await api.confirm(warehouse, id, record, id)).verifiedAt);
  for (const bad of [
    photo,
    { ...photo, id: record, verifiedAt: '2026-10-12T01:01:00.000Z' },
    { ...photo, receivingRecordId: id, verifiedAt: '2026-10-12T01:01:00.000Z' },
    { ...photo, verifiedAt: '2026-10-11T01:00:00.000Z' },
  ]) {
    globalThis.fetch = async () => ok(bad);
    await assert.rejects(api.confirm(warehouse, id, record, id));
  }
});
test('private download checks requested photo identity and five minute expiry', async () => {
  globalThis.fetch = async () =>
    ok({ id, downloadUrl: 'https://storage.example.test/private', expiresInSeconds: 300 });
  assert.equal((await api.download(warehouse, id, record, id)).expiresInSeconds, 300);
  for (const bad of [
    { id: record, downloadUrl: 'https://storage.example.test/private', expiresInSeconds: 300 },
    { id, downloadUrl: 'https://storage.example.test/private', expiresInSeconds: 301 },
  ]) {
    globalThis.fetch = async () => ok(bad);
    await assert.rejects(api.download(warehouse, id, record, id));
  }
});
test('direct image PUT sends only signed headers and no app credentials, JSON or refresh', async () => {
  const file = new File([new Uint8Array(68)], 'synthetic.png', { type: 'image/png' });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, signed.uploadUrl);
    assert.equal(options.method, 'PUT');
    assert.equal(options.body, file);
    assert.deepEqual(options.headers, signed.headers);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    return new Response(null, { status: 200 });
  };
  await client.uploadSignedImage(signed.uploadUrl, file, signed.headers);
});
test('direct upload rejects unsafe destination and surfaces storage failure', async () => {
  const file = new File([new Uint8Array(68)], 'synthetic.png', { type: 'image/png' });
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(null, { status: 403 });
  };
  await assert.rejects(
    client.uploadSignedImage('http://unsafe.example.test/image', file, signed.headers),
    /Invalid/,
  );
  assert.equal(calls, 0);
  await assert.rejects(client.uploadSignedImage(signed.uploadUrl, file, signed.headers), /403/);
  assert.equal(calls, 1);
});
test('image intent hashes actual bytes and rejects unsupported type or oversize', async () => {
  const file = new File([new Uint8Array(68)], 'synthetic.png', { type: 'image/png' });
  const result = await imageIntent(file, id);
  assert.equal(result.operationKey, id);
  assert.equal(result.sha256.length, 64);
  assert.equal(result.fileSizeBytes, 68);
  for (const file of [
    new File(['text'], 'bad.txt', { type: 'text/plain' }),
    new File([new Uint8Array(11)], 'small.png', { type: 'image/png' }),
    new File([new Uint8Array(5242881)], 'huge.png', { type: 'image/png' }),
  ])
    await assert.rejects(imageIntent(file, id));
});
test('upload capability belongs to Warehouse Staff and fails closed for mixed/legacy scope', () => {
  for (const role of [
    'SELLER_OWNER',
    'SELLER_STAFF',
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'ORCA_ACCOUNTANT',
  ])
    assert.equal(policy.can([role], 'warehouse.asn.uploadPhoto'), role === 'WAREHOUSE_STAFF');
  for (const roles of [['WAREHOUSE_STAFF', 'SELLER_OWNER'], ['WAREHOUSE_ADMIN'], []])
    assert.equal(policy.can(roles, 'warehouse.asn.uploadPhoto'), false);
});
