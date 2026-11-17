import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const claimId = '00001314-0000-4000-8000-000000000001';
const warehouseId = '00001314-0000-4000-8000-000000000002';
const otherWarehouseId = '00001314-0000-4000-8000-000000000003';
const evidenceId = '00001314-0000-4000-8000-000000000004';
const cursorId = '00001314-0000-4000-8000-000000000005';
const task = {
  claimId,
  fulfillmentOrderId: '00001314-0000-4000-8000-000000000006',
  sequenceNo: 2,
  incidentType: 'DAMAGED',
  status: 'OPEN',
  version: 3,
  canSubmitEvidence: true,
};
const imageBytes = new Uint8Array(64).fill(42);
const image = () => new File([imageBytes], 'synthetic.png', { type: 'image/png' });

let server;
let api;
let pageSchema;
let draft;
let auth;
let client;
let ApiError;
let handleTaskLoadFailure;

function setSession(roles = ['WAREHOUSE_MANAGER'], warehouseIds = [warehouseId]) {
  auth.getState().setSession({
    accessToken: 'synthetic-evidence-task-token',
    expiresIn: 900,
    user: {
      userId: claimId,
      tenantId: null,
      email: 'evidence-task@example.test',
      fullName: 'Synthetic evidence-task user',
      actorScope: roles.some((role) => ['SELLER_OWNER', 'SELLER_STAFF'].includes(role))
        ? 'TENANT'
        : 'PLATFORM',
      roles,
      permissions: [],
      warehouseIds,
    },
  });
}

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  const loaded = await server.ssrLoadModule(
    '/src/features/claims/api/warehouseEvidenceTasksApi.ts',
  );
  api = loaded.warehouseEvidenceTasksApi;
  pageSchema = loaded.warehouseEvidenceTaskPageSchema;
  draft = await server.ssrLoadModule('/src/features/claims/lib/warehouseEvidenceDraft.ts');
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  ({ apiClient: client, ApiError } = await server.ssrLoadModule('/src/services/apiClient.ts'));
  ({ handleWarehouseEvidenceTaskLoadFailure: handleTaskLoadFailure } = await server.ssrLoadModule(
    '/src/features/claims/hooks/useWarehouseEvidenceTasks.ts',
  ));
  setSession();
});

after(async () => server?.close());

test('warehouse evidence task pages strictly enforce the privacy allowlist', () => {
  assert.deepEqual(pageSchema.parse({ items: [task], nextAfter: cursorId }), {
    items: [task],
    nextAfter: cursorId,
  });
  for (const invalid of [
    { items: [{ ...task, approvedAmountVnd: '100' }], nextAfter: null },
    { items: [{ ...task, evidence: [] }], nextAfter: null },
    { items: [{ ...task, recipientPhone: '0900000000' }], nextAfter: null },
    { items: [task], nextAfter: cursorId, total: 1 },
  ]) {
    assert.equal(pageSchema.safeParse(invalid).success, false);
  }
});

test('the dedicated task endpoint binds the assigned warehouse, exclusive cursor and request signal', async () => {
  setSession();
  const get = client.get;
  const signal = new AbortController().signal;
  const calls = [];
  client.get = async (url, options) => {
    calls.push({ url, options });
    return { data: { items: [task], nextAfter: cursorId } };
  };
  try {
    assert.deepEqual(await api.listTasks(warehouseId, signal, cursorId), {
      items: [task],
      nextAfter: cursorId,
    });
    assert.equal(
      calls[0].url,
      `/v1/claims/evidence-tasks?warehouseId=${warehouseId}&after=${cursorId}`,
    );
    assert.equal(calls[0].options.signal, signal);
    assert.equal(calls[0].options.silent, true);
  } finally {
    client.get = get;
  }
});

test('only the Warehouse Manager role receives task view and evidence-submit API access', async () => {
  const get = client.get;
  const post = client.post;
  const calls = [];
  client.get = async (url) => {
    calls.push(['GET', url]);
    return { data: { items: [task], nextAfter: null } };
  };
  client.post = async (url) => {
    calls.push(['POST', url]);
    throw new Error('Unexpected mutation request');
  };
  const roles = [
    'ORCA_ADMIN',
    'OPS_DISPATCHER',
    'WAREHOUSE_MANAGER',
    'WAREHOUSE_STAFF',
    'ORCA_ACCOUNTANT',
    'SELLER_OWNER',
    'SELLER_STAFF',
  ];
  try {
    for (const role of roles) {
      setSession([role]);
      if (role === 'WAREHOUSE_MANAGER') {
        assert.deepEqual(await api.listTasks(warehouseId, new AbortController().signal), {
          items: [task],
          nextAfter: null,
        });
      } else {
        await assert.rejects(
          api.listTasks(warehouseId, new AbortController().signal),
          (error) => error.code === 'AUTH.FORBIDDEN',
          `${role} must not read the evidence task projection`,
        );
        await assert.rejects(
          api.uploadEvidence({
            warehouseId,
            claimId,
            evidenceId,
            expectedVersion: task.version,
            file: image(),
            signal: new AbortController().signal,
          }),
          (error) => error.code === 'AUTH.FORBIDDEN',
          `${role} must not submit warehouse evidence`,
        );
      }
    }
    assert.deepEqual(
      calls.map(([method]) => method),
      ['GET'],
    );
  } finally {
    client.get = get;
    client.post = post;
    setSession();
  }
});

test('missing and different warehouse assignments deny task reads before network access', async () => {
  const get = client.get;
  let calls = 0;
  client.get = async () => {
    calls++;
    return { data: { items: [], nextAfter: null } };
  };
  try {
    for (const assignments of [[], [otherWarehouseId]]) {
      setSession(['WAREHOUSE_MANAGER'], assignments);
      await assert.rejects(
        api.listTasks(warehouseId, new AbortController().signal),
        (error) => error.code === 'AUTH.FORBIDDEN',
      );
    }
    assert.equal(calls, 0);
  } finally {
    client.get = get;
    setSession();
  }
});

test('missing and different assignments deny evidence uploads before hashing or presign', async () => {
  const post = client.post;
  let presignCalls = 0;
  let hashCalls = 0;
  const file = image();
  file.arrayBuffer = async () => {
    hashCalls++;
    return imageBytes.buffer;
  };
  client.post = async () => {
    presignCalls++;
    throw new Error('No presign request is expected without the selected assignment');
  };
  try {
    for (const assignments of [[], [otherWarehouseId]]) {
      setSession(['WAREHOUSE_MANAGER'], assignments);
      await assert.rejects(
        api.uploadEvidence({
          warehouseId,
          claimId,
          evidenceId,
          expectedVersion: task.version,
          file,
          signal: new AbortController().signal,
        }),
        (error) => error.code === 'AUTH.FORBIDDEN',
      );
    }
    assert.equal(hashCalls, 0);
    assert.equal(presignCalls, 0);
  } finally {
    client.post = post;
    setSession();
  }
});

test('revoking the manager assignment after PUT prevents confirm', async () => {
  setSession();
  const post = client.post;
  const upload = client.uploadSignedImage;
  const calls = [];
  let uploads = 0;
  const checksumBase64 = createHash('sha256').update(imageBytes).digest('base64');
  client.post = async (url) => {
    calls.push(url);
    if (!url.includes('/presign'))
      throw new Error('Confirm must not be sent after assignment revocation');
    return {
      data: {
        id: evidenceId,
        method: 'PUT',
        uploadUrl: 'https://storage.example.test/signed-image',
        expiresInSeconds: 600,
        headers: {
          'Content-Type': 'image/png',
          'x-amz-checksum-sha256': checksumBase64,
        },
      },
    };
  };
  client.uploadSignedImage = async () => {
    uploads++;
    setSession(['WAREHOUSE_MANAGER'], []);
  };
  try {
    await assert.rejects(
      api.uploadEvidence({
        warehouseId,
        claimId,
        evidenceId,
        expectedVersion: task.version,
        file: image(),
        signal: new AbortController().signal,
      }),
      /CLAIM\.SCOPE_CHANGED/,
    );
    assert.equal(uploads, 1);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].endsWith(`/evidence/presign?warehouseId=${warehouseId}`));
  } finally {
    client.post = post;
    client.uploadSignedImage = upload;
    setSession();
  }
});

test('revoking the manager assignment while hashing prevents a presign request', async () => {
  setSession();
  const post = client.post;
  let calls = 0;
  let releaseHash;
  const file = image();
  file.arrayBuffer = () =>
    new Promise((resolve) => (releaseHash = () => resolve(imageBytes.buffer)));
  client.post = async () => {
    calls++;
    throw new Error('No presign request is expected after scope change');
  };
  try {
    const request = api.uploadEvidence({
      warehouseId,
      claimId,
      evidenceId,
      expectedVersion: task.version,
      file,
      signal: new AbortController().signal,
    });
    const rejected = assert.rejects(request, /CLAIM\.SCOPE_CHANGED/);
    setSession(['WAREHOUSE_MANAGER'], []);
    releaseHash();
    await rejected;
    assert.equal(calls, 0);
  } finally {
    client.post = post;
    setSession();
  }
});

test('upload uses exact metadata, server-signed headers, raw bytes, and the scoped confirm contract', async () => {
  setSession();
  const post = client.post;
  const upload = client.uploadSignedImage;
  const calls = [];
  const signal = new AbortController().signal;
  const file = image();
  const checksumHex = createHash('sha256').update(imageBytes).digest('hex');
  const checksumBase64 = createHash('sha256').update(imageBytes).digest('base64');
  const signedHeaders = {
    'Content-Type': 'image/png',
    'x-amz-checksum-sha256': checksumBase64,
  };
  let uploaded;
  client.post = async (url, body, options) => {
    calls.push({ url, body, options });
    return {
      data: url.includes('/presign')
        ? {
            id: evidenceId,
            method: 'PUT',
            uploadUrl: 'https://storage.example.test/signed-image',
            expiresInSeconds: 600,
            headers: signedHeaders,
          }
        : {
            id: evidenceId,
            verifiedAt: '2026-11-01T00:00:00.000Z',
            version: task.version + 1,
          },
    };
  };
  client.uploadSignedImage = async (url, rawFile, headers, observedSignal) => {
    uploaded = { url, rawFile, headers, observedSignal };
  };
  try {
    assert.deepEqual(
      await api.uploadEvidence({
        warehouseId,
        claimId,
        evidenceId,
        expectedVersion: task.version,
        file,
        signal,
      }),
      { id: evidenceId, verifiedAt: '2026-11-01T00:00:00.000Z', version: 4 },
    );
    assert.deepEqual(calls, [
      {
        url: `/v1/claims/evidence-tasks/${claimId}/evidence/presign?warehouseId=${warehouseId}`,
        body: {
          expectedVersion: task.version,
          evidenceId,
          contentType: 'image/png',
          fileSizeBytes: imageBytes.byteLength,
          sha256: checksumHex,
        },
        options: { signal, silent: true },
      },
      {
        url: `/v1/claims/evidence-tasks/${claimId}/evidence/${evidenceId}/confirm?warehouseId=${warehouseId}`,
        body: { expectedVersion: task.version },
        options: { signal, silent: true },
      },
    ]);
    assert.deepEqual(uploaded, {
      url: 'https://storage.example.test/signed-image',
      rawFile: file,
      headers: signedHeaders,
      observedSignal: signal,
    });
  } finally {
    client.post = post;
    client.uploadSignedImage = upload;
  }
});

test('a frozen presign intent retries confirm with the same ID and never reuploads bytes', async () => {
  setSession();
  const post = client.post;
  const upload = client.uploadSignedImage;
  const calls = [];
  let uploads = 0;
  client.post = async (url, body, options) => {
    calls.push({ url, body, options });
    if (url.includes('/presign')) {
      throw new ApiError('Synthetic confirmed intent', 409, 'CLAIM.EVIDENCE_FROZEN');
    }
    return {
      data: {
        id: evidenceId,
        verifiedAt: '2026-11-01T00:00:00.000Z',
        version: task.version + 1,
      },
    };
  };
  client.uploadSignedImage = async () => {
    uploads++;
  };
  try {
    assert.equal(
      (
        await api.uploadEvidence({
          warehouseId,
          claimId,
          evidenceId,
          expectedVersion: task.version,
          file: image(),
          signal: new AbortController().signal,
        })
      ).version,
      4,
    );
    assert.equal(calls.length, 2);
    assert.ok(calls[0].url.endsWith(`/evidence/presign?warehouseId=${warehouseId}`));
    assert.ok(calls[1].url.endsWith(`/evidence/${evidenceId}/confirm?warehouseId=${warehouseId}`));
    assert.equal(calls[1].body.expectedVersion, task.version);
    assert.equal(uploads, 0);
  } finally {
    client.post = post;
    client.uploadSignedImage = upload;
  }
});

test('image validation enforces JPEG, PNG, WebP and the inclusive 12-byte to 5-MiB limit', async () => {
  const { isSupportedWarehouseEvidenceImage } = await server.ssrLoadModule(
    '/src/features/claims/api/warehouseEvidenceTasksApi.ts',
  );
  assert.equal(
    isSupportedWarehouseEvidenceImage(
      new File([new Uint8Array(12)], 'a.jpg', { type: 'image/jpeg' }),
    ),
    true,
  );
  assert.equal(
    isSupportedWarehouseEvidenceImage(
      new File([new Uint8Array(5242880)], 'a.webp', { type: 'image/webp' }),
    ),
    true,
  );
  assert.equal(
    isSupportedWarehouseEvidenceImage(
      new File([new Uint8Array(11)], 'small.png', { type: 'image/png' }),
    ),
    false,
  );
  assert.equal(
    isSupportedWarehouseEvidenceImage(
      new File([new Uint8Array(5242881)], 'large.png', { type: 'image/png' }),
    ),
    false,
  );
  assert.equal(
    isSupportedWarehouseEvidenceImage(
      new File([new Uint8Array(20)], 'bad.svg', { type: 'image/svg+xml' }),
    ),
    false,
  );
});

test('uncertain upload keeps the same pending evidence ID; expiration starts a new intent; warehouse change clears local file state', () => {
  let state = draft.createWarehouseEvidenceUiState(warehouseId);
  state = draft.warehouseEvidenceUiReducer(state, {
    type: 'tasksLoaded',
    warehouseId,
    after: null,
    page: { items: [task], nextAfter: null },
  });
  state = draft.warehouseEvidenceUiReducer(state, { type: 'taskSelected', claimId });
  const file = image();
  state = draft.warehouseEvidenceUiReducer(state, { type: 'fileSelected', file });
  const firstIntent = { claimId, expectedVersion: task.version, evidenceId, file };
  state = draft.warehouseEvidenceUiReducer(state, { type: 'uploadStarted', intent: firstIntent });
  state = draft.warehouseEvidenceUiReducer(state, { type: 'uploadFailed', mode: 'retry' });
  assert.equal(state.uploadState, 'retry');
  assert.equal(state.pending.evidenceId, evidenceId);
  assert.equal(state.pending.file, file);

  state = draft.warehouseEvidenceUiReducer(state, { type: 'uploadStarted', intent: state.pending });
  assert.equal(state.pending.evidenceId, evidenceId);
  state = draft.warehouseEvidenceUiReducer(state, { type: 'uploadFailed', mode: 'expired' });
  assert.equal(state.pending, null);
  assert.equal(state.selectedFile, file);
  assert.equal(state.uploadError, 'expired');

  const newIntent = { ...firstIntent, evidenceId: cursorId };
  state = draft.warehouseEvidenceUiReducer(state, { type: 'uploadStarted', intent: newIntent });
  assert.equal(state.pending.evidenceId, cursorId);
  state = draft.warehouseEvidenceUiReducer(state, {
    type: 'warehouseChanged',
    warehouseId: otherWarehouseId,
  });
  assert.equal(state.tasks.length, 0);
  assert.equal(state.selectedClaimId, null);
  assert.equal(state.selectedFile, null);
  assert.equal(state.pending, null);
  assert.equal(state.warehouseId, otherWarehouseId);
});

test('tasks that become unavailable clear selected image and pending intent', () => {
  let state = draft.createWarehouseEvidenceUiState(warehouseId);
  state = draft.warehouseEvidenceUiReducer(state, {
    type: 'tasksLoaded',
    warehouseId,
    after: null,
    page: { items: [task], nextAfter: null },
  });
  state = draft.warehouseEvidenceUiReducer(state, { type: 'taskSelected', claimId });
  const file = image();
  const intent = { claimId, expectedVersion: task.version, evidenceId, file };
  state = draft.warehouseEvidenceUiReducer(state, { type: 'uploadStarted', intent });
  state = draft.warehouseEvidenceUiReducer(state, {
    type: 'tasksLoaded',
    warehouseId,
    after: null,
    page: { items: [{ ...task, canSubmitEvidence: false }], nextAfter: null },
  });
  assert.equal(state.selectedClaimId, null);
  assert.equal(state.selectedFile, null);
  assert.equal(state.pending, null);
  assert.equal(state.uploadState, 'idle');
  assert.equal(state.uploadError, 'restart');
});

test('denied list scope clears evidence state and aborts an in-flight upload', () => {
  for (const error of [
    new ApiError('Unauthorized', 401, 'AUTH.UNAUTHENTICATED'),
    new ApiError('Forbidden', 403, 'AUTH.FORBIDDEN'),
    new ApiError('Not found', 404, 'HTTP.NOT_FOUND'),
    new Error('CLAIM.SCOPE_CHANGED'),
  ]) {
    let state = draft.createWarehouseEvidenceUiState(warehouseId);
    const dispatch = (action) => {
      state = draft.warehouseEvidenceUiReducer(state, action);
    };
    const file = image();
    const pending = { claimId, expectedVersion: task.version, evidenceId, file };
    dispatch({ type: 'loadStarted', mode: 'initial' });
    dispatch({
      type: 'tasksLoaded',
      warehouseId,
      after: null,
      page: { items: [task], nextAfter: cursorId },
    });
    dispatch({ type: 'taskSelected', claimId });
    dispatch({ type: 'fileSelected', file });
    dispatch({ type: 'uploadStarted', intent: pending });
    dispatch({ type: 'loadStarted', mode: 'initial' });
    const upload = new AbortController();
    let fileInvalid = true;

    handleTaskLoadFailure(
      error,
      warehouseId,
      dispatch,
      () => upload.abort(),
      () => {
        fileInvalid = false;
      },
    );

    assert.equal(upload.signal.aborted, true, `upload should abort for ${error.message}`);
    assert.equal(fileInvalid, false, `invalid-file state should clear for ${error.message}`);
    assert.deepEqual(state.tasks, []);
    assert.equal(state.nextAfter, null);
    assert.equal(state.selectedClaimId, null);
    assert.equal(state.selectedFile, null);
    assert.equal(state.pending, null);
    assert.equal(state.uploadState, 'idle');
    assert.equal(state.loadError, 'denied');
  }
});

test('transient list failure retains queue, selection, file, and pending upload without abort', () => {
  let state = draft.createWarehouseEvidenceUiState(warehouseId);
  const dispatch = (action) => {
    state = draft.warehouseEvidenceUiReducer(state, action);
  };
  const file = image();
  const pending = { claimId, expectedVersion: task.version, evidenceId, file };
  dispatch({ type: 'loadStarted', mode: 'initial' });
  dispatch({
    type: 'tasksLoaded',
    warehouseId,
    after: null,
    page: { items: [task], nextAfter: cursorId },
  });
  dispatch({ type: 'taskSelected', claimId });
  dispatch({ type: 'fileSelected', file });
  dispatch({ type: 'uploadStarted', intent: pending });
  dispatch({ type: 'loadStarted', mode: 'initial' });
  const upload = new AbortController();
  let fileInvalid = true;

  handleTaskLoadFailure(
    new TypeError('Failed to fetch'),
    warehouseId,
    dispatch,
    () => upload.abort(),
    () => {
      fileInvalid = false;
    },
  );

  assert.equal(upload.signal.aborted, false);
  assert.equal(fileInvalid, true);
  assert.deepEqual(state.tasks, [task]);
  assert.equal(state.nextAfter, cursorId);
  assert.equal(state.selectedClaimId, claimId);
  assert.equal(state.selectedFile, file);
  assert.equal(state.pending, pending);
  assert.equal(state.uploadState, 'uploading');
  assert.equal(state.loadError, 'retry');
  assert.equal(state.loading, 'idle');
});

test('warehouse evidence task UI does not import financial claim detail or render image previews', async () => {
  const { readFile } = await import('node:fs/promises');
  const page = await readFile(
    new URL('../src/pages/warehouse/WarehouseEvidenceTasksPage.tsx', import.meta.url),
    'utf8',
  );
  const entry = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.match(page, /useWarehouseEvidenceTasks/);
  assert.doesNotMatch(
    page,
    /ClaimDetail|claimsApi|declaredCostVnd|approvedAmountVnd|maximumCreditVnd/,
  );
  assert.doesNotMatch(page, /URL\.createObjectURL|<img\b|<Image\b/);
  assert.match(entry, /path="\/warehouse\/claim-evidence"/);
});
