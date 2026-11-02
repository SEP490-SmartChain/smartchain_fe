import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';

let server, api, commands, auth, client, ApiError, schemas;
const id = '00001314-0000-4000-8000-000000000001',
  warehouse = '00001314-0000-4000-8000-000000000002',
  item = '00001314-0000-4000-8000-000000000003';
const user = (roles = ['SELLER_OWNER'], scope = 'TENANT') => ({
  userId: id,
  tenantId: scope === 'TENANT' ? id : null,
  actorScope: scope,
  roles,
  permissions: [],
  warehouseIds: [warehouse],
  email: 'claims@example.test',
  fullName: 'Synthetic claim user',
});
const login = (roles, scope) =>
  auth
    .getState()
    .setSession({
      accessToken: 'synthetic-claims-token',
      expiresIn: 900,
      user: user(roles, scope),
    });
const input = {
  fulfillmentItemId: item,
  affectedQty: 2,
  incidentType: 'DAMAGED',
  declaredCostVnd: '150000',
  note: 'Synthetic damaged parcel evidence',
};
const result = {
  id,
  version: 1,
  status: 'OPEN',
  approvedAmountVnd: null,
  creditState: 'NOT_APPROVED',
};
const claim = {
  ...result,
  tenantId: id,
  warehouseId: warehouse,
  warehouseName: 'Synthetic HN',
  fulfillmentOrderId: id,
  fulfillmentItemId: item,
  orderReference: 'SYNTHETIC-1314',
  sequenceNo: 1,
  sku: 'SYNTHETIC-RICE',
  productName: 'Synthetic rice',
  returnOrderId: null,
  incidentType: 'DAMAGED',
  description: input.note,
  responsibility: null,
  affectedQty: 2,
  declaredCostVnd: '9007199254740993',
  declaredCostSource: 'ORDER_SNAPSHOT',
  contractId: id,
  contractCapVnd: '99999999999999999999',
  maximumCreditVnd: '18014398509481986',
  investigationNote: null,
  investigationCompletedAt: null,
  decisionNote: null,
  carrierDisputeId: null,
  carrierDisputeStatus: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  canAddEvidence: true,
  canInvestigate: false,
  canDecide: false,
  evidence: [],
  history: [],
};
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  schemas = await server.ssrLoadModule('/src/features/claims/api/claimsApi.ts');
  api = schemas.claimsApi;
  commands = await server.ssrLoadModule('/src/features/claims/api/claimCommands.ts');
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  ({ apiClient: client, ApiError } = await server.ssrLoadModule('/src/services/apiClient.ts'));
  login();
});
after(async () => server?.close());
test('claims retain exact VND strings and reject financial/recipient fields outside the contract', () => {
  assert.equal(schemas.claimSchema.parse(claim).declaredCostVnd, '9007199254740993');
  for (const value of [
    { ...claim, declaredCostVnd: 9007199254740992 },
    { ...claim, contractCapVnd: '1e20' },
    { ...claim, recipientPhone: '0900000000' },
    { ...claim, objectKey: 'private/object' },
    { ...claim, responsibility: 'WAREHOUSE' },
  ])
    assert.equal(schemas.claimSchema.safeParse(value).success, false);
});
test('claims bind requested identity, warehouse scope and cancellation signal', async () => {
  const get = client.get,
    calls = [],
    signal = new AbortController().signal;
  client.get = async (url, options) => {
    calls.push({ url, options });
    return { data: claim };
  };
  try {
    assert.equal((await api.get(id, { warehouseId: warehouse }, signal)).id, id);
    assert.equal(calls[0].url, `/v1/claims/${id}?warehouseId=${warehouse}`);
    assert.equal(calls[0].options.signal, signal);
    client.get = async () => ({ data: { ...claim, id: item } });
    await assert.rejects(api.get(id, {}, signal), /identity/);
  } finally {
    client.get = get;
  }
});
test('uncertain creation retries the original operation and exact payload once', async () => {
  login();
  const post = client.post,
    calls = [],
    signal = new AbortController().signal;
  client.post = async (url, body) => {
    calls.push({ url, body });
    if (calls.length === 1) throw new TypeError('Synthetic network timeout');
    return { data: { ...result, id: body.operationId } };
  };
  try {
    await assert.rejects(
      commands.sendClaimCommand({ kind: 'create', id: 'new', scope: {}, input }, signal),
    );
    const pending = commands.getPendingClaim('create', 'new');
    assert.ok(pending);
    await assert.rejects(
      commands.sendClaimCommand(
        { kind: 'create', id: 'new', scope: {}, input: { ...input, affectedQty: 3 } },
        signal,
      ),
      /PENDING_DIFFERENT_REQUEST/,
    );
    assert.equal(calls.length, 1);
    const replay = await commands.retryClaimCommand(pending, signal);
    assert.equal(replay.id, pending.operationId);
    assert.deepEqual(calls[1], calls[0]);
    assert.equal(commands.getPendingClaim('create', 'new'), undefined);
  } finally {
    client.post = post;
  }
});
test('definitive stale decisions require refreshed review instead of retaining an uncertain operation', async () => {
  login(['ORCA_ACCOUNTANT'], 'PLATFORM');
  const post = client.post,
    signal = new AbortController().signal;
  client.post = async () => {
    throw new ApiError('Synthetic stale case', 409, 'CLAIM.STALE_VERSION');
  };
  try {
    await assert.rejects(
      commands.sendClaimCommand(
        {
          kind: 'decide',
          id,
          scope: {},
          input: { expectedVersion: 2, decision: 'APPROVE', note: 'Synthetic Accountant review' },
        },
        signal,
      ),
    );
    assert.equal(commands.getPendingClaim('decide', id), undefined);
  } finally {
    client.post = post;
  }
});
test('role and actor-scope changes clear private pending requests and deny Staff mutations', async () => {
  login();
  const post = client.post;
  let calls = 0;
  client.post = async () => {
    calls++;
    throw new TypeError('Synthetic timeout');
  };
  try {
    await assert.rejects(
      commands.sendClaimCommand(
        { kind: 'create', id: 'new', scope: {}, input },
        new AbortController().signal,
      ),
    );
    assert.ok(commands.getPendingClaim('create', 'new'));
    login(['SELLER_STAFF']);
    assert.equal(commands.getPendingClaim('create', 'new'), undefined);
    await assert.rejects(
      commands.sendClaimCommand(
        { kind: 'create', id: 'new', scope: {}, input },
        new AbortController().signal,
      ),
      /FORBIDDEN/,
    );
    assert.equal(calls, 1);
    login(['ORCA_ACCOUNTANT'], 'TENANT');
    await assert.rejects(
      commands.sendClaimCommand(
        {
          kind: 'decide',
          id,
          scope: {},
          input: { expectedVersion: 2, decision: 'APPROVE', note: 'Mixed scope must fail' },
        },
        new AbortController().signal,
      ),
      /FORBIDDEN/,
    );
  } finally {
    client.post = post;
  }
});
test('a late command result from a replaced session cannot publish to the new scope', async () => {
  login();
  const post = client.post;
  let resolve;
  client.post = async (_url, body) =>
    new Promise((done) => {
      resolve = () => done({ data: { ...result, id: body.operationId } });
    });
  try {
    const work = commands.sendClaimCommand(
      { kind: 'create', id: 'new', scope: {}, input },
      new AbortController().signal,
    );
    const checked = assert.rejects(work, /SCOPE_CHANGED/);
    login(['ORCA_ADMIN'], 'PLATFORM');
    resolve();
    await checked;
    assert.equal(commands.getPendingClaim('create', 'new'), undefined);
  } finally {
    client.post = post;
  }
});
test('photo uploads reject a mismatched checksum before sending private bytes', async () => {
  const post = client.post,
    upload = client.uploadSignedImage;
  let uploads = 0;
  client.post = async () => ({
    data: {
      id: item,
      method: 'PUT',
      uploadUrl: 'https://storage.example.test/photo',
      expiresInSeconds: 900,
      headers: { 'Content-Type': 'image/png', 'x-amz-checksum-sha256': 'wrong' },
    },
  });
  client.uploadSignedImage = async () => {
    uploads++;
  };
  try {
    await assert.rejects(
      api.upload(
        id,
        1,
        new File([new Uint8Array(64)], 'synthetic.png', { type: 'image/png' }),
        item,
        {},
        new AbortController().signal,
      ),
      /EVIDENCE_INVALID/,
    );
    assert.equal(uploads, 0);
  } finally {
    client.post = post;
    client.uploadSignedImage = upload;
  }
});
test('photo verification preserves evidence identity, version and scoped signal', async () => {
  const post = client.post,
    upload = client.uploadSignedImage,
    calls = [],
    signal = new AbortController().signal;
  const bytes = new Uint8Array(64),
    checksum = createHash('sha256').update(bytes).digest('base64');
  client.post = async (url, body, options) => {
    calls.push({ url, body, options });
    return {
      data: url.includes('presign')
        ? {
            id: item,
            method: 'PUT',
            uploadUrl: 'https://storage.example.test/photo',
            expiresInSeconds: 900,
            headers: { 'Content-Type': 'image/png', 'x-amz-checksum-sha256': checksum },
          }
        : { id: item, verifiedAt: '2026-11-01T00:00:00.000Z' },
    };
  };
  client.uploadSignedImage = async (_url, _file, _headers, observed) => {
    assert.equal(observed, signal);
  };
  try {
    await api.upload(
      id,
      3,
      new File([bytes], 'synthetic.png', { type: 'image/png' }),
      item,
      { warehouseId: warehouse },
      signal,
    );
    assert.equal(calls[0].body.evidenceId, item);
    assert.equal(calls[1].body.expectedVersion, 3);
    assert.ok(calls[1].url.includes(`/evidence/${item}/confirm?warehouseId=${warehouse}`));
  } finally {
    client.post = post;
    client.uploadSignedImage = upload;
  }
});
test('private downloads reject executable or credential-bearing URLs', async () => {
  const get = client.get;
  try {
    for (const url of ['javascript:alert(1)', 'https://user:password@storage.example.test/photo']) {
      client.get = async () => ({ data: { downloadUrl: url, expiresInSeconds: 60 } });
      await assert.rejects(api.download(id, item, {}, new AbortController().signal));
    }
  } finally {
    client.get = get;
  }
});
test('a replaced session during image hashing cannot upload the previous user’s bytes', async () => {
  login();
  const post = client.post;
  let calls = 0,
    release;
  client.post = async () => {
    calls++;
    throw new Error('No storage request expected');
  };
  const file = new File([new Uint8Array(64)], 'synthetic.png', { type: 'image/png' });
  file.arrayBuffer = () =>
    new Promise((done) => {
      release = () => done(new Uint8Array(64).buffer);
    });
  try {
    const request = api.upload(id, 1, file, item, {}, new AbortController().signal);
    const rejected = assert.rejects(request, /SCOPE_CHANGED/);
    login(['ORCA_ADMIN'], 'PLATFORM');
    release();
    await rejected;
    assert.equal(calls, 0);
  } finally {
    client.post = post;
  }
});
test('a confirmed photo with a lost response reconciles from the authorized claim snapshot', async () => {
  login();
  const post = client.post,
    get = client.get;
  client.post = async () => {
    throw new TypeError('Synthetic lost confirmation response');
  };
  client.get = async () => ({
    data: {
      ...claim,
      version: 2,
      evidence: [
        {
          id: item,
          contentType: 'image/png',
          fileSizeBytes: 64,
          sha256: 'a'.repeat(64),
          verifiedAt: '2026-11-01T00:00:01.000Z',
          createdAt: '2026-11-01T00:00:00.000Z',
          canConfirm: false,
        },
      ],
    },
  });
  try {
    assert.deepEqual(await api.confirm(id, item, 1, {}, new AbortController().signal), {
      id: item,
      verifiedAt: '2026-11-01T00:00:01.000Z',
    });
  } finally {
    client.post = post;
    client.get = get;
  }
});
