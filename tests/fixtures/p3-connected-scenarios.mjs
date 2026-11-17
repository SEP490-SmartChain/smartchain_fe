/**
 * P3 C08 — versioned connected browser scenarios for the actual ORCA app/router.
 *
 * This module is DATA ONLY (no I/O, no credentials, no PII, no mocks). It is consumed by
 * `tests/p3-connected-browser.mjs`, which drives real Chrome via CDP against the actual FE
 * app and the actual API. Business API responses are never fulfilled/stubbed: every network
 * expectation is recorded from the live app. Persisted effects are asserted through the safe
 * C11 fixture-assert service (`P3_FIXTURE_ASSERT_URL`), never through an app backdoor.
 *
 * Screens covered: màn 4 (cycle count: create/assign/blind observe/evidence/review/post and
 * reject → resnapshot → recount) and màn 5 (returns: Owner request → Ops reverse authorize →
 * Staff arrival/inspection → Manager review → Staff stock), plus trace/recall (trace, masked
 * affected CSV export, recall, seller notice), role/scope denial, revoked warehouse assignment,
 * unknown-outcome replay and n8n outage.
 *
 * Step schema (validated by the harness in `--dry-run`):
 *   {kind:'login'|'logout'}
 *   {kind:'goto', path, waitForText?}
 *   {kind:'click', target, within?, index?}
 *   {kind:'fill', target, value}
 *   {kind:'select', target, option:{value|label|index}}
 *   {kind:'upload', target}                      // synthetic PNG; sets {{evidence.sha256}}
 *   {kind:'waitFor', target?, timeoutMs?}
 *   {kind:'wait', ms}
 *   {kind:'reload'}
 *   {kind:'fault', mode:'block'|'unblock'|'offline'|'online', urlPattern?}
 *   {kind:'capture', name, from:{method, path}, pick?, select?}
 *   {kind:'expectNetwork', description, request:{method, path, status|statusAnyOf},
 *       payloadContains?, payloadMatches?, payloadHasKeys?, responseContains?,
 *       responseHasKeys?, responseNumberAtLeast?, absentKeys?, timeoutMs?}
 *   {kind:'expectRequestCount', description, request, count?, min?, max?}
 *   {kind:'expectReplayedRequest', description, request, count, sameFields}
 *   {kind:'expectText', description, contains|matches, target?}
 *   {kind:'expectHidden', description, target}
 *   {kind:'expectUrl', description, contains}
 *   {kind:'expectDownload', description, fileNamePattern, header, requireMasked}
 *   {kind:'waitForNetwork', description, request, select?, notNull?, refreshTarget?, timeoutMs?}
 *   {kind:'fixtureAssert', key, params?, description}
 *   {kind:'screenshot', name}
 *
 * Selector strategies: css | label | role | text | placeholder (+ optional `closest`/`index`).
 * Variables: `{{name}}` captured earlier in the same scenario or a transitive dependency,
 * `{{env:NAME}}` from env, `{{evidence.sha256}}` / `{{evidence.fileSizeBytes}}` set by the
 * synthetic upload step, `{{scenario.NAME}}` from the scenario syntheticData block.
 *
 * Synthetic seed contract required from C11 (`preconditions`, verified through the fixture
 * assert service): one platform warehouse with a Manager, exactly one countable LOT_BIN stock
 * (one bin, one SKU, one lot) and a single Staff in the count staff directory; one delivered
 * order line eligible for a post-delivery return with an active STORAGE destination bin; a
 * count plan seeded PLANNED for the unknown-outcome scenario; n8n delivery offline for the
 * outage scenario. Credentials, seed codes and emails come from env, never from this file.
 */

export const FIXTURE_VERSION = 1;

export const ORCA_ROLES = Object.freeze([
  'ORCA_ADMIN',
  'OPS_DISPATCHER',
  'WAREHOUSE_MANAGER',
  'WAREHOUSE_STAFF',
  'ORCA_ACCOUNTANT',
  'SELLER_OWNER',
  'SELLER_STAFF',
]);

export const ACTOR_SCOPES = Object.freeze(['TENANT', 'PLATFORM']);

/** Acceptance bullets from the C08 work order; dry-run fails if one is unmapped. */
export const REQUIRED_COVERAGE = Object.freeze([
  'manager-create-assign',
  'staff-scan-evidence-blind',
  'manager-review-post',
  'stale-recount',
  'owner-return-ops-reverse-staff-qc-manager-approve-stock',
  'ops-trace-recall-csv-notice',
  'revoke-scope-change',
  'unknown-outcome',
  'n8n-outage',
]);

export const REQUIRED_ENV = Object.freeze({
  runtime: Object.freeze([
    'P3_FE_URL',
    'P3_API_URL',
    'P3_FIXTURE_ASSERT_URL',
    'P3_FIXTURE_ASSERT_TOKEN',
  ]),
  optional: Object.freeze([
    'P3_BROWSER_BIN',
    'P3_LOGIN_WORKSPACE_SLUG',
    'P3_BE_SHA',
    'P3_FE_SHA',
    'P3_TRACE',
    'P3_ARTIFACTS_DIR',
  ]),
});

export const APP_UNDER_TEST = Object.freeze({
  fixtureSchemaVersion: 1,
  feApp: 'Vite dev server serving the actual app/router (no preview fixtures)',
  apiBasePath: '/api',
  routes: Object.freeze({
    login: '/login',
    counts: '/warehouse/counts',
    inventory: '/inventory',
    warehouseReturns: '/warehouse/returns',
    sellerReturns: '/returns',
    platformStaff: '/admin/staff',
  }),
  capabilitiesUsed: Object.freeze([
    'inventory.counts.view',
    'inventory.counts.plan',
    'inventory.counts.observe',
    'inventory.workflows.view',
    'returns.view',
    'returns.operations.view',
    'returns.request',
    'returns.authorize',
    'returns.receive',
    'returns.inspect',
    'returns.review',
    'returns.restock',
    'inventory.trace',
    'inventory.trace.forward',
    'inventory.recall',
    'iam.warehouses.assign',
    'warehouse.operations.view',
  ]),
});

// ─── network path patterns (regex source; matched against the live URL pathname) ───────────────
const API = Object.freeze({
  login: '/v1/auth/login$',
  refresh: '/v1/auth/refresh$',
  logout: '/v1/auth/logout$',
  warehouses: '/v1/warehouses$',
  staffAssign: '/v1/admin/staff/[0-9a-f-]{36}/warehouses$',
  countList: 'inventory-workflows/counts$',
  countOptions: 'inventory-workflows/counts/options$',
  countAssignment: 'inventory-workflows/counts/[0-9a-f-]{36}/assignment$',
  countObservation: 'inventory-workflows/counts/[0-9a-f-]{36}/observation$',
  countReview: 'inventory-workflows/counts/[0-9a-f-]{36}/review$',
  countResnapshot: 'inventory-workflows/counts/[0-9a-f-]{36}/resnapshot$',
  countPost: 'inventory-workflows/counts/[0-9a-f-]{36}/post$',
  countEvidence: 'inventory-workflows/counts/[0-9a-f-]{36}/evidence$',
  returns: '/v1/warehouses/[0-9a-f-]{36}/returns$',
  returnEligible: '/v1/warehouses/[0-9a-f-]{36}/returns/eligible$',
  returnBins: '/v1/warehouses/[0-9a-f-]{36}/returns/bins$',
  returnAuthorize: '/v1/warehouses/[0-9a-f-]{36}/returns/[0-9a-f-]{36}/authorize$',
  returnArrival: '/v1/warehouses/[0-9a-f-]{36}/returns/[0-9a-f-]{36}/arrival$',
  returnEvidence:
    '/v1/warehouses/[0-9a-f-]{36}/returns/[0-9a-f-]{36}/lines/[0-9a-f-]{36}/evidence$',
  returnInspection: '/v1/warehouses/[0-9a-f-]{36}/returns/[0-9a-f-]{36}/inspection$',
  returnReview: '/v1/warehouses/[0-9a-f-]{36}/returns/[0-9a-f-]{36}/review$',
  returnStock: '/v1/warehouses/[0-9a-f-]{36}/returns/[0-9a-f-]{36}/stock$',
  traceLots: '/v1/warehouses/[0-9a-f-]{36}/trace/lots/[0-9a-f-]{36}$',
  traceAffected: '/v1/warehouses/[0-9a-f-]{36}/trace/lots/[0-9a-f-]{36}/affected$',
  traceRecall: '/v1/warehouses/[0-9a-f-]{36}/trace/lots/[0-9a-f-]{36}/recall$',
  traceNotify: '/v1/warehouses/[0-9a-f-]{36}/trace/lots/[0-9a-f-]{36}/notifications$',
});

// ─── selector helpers (pure data) ──────────────────────────────────────────────────────────────
const byCss = (value, extra = {}) => ({ strategy: 'css', value, ...extra });
const byLabel = (value) => ({ strategy: 'label', value });
const byRole = (role, name) => ({ strategy: 'role', role, name });
const byText = (value, extra = {}) => ({ strategy: 'text', value, ...extra });
const byPlaceholder = (value) => ({ strategy: 'placeholder', value });
const inDialog = byCss('[role="dialog"]');

// ─── step helpers (pure data) ─────────────────────────────────────────────────────────────────
const login = (role) => ({ kind: 'login', role });
const logout = () => ({ kind: 'logout' });
const goto = (path, waitForText) => ({
  kind: 'goto',
  path,
  ...(waitForText ? { waitForText } : {}),
});
const click = (target, extra = {}) => ({ kind: 'click', target, ...extra });
const fill = (target, value) => ({ kind: 'fill', target, value });
const select = (target, option) => ({ kind: 'select', target, option });
const upload = (target) => ({ kind: 'upload', target });
const waitFor = (target, extra = {}) => ({ kind: 'waitFor', target, ...extra });
const pause = (ms) => ({ kind: 'wait', ms });
const reload = () => ({ kind: 'reload' });
const block = (urlPattern) => ({ kind: 'fault', mode: 'block', urlPattern });
const unblock = () => ({ kind: 'fault', mode: 'unblock' });
const capture = (name, from, pick, selectSpec) => ({
  kind: 'capture',
  name,
  from,
  ...(pick ? { pick } : {}),
  ...(selectSpec ? { select: selectSpec } : {}),
});
const expectNetwork = (description, request, extra = {}) => ({
  kind: 'expectNetwork',
  description,
  request,
  ...extra,
});
const expectRequestCount = (description, request, bounds) => ({
  kind: 'expectRequestCount',
  description,
  request,
  ...bounds,
});
const expectText = (description, contains, target) => ({
  kind: 'expectText',
  description,
  ...(contains instanceof RegExp ? { matches: contains.source } : { contains }),
  ...(target ? { target } : {}),
});
const expectHidden = (description, target) => ({ kind: 'expectHidden', description, target });
const expectUrl = (description, contains) => ({ kind: 'expectUrl', description, contains });
const waitForNetwork = (description, request, extra = {}) => ({
  kind: 'waitForNetwork',
  description,
  request,
  ...extra,
});
const expectReplayedRequest = (description, request, sameFields) => ({
  kind: 'expectReplayedRequest',
  description,
  request,
  count: 2,
  sameFields,
});
const expectDownload = (description, fileNamePattern, extra = {}) => ({
  kind: 'expectDownload',
  description,
  fileNamePattern,
  ...extra,
});
const assertEffect = (key, description, params) => ({
  kind: 'fixtureAssert',
  key,
  description,
  ...(params ? { params } : {}),
});
const screenshot = (name) => ({ kind: 'screenshot', name });
const sectionWith = (variable) => byText(`{{${variable}}}`, { closest: 'section' });
const rowWithEnv = (name) => byText(`{{env:${name}}}`, { closest: 'tr' });

// ─── scenarios ────────────────────────────────────────────────────────────────────────────────
export const SCENARIOS = Object.freeze([
  // ── màn 4: Manager plans + assigns ─────────────────────────────────────────────────────────
  {
    id: 'COUNT-01-manager-create-assign',
    version: 1,
    title: 'Manager tạo kế hoạch kiểm kê và giao lại người đếm',
    screen: 'màn 4 — cycle count',
    covers: ['manager-create-assign'],
    requirements: ['SS-1144', 'SS-1145'],
    actors: [{ role: 'WAREHOUSE_MANAGER', actorScope: 'PLATFORM' }],
    routes: [APP_UNDER_TEST.routes.counts],
    preconditions: [
      {
        kind: 'fixture',
        key: 'seed.count.warehouseReady',
        description:
          'C11 seed: assigned platform warehouse; exactly one countable LOT_BIN stock (1 bin, 1 SKU, 1 lot); count staff directory has exactly one Staff account (the scenario Staff).',
      },
    ],
    syntheticData: {
      planReason: 'C08 synthetic count plan',
      reassignReason: 'C08 synthetic reassignment',
    },
    expected: {
      ui: [
        'Modal tạo kế hoạch mở; chọn bin đầu tiên + SKU đầu tiên; giao Staff đầu tiên.',
        'Sau tạo: kế hoạch hiển thị trạng thái "Đã lập", vòng 1, lineCount = 1.',
        'Sau giao lại: cùng kế hoạch vẫn "Đã lập" và vẫn còn nút giao người đếm.',
      ],
      network: [
        'GET counts/options 200 (bins/staff/skuCodes).',
        'POST counts 201: data.status=PLANNED, data.lineCount=1; payload operationId + reason + assigneeId + binIds.',
        'POST counts/:id/assignment 200: payload expectedVersion + assigneeId + reason; response data.status=PLANNED.',
      ],
      persisted: ['count.plan.created', 'count.assignment.applied'],
    },
    persistedEffectKeys: ['count.plan.created', 'count.assignment.applied'],
    steps: [
      login('WAREHOUSE_MANAGER'),
      goto(APP_UNDER_TEST.routes.counts, 'Tạo kế hoạch kiểm kê'),
      expectNetwork('Danh sách kho trả về cho Manager', {
        method: 'GET',
        path: API.warehouses,
        status: 200,
      }),
      click(byRole('button', 'Tạo kế hoạch kiểm kê')),
      waitFor(byRole('heading', 'Tạo kế hoạch kiểm kê')),
      expectNetwork('Options kiểm kê (bin/staff/SKU) tải trong modal', {
        method: 'GET',
        path: API.countOptions,
        status: 200,
      }),
      capture('binId', { method: 'GET', path: API.countOptions }, 'data.bins[0].id'),
      capture('skuCode', { method: 'GET', path: API.countOptions }, 'data.skuCodes[0]'),
      capture('staffId', { method: 'GET', path: API.countOptions }, 'data.staff[0].id'),
      click(byCss('fieldset input[type="checkbox"]'), { index: 0 }),
      fill(byLabel('Lọc mã hàng'), '{{skuCode}}'),
      select(byLabel('Mã nhân viên kho được giao'), { value: '{{staffId}}' }),
      fill(byLabel('Lý do'), '{{scenario.planReason}}'),
      click(byRole('button', 'Xác nhận'), { within: inDialog }),
      expectNetwork(
        'Tạo kế hoạch kiểm kê thật',
        { method: 'POST', path: API.countList, status: 201 },
        {
          payloadHasKeys: ['operationId', 'assigneeId', 'reason', 'binIds'],
          payloadContains: { reason: '{{scenario.planReason}}', assigneeId: '{{staffId}}' },
          responseContains: { 'data.status': 'PLANNED' },
          responseNumberAtLeast: { 'data.lineCount': 1 },
        },
      ),
      capture('countId', { method: 'POST', path: API.countList }, 'data.id'),
      capture('countVersion', { method: 'POST', path: API.countList }, 'data.version'),
      waitFor(byText('{{scenario.planReason}}')),
      expectNetwork('Danh sách kế hoạch tải lại sau khi tạo', {
        method: 'GET',
        path: API.countList,
        status: 200,
      }),
      capture('countReason', { method: 'GET', path: API.countList }, undefined, {
        path: 'data.items',
        where: { field: 'id', equals: '{{countId}}' },
        then: 'createReason',
      }),
      screenshot('count-plan-created'),
      click(byRole('button', 'Giao lại người đếm'), { within: sectionWith('countReason') }),
      waitFor(byRole('heading', 'Giao lại người đếm')),
      expectNetwork('Options tải lại trong modal giao người đếm', {
        method: 'GET',
        path: API.countOptions,
        status: 200,
      }),
      select(byLabel('Mã nhân viên kho được giao'), { value: '{{staffId}}' }),
      fill(byLabel('Lý do'), '{{scenario.reassignReason}}'),
      click(byRole('button', 'Xác nhận'), { within: inDialog }),
      expectNetwork(
        'Giao lại người đếm',
        { method: 'POST', path: API.countAssignment, status: 200 },
        {
          payloadContains: {
            reason: '{{scenario.reassignReason}}',
            assigneeId: '{{staffId}}',
            expectedVersion: '{{countVersion}}',
          },
          responseContains: { 'data.status': 'PLANNED' },
        },
      ),
      waitFor(byText('{{scenario.planReason}}')),
      assertEffect('count.plan.created', 'DB: kế hoạch kiểm kê + line snapshot đã tồn tại', {
        countId: '{{countId}}',
        lineCount: 1,
        status: 'PLANNED',
        assignedToStaff: true,
      }),
      assertEffect('count.assignment.applied', 'DB/journal: assignment của Manager đã áp dụng', {
        countId: '{{countId}}',
        expectedAssigneeRole: 'WAREHOUSE_STAFF',
      }),
      screenshot('count-assigned'),
    ],
  },

  // ── màn 4: Staff blind count + evidence ────────────────────────────────────────────────────
  {
    id: 'COUNT-02-staff-blind-observe-evidence',
    version: 1,
    title: 'Staff đếm mù, quét bin/SKU/lot và gửi ảnh bằng chứng',
    screen: 'màn 4 — cycle count',
    covers: ['staff-scan-evidence-blind'],
    requirements: ['SS-1145'],
    actors: [{ role: 'WAREHOUSE_STAFF', actorScope: 'PLATFORM' }],
    routes: [APP_UNDER_TEST.routes.counts],
    dependsOn: ['COUNT-01-manager-create-assign'],
    preconditions: [
      {
        kind: 'fixture',
        key: 'seed.count.assignedToStaff',
        description:
          'Kế hoạch từ COUNT-01 đang PLANNED và được giao đúng Staff đăng nhập; line duy nhất chưa có observation.',
      },
    ],
    syntheticData: { observedQty: 190 },
    expected: {
      ui: [
        'Staff KHÔNG thấy "Tồn tại lúc chụp"/"Chênh lệch" (blind count).',
        'Modal đếm mù hiển thị số lượng + 3 ô quét + ảnh bằng chứng; sau gửi, kế hoạch chuyển "Chờ duyệt".',
      ],
      network: [
        'GET counts 200: payload Staff không có key expectedQty/varianceQty/variancePercent ở bất kỳ line.',
        'POST counts/:id/evidence 200 (signed upload) rồi PUT ảnh lên storage thật.',
        'POST counts/:id/observation 200: observedQty=190, bin/SKU/lot đúng snapshot, evidence.sha256 khớp file đã tải.',
      ],
      persisted: ['count.observation.blind'],
    },
    persistedEffectKeys: ['count.observation.blind'],
    steps: [
      login('WAREHOUSE_STAFF'),
      goto(APP_UNDER_TEST.routes.counts, 'Kiểm kê, nhập trả và tiêu hủy'),
      expectNetwork(
        'Staff chỉ nhận projection ẩn expected/variance',
        { method: 'GET', path: API.countList, status: 200 },
        { absentKeys: ['expectedQty', 'varianceQty', 'variancePercent'] },
      ),
      capture('countLineBinCode', { method: 'GET', path: API.countList }, undefined, {
        path: 'data.items',
        where: { field: 'id', equals: '{{countId}}' },
        then: 'lines[0].binCode',
      }),
      capture('countLineSku', { method: 'GET', path: API.countList }, undefined, {
        path: 'data.items',
        where: { field: 'id', equals: '{{countId}}' },
        then: 'lines[0].sku',
      }),
      capture('countLineLotCode', { method: 'GET', path: API.countList }, undefined, {
        path: 'data.items',
        where: { field: 'id', equals: '{{countId}}' },
        then: 'lines[0].lotCode',
      }),
      expectHidden('Staff không thấy nhãn tồn tại lúc chụp', byText('Tồn tại lúc chụp')),
      click(byRole('button', 'Nộp kết quả đếm'), { within: sectionWith('countReason') }),
      waitFor(byRole('heading', 'Nộp kết quả đếm')),
      fill(byLabel('Số lượng'), '{{scenario.observedQty}}'),
      fill(byLabel('Quét mã vị trí'), '{{countLineBinCode}}'),
      fill(byLabel('Quét mã sản phẩm'), '{{countLineSku}}'),
      fill(byLabel('Quét mã lô'), '{{countLineLotCode}}'),
      upload(byLabel('Ảnh bằng chứng riêng tư (PNG/JPEG/WebP, tối đa 5 MB)')),
      click(byRole('button', 'Xác nhận'), { within: inDialog }),
      expectNetwork(
        'Xin signed upload cho bằng chứng kiểm kê',
        { method: 'POST', path: API.countEvidence, status: 200 },
        { responseContains: { 'data.method': 'PUT' } },
      ),
      expectNetwork(
        'Gửi observation đếm mù',
        { method: 'POST', path: API.countObservation, status: 200 },
        {
          payloadContains: {
            observedQty: '{{scenario.observedQty}}',
            binScan: '{{countLineBinCode}}',
            skuScan: '{{countLineSku}}',
            lotScan: '{{countLineLotCode}}',
            'evidence.sha256': '{{evidence.sha256}}',
            'evidence.fileSizeBytes': '{{evidence.fileSizeBytes}}',
          },
          responseContains: { 'data.status': 'REVIEW' },
        },
      ),
      waitFor(byText('Chờ duyệt')),
      expectNetwork('Danh sách kế hoạch tải lại sau khi gửi', {
        method: 'GET',
        path: API.countList,
        status: 200,
      }),
      screenshot('count-observed'),
      assertEffect(
        'count.observation.blind',
        'DB: observation + evidence đã lưu, Staff payload vẫn ẩn expected',
        {
          countId: '{{countId}}',
          observedQty: '{{scenario.observedQty}}',
          staffProjectionHidesExpected: true,
          hasEvidence: true,
        },
      ),
    ],
  },

  // ── màn 4: Manager review + post exactly once ─────────────────────────────────────────────
  {
    id: 'COUNT-03-manager-review-post',
    version: 1,
    title: 'Manager duyệt kết quả kiểm kê và ghi nhận điều chỉnh một lần',
    screen: 'màn 4 — cycle count',
    covers: ['manager-review-post'],
    requirements: ['SS-1144', 'SS-1145'],
    actors: [{ role: 'WAREHOUSE_MANAGER', actorScope: 'PLATFORM' }],
    routes: [APP_UNDER_TEST.routes.counts],
    dependsOn: ['COUNT-02-staff-blind-observe-evidence'],
    preconditions: [
      {
        kind: 'fixture',
        key: 'seed.count.reviewPending',
        description: 'Kế hoạch COUNT-01 đang REVIEW với đủ observation + evidence cho mọi line.',
      },
    ],
    syntheticData: { reviewReason: 'C08 synthetic approval' },
    expected: {
      ui: [
        'Manager thấy expected/variance của line; duyệt xong trạng thái "Đã duyệt".',
        'Nút "Ghi nhận kiểm kê đã duyệt" chỉ xuất hiện ở APPROVED; sau POST trạng thái "Đã ghi nhận" và nút biến mất.',
      ],
      network: [
        'POST counts/:id/review 200: payload decision=APPROVE + reason + expectedVersion.',
        'POST counts/:id/post 200 đúng một lần; không có POST /post thứ hai sau khi POSTED.',
      ],
      persisted: ['count.review.approved', 'count.posted'],
    },
    persistedEffectKeys: ['count.review.approved', 'count.posted'],
    steps: [
      login('WAREHOUSE_MANAGER'),
      goto(APP_UNDER_TEST.routes.counts, 'Kiểm kê, nhập trả và tiêu hủy'),
      expectNetwork('Manager nhận expected/variance', {
        method: 'GET',
        path: API.countList,
        status: 200,
      }),
      click(byRole('button', 'Duyệt kiểm kê'), { within: sectionWith('countReason') }),
      waitFor(byRole('heading', 'Duyệt kiểm kê')),
      select(byLabel('Quyết định duyệt'), { value: 'APPROVE' }),
      fill(byLabel('Lý do'), '{{scenario.reviewReason}}'),
      click(byRole('button', 'Xác nhận'), { within: inDialog }),
      expectNetwork(
        'Manager duyệt kết quả',
        { method: 'POST', path: API.countReview, status: 200 },
        {
          payloadContains: { decision: 'APPROVE', reason: '{{scenario.reviewReason}}' },
          responseContains: { 'data.status': 'APPROVED' },
        },
      ),
      waitFor(byRole('button', 'Ghi nhận kiểm kê đã duyệt'), {
        within: sectionWith('countReason'),
      }),
      click(byRole('button', 'Ghi nhận kiểm kê đã duyệt'), { within: sectionWith('countReason') }),
      waitFor(byRole('heading', 'Ghi nhận kiểm kê đã duyệt')),
      click(byRole('button', 'Xác nhận'), { within: inDialog }),
      expectNetwork(
        'Ghi nhận điều chỉnh kiểm kê',
        { method: 'POST', path: API.countPost, status: 200 },
        { responseContains: { 'data.status': 'POSTED' } },
      ),
      waitFor(byText('Đã ghi nhận')),
      expectHidden('Nút post không còn sau POSTED', byRole('button', 'Ghi nhận kiểm kê đã duyệt')),
      expectRequestCount('Không post lần hai', { method: 'POST', path: API.countPost }, { max: 1 }),
      screenshot('count-posted'),
      assertEffect('count.review.approved', 'DB: review APPROVE lưu bởi Manager', {
        countId: '{{countId}}',
        decision: 'APPROVE',
      }),
      assertEffect('count.posted', 'DB: đúng một ledger effect COUNT_ADJUST + trạng thái POSTED', {
        countId: '{{countId}}',
        status: 'POSTED',
        ledgerEffects: 1,
      }),
    ],
  },

  // ── màn 4: reject → resnapshot → recount → approve → post (stale/recount) ─────────────────
  {
    id: 'COUNT-04-stale-reject-resnapshot-recount',
    version: 1,
    title: 'Manager từ chối, chụp tồn đếm lại vòng 2, Staff đếm lại rồi duyệt/post',
    screen: 'màn 4 — cycle count',
    covers: ['stale-recount'],
    requirements: ['SS-1144'],
    actors: [
      { role: 'WAREHOUSE_MANAGER', actorScope: 'PLATFORM' },
      { role: 'WAREHOUSE_STAFF', actorScope: 'PLATFORM' },
    ],
    routes: [APP_UNDER_TEST.routes.counts],
    preconditions: [
      {
        kind: 'fixture',
        key: 'seed.count.warehouseReady',
        description:
          'C11 seed: cùng warehouse/single-line LOT_BIN stock/staff directory như COUNT-01 (scenario tự tạo kế hoạch riêng).',
      },
    ],
    syntheticData: {
      planReason: 'C08 synthetic recount plan',
      rejectReason: 'C08 synthetic stale observation',
      resnapshotReason: 'C08 synthetic resnapshot round 2',
      observedQtyRound1: 5,
      observedQtyRound2: 190,
      approveReason: 'C08 synthetic recount approval',
    },
    expected: {
      ui: [
        'Vòng 1: Staff đếm 5; Manager từ chối; kế hoạch vẫn "Chờ duyệt" và có nút "Chụp tồn để đếm lại".',
        'Sau resnapshot: trạng thái "Đã lập", "Vòng 2", observed = — (observation cũ bị vô hiệu).',
        'Staff đếm lại 190; Manager duyệt và post; trạng thái cuối "Đã ghi nhận".',
      ],
      network: [
        'POST counts 201 lineCount=1; POST observation 200; POST review REJECT 200; POST resnapshot 200; POST observation 200; POST review APPROVE 200; POST post 200.',
        'Observation vòng 2 dùng version sau resnapshot (không stale 409).',
      ],
      persisted: ['count.resnapshot.round', 'count.recount.posted'],
    },
    persistedEffectKeys: ['count.resnapshot.round', 'count.recount.posted'],
    steps: [
      login('WAREHOUSE_MANAGER'),
      goto(APP_UNDER_TEST.routes.counts, 'Tạo kế hoạch kiểm kê'),
      click(byRole('button', 'Tạo kế hoạch kiểm kê')),
      waitFor(byRole('heading', 'Tạo kế hoạch kiểm kê')),
      expectNetwork('Options kiểm kê tải trong modal', {
        method: 'GET',
        path: API.countOptions,
        status: 200,
      }),
      capture('recountBinId', { method: 'GET', path: API.countOptions }, 'data.bins[0].id'),
      capture('recountSkuCode', { method: 'GET', path: API.countOptions }, 'data.skuCodes[0]'),
      capture('recountStaffId', { method: 'GET', path: API.countOptions }, 'data.staff[0].id'),
      click(byCss('fieldset input[type="checkbox"]'), { index: 0 }),
      fill(byLabel('Lọc mã hàng'), '{{recountSkuCode}}'),
      select(byLabel('Mã nhân viên kho được giao'), { value: '{{recountStaffId}}' }),
      fill(byLabel('Lý do'), '{{scenario.planReason}}'),
      click(byRole('button', 'Xác nhận'), { within: inDialog }),
      expectNetwork(
        'Tạo kế hoạch kiểm kê cho vòng đếm lại',
        { method: 'POST', path: API.countList, status: 201 },
        {
          responseContains: { 'data.status': 'PLANNED' },
          responseNumberAtLeast: { 'data.lineCount': 1 },
        },
      ),
      capture('recountId', { method: 'POST', path: API.countList }, 'data.id'),
      waitFor(byText('{{scenario.planReason}}')),
      screenshot('recount-plan-created'),

      logout(),
      login('WAREHOUSE_STAFF'),
      goto(APP_UNDER_TEST.routes.counts, 'Kiểm kê, nhập trả và tiêu hủy'),
      expectNetwork('Staff tải danh sách kế hoạch', {
        method: 'GET',
        path: API.countList,
        status: 200,
      }),
      capture('recountBinScan', { method: 'GET', path: API.countList }, undefined, {
        path: 'data.items',
        where: { field: 'id', equals: '{{recountId}}' },
        then: 'lines[0].binCode',
      }),
      capture('recountSkuScan', { method: 'GET', path: API.countList }, undefined, {
        path: 'data.items',
        where: { field: 'id', equals: '{{recountId}}' },
        then: 'lines[0].sku',
      }),
      capture('recountLotScan', { method: 'GET', path: API.countList }, undefined, {
        path: 'data.items',
        where: { field: 'id', equals: '{{recountId}}' },
        then: 'lines[0].lotCode',
      }),
      click(byRole('button', 'Nộp kết quả đếm'), { within: sectionWith('scenario.planReason') }),
      waitFor(byRole('heading', 'Nộp kết quả đếm')),
      fill(byLabel('Số lượng'), '{{scenario.observedQtyRound1}}'),
      fill(byLabel('Quét mã vị trí'), '{{recountBinScan}}'),
      fill(byLabel('Quét mã sản phẩm'), '{{recountSkuScan}}'),
      fill(byLabel('Quét mã lô'), '{{recountLotScan}}'),
      upload(byLabel('Ảnh bằng chứng riêng tư (PNG/JPEG/WebP, tối đa 5 MB)')),
      click(byRole('button', 'Xác nhận'), { within: inDialog }),
      expectNetwork('Upload bằng chứng vòng 1', {
        method: 'POST',
        path: API.countEvidence,
        status: 200,
      }),
      expectNetwork(
        'Observation vòng 1',
        { method: 'POST', path: API.countObservation, status: 200 },
        { payloadContains: { observedQty: '{{scenario.observedQtyRound1}}' } },
      ),
      waitFor(byText('Chờ duyệt')),

      logout(),
      login('WAREHOUSE_MANAGER'),
      goto(APP_UNDER_TEST.routes.counts, 'Kiểm kê, nhập trả và tiêu hủy'),
      expectNetwork('Manager tải danh sách kế hoạch đếm lại', {
        method: 'GET',
        path: API.countList,
        status: 200,
      }),
      click(byRole('button', 'Duyệt kiểm kê'), { within: sectionWith('scenario.planReason') }),
      waitFor(byRole('heading', 'Duyệt kiểm kê')),
      select(byLabel('Quyết định duyệt'), { value: 'REJECT' }),
      fill(byLabel('Lý do'), '{{scenario.rejectReason}}'),
      click(byRole('button', 'Xác nhận'), { within: inDialog }),
      expectNetwork(
        'Manager từ chối kết quả vòng 1',
        { method: 'POST', path: API.countReview, status: 200 },
        { payloadContains: { decision: 'REJECT', reason: '{{scenario.rejectReason}}' } },
      ),
      waitFor(byRole('button', 'Chụp tồn để đếm lại'), {
        within: sectionWith('scenario.planReason'),
      }),
      click(byRole('button', 'Chụp tồn để đếm lại'), {
        within: sectionWith('scenario.planReason'),
      }),
      waitFor(byRole('heading', 'Chụp tồn để đếm lại')),
      fill(byLabel('Lý do'), '{{scenario.resnapshotReason}}'),
      click(byRole('button', 'Xác nhận'), { within: inDialog }),
      expectNetwork(
        'Chụp tồn vòng 2',
        { method: 'POST', path: API.countResnapshot, status: 200 },
        { responseContains: { 'data.status': 'PLANNED' } },
      ),
      waitFor(byText('Vòng 2')),
      screenshot('recount-resnapshot'),

      logout(),
      login('WAREHOUSE_STAFF'),
      goto(APP_UNDER_TEST.routes.counts, 'Kiểm kê, nhập trả và tiêu hủy'),
      expectNetwork('Staff tải lại kế hoạch vòng 2', {
        method: 'GET',
        path: API.countList,
        status: 200,
      }),
      click(byRole('button', 'Nộp kết quả đếm'), { within: sectionWith('scenario.planReason') }),
      waitFor(byRole('heading', 'Nộp kết quả đếm')),
      fill(byLabel('Số lượng'), '{{scenario.observedQtyRound2}}'),
      fill(byLabel('Quét mã vị trí'), '{{recountBinScan}}'),
      fill(byLabel('Quét mã sản phẩm'), '{{recountSkuScan}}'),
      fill(byLabel('Quét mã lô'), '{{recountLotScan}}'),
      upload(byLabel('Ảnh bằng chứng riêng tư (PNG/JPEG/WebP, tối đa 5 MB)')),
      click(byRole('button', 'Xác nhận'), { within: inDialog }),
      expectNetwork('Upload bằng chứng vòng 2', {
        method: 'POST',
        path: API.countEvidence,
        status: 200,
      }),
      expectNetwork(
        'Observation vòng 2 không stale',
        { method: 'POST', path: API.countObservation, status: 200 },
        { payloadContains: { observedQty: '{{scenario.observedQtyRound2}}' } },
      ),
      waitFor(byText('Chờ duyệt')),

      logout(),
      login('WAREHOUSE_MANAGER'),
      goto(APP_UNDER_TEST.routes.counts, 'Kiểm kê, nhập trả và tiêu hủy'),
      expectNetwork('Manager tải kế hoạch vòng 2', {
        method: 'GET',
        path: API.countList,
        status: 200,
      }),
      click(byRole('button', 'Duyệt kiểm kê'), { within: sectionWith('scenario.planReason') }),
      waitFor(byRole('heading', 'Duyệt kiểm kê')),
      select(byLabel('Quyết định duyệt'), { value: 'APPROVE' }),
      fill(byLabel('Lý do'), '{{scenario.approveReason}}'),
      click(byRole('button', 'Xác nhận'), { within: inDialog }),
      expectNetwork(
        'Duyệt kết quả vòng 2',
        { method: 'POST', path: API.countReview, status: 200 },
        {
          payloadContains: { decision: 'APPROVE' },
          responseContains: { 'data.status': 'APPROVED' },
        },
      ),
      waitFor(byRole('button', 'Ghi nhận kiểm kê đã duyệt'), {
        within: sectionWith('scenario.planReason'),
      }),
      click(byRole('button', 'Ghi nhận kiểm kê đã duyệt'), {
        within: sectionWith('scenario.planReason'),
      }),
      waitFor(byRole('heading', 'Ghi nhận kiểm kê đã duyệt')),
      click(byRole('button', 'Xác nhận'), { within: inDialog }),
      expectNetwork(
        'Post kết quả vòng 2',
        { method: 'POST', path: API.countPost, status: 200 },
        { responseContains: { 'data.status': 'POSTED' } },
      ),
      waitFor(byText('Đã ghi nhận')),
      screenshot('recount-posted'),
      assertEffect(
        'count.resnapshot.round',
        'DB: round 2 giữ lịch sử vòng 1, observation cũ bị vô hiệu',
        { countId: '{{recountId}}', round: 2, previousRoundPreserved: true },
      ),
      assertEffect('count.recount.posted', 'DB: POSTED vòng 2 + đúng một ledger effect', {
        countId: '{{recountId}}',
        status: 'POSTED',
        ledgerEffects: 1,
      }),
    ],
  },

  // ── màn 5: Owner return → Ops reverse → Staff QC → Manager review → stock ─────────────────
  {
    id: 'RET-01-owner-return-ops-reverse-staff-qc-manager-review-stock',
    version: 1,
    title:
      'Owner yêu cầu hoàn → Ops duyệt reverse → Staff nhận/QC → Manager duyệt → Staff nhập kho',
    screen: 'màn 5 — returns',
    covers: ['owner-return-ops-reverse-staff-qc-manager-approve-stock'],
    requirements: ['SS-1134', 'SS-1307'],
    actors: [
      { role: 'SELLER_OWNER', actorScope: 'TENANT' },
      { role: 'OPS_DISPATCHER', actorScope: 'PLATFORM' },
      { role: 'WAREHOUSE_STAFF', actorScope: 'PLATFORM' },
      { role: 'WAREHOUSE_MANAGER', actorScope: 'PLATFORM' },
    ],
    routes: [APP_UNDER_TEST.routes.sellerReturns, APP_UNDER_TEST.routes.warehouseReturns],
    preconditions: [
      {
        kind: 'fixture',
        key: 'seed.return.eligibleDelivered',
        description:
          'C11 seed: delivered synthetic order within the 7-day window with remaining returnable qty; origin warehouse has an active STORAGE bin; Staff and Manager assigned.',
      },
    ],
    syntheticData: {
      reason: 'C08 synthetic post-delivery return',
      pickupName: 'Khach Kiem Thu C08',
      pickupPhone: '00000000',
      pickupAddress: 'So 1 Duong Kiem Thu, Phuong 1',
      provinceCode: '79',
      wardCode: '26734',
      parcelWeightG: 500,
      parcelLengthCm: 10,
      parcelWidthCm: 10,
      parcelHeightCm: 10,
      reviewReason: 'C08 synthetic return review approval',
    },
    expected: {
      ui: [
        'Owner: yêu cầu hoàn tạo xong hiển thị "Chờ duyệt yêu cầu".',
        'Ops: duyệt hiện "Đã duyệt" + cảnh báo chờ vận đơn hoàn được xác minh.',
        'Staff: nhận hàng "Đã nhận tại kho"; kiểm tra receivedQty=1, classification "Đạt", chờ duyệt.',
        'Manager: duyệt chất lượng → line hiển thị "Đã duyệt".',
        'Staff: nhập kho SELLABLE vào bin STORAGE → "Hoàn tất nhập hàng"; đã nhập bán = 1.',
      ],
      network: [
        'POST returns 201; POST :id/authorize 200; POST :id/arrival 200; POST lines/:lineId/evidence 200 + POST :id/inspection 200; POST :id/review 200 (APPROVE); POST :id/stock 200.',
        'Mọi payload đúng operationId + expectedVersion; stock payload destination=SELLABLE, toBinId UUID, scan bin/SKU/lot khớp nguồn.',
      ],
      persisted: [
        'return.requested',
        'return.authorized',
        'return.arrived',
        'return.inspected',
        'return.reviewed',
        'return.restocked',
      ],
    },
    persistedEffectKeys: [
      'return.requested',
      'return.authorized',
      'return.arrived',
      'return.inspected',
      'return.reviewed',
      'return.restocked',
    ],
    steps: [
      login('SELLER_OWNER'),
      goto(APP_UNDER_TEST.routes.sellerReturns, 'Yêu cầu hoàn sau giao'),
      expectNetwork('Owner tải danh sách kho', {
        method: 'GET',
        path: API.warehouses,
        status: 200,
      }),
      click(byRole('button', 'Yêu cầu hoàn sau giao')),
      waitFor(byRole('heading', 'Yêu cầu hoàn sau giao')),
      expectNetwork(
        'Owner tải nguồn hàng đủ điều kiện',
        { method: 'GET', path: API.returnEligible, status: 200 },
        { responseNumberAtLeast: { 'data.items.length': 1 } },
      ),
      select(byLabel('Nguồn hàng đã giao'), { index: 1 }),
      fill(byLabel('Số lượng'), '1'),
      fill(byLabel('Lý do'), '{{scenario.reason}}'),
      fill(byLabel('Người gửi hoàn'), '{{scenario.pickupName}}'),
      fill(byLabel('Số điện thoại'), '{{scenario.pickupPhone}}'),
      fill(byLabel('Địa chỉ lấy hàng hoàn'), '{{scenario.pickupAddress}}'),
      fill(byLabel('Mã tỉnh/thành'), '{{scenario.provinceCode}}'),
      fill(byLabel('Mã phường/xã'), '{{scenario.wardCode}}'),
      click(byRole('button', 'Xác nhận'), { within: inDialog }),
      expectNetwork(
        'Owner tạo yêu cầu hoàn',
        { method: 'POST', path: API.returns, status: 201 },
        {
          payloadHasKeys: ['operationId', 'fulfillmentOrderId', 'reason', 'lines', 'pickup'],
          payloadContains: {
            reason: '{{scenario.reason}}',
            'pickup.name': '{{scenario.pickupName}}',
          },
          responseContains: { 'data.status': 'REQUESTED' },
        },
      ),
      capture('returnId', { method: 'POST', path: API.returns }, 'data.id'),
      waitFor(byText('Chờ duyệt yêu cầu')),
      capture('returnReason', { method: 'GET', path: API.returns }, undefined, {
        path: 'data.items',
        where: { field: 'id', equals: '{{returnId}}' },
        then: 'reason',
      }),
      screenshot('return-requested'),
      assertEffect('return.requested', 'DB: return order REQUESTED + line provenance gốc', {
        returnId: '{{returnId}}',
        status: 'REQUESTED',
        provenanceOriginal: true,
      }),

      logout(),
      login('OPS_DISPATCHER'),
      goto(APP_UNDER_TEST.routes.warehouseReturns, 'Hàng hoàn'),
      expectNetwork('Ops tải danh sách hàng hoàn', {
        method: 'GET',
        path: API.returns,
        status: 200,
      }),
      click(byRole('button', 'Duyệt yêu cầu hoàn'), { within: sectionWith('returnReason') }),
      waitFor(byRole('heading', 'Duyệt yêu cầu hoàn')),
      fill(byLabel('Khối lượng (g)'), '{{scenario.parcelWeightG}}'),
      fill(byLabel('Chiều dài (cm)'), '{{scenario.parcelLengthCm}}'),
      fill(byLabel('Chiều rộng (cm)'), '{{scenario.parcelWidthCm}}'),
      fill(byLabel('Chiều cao (cm)'), '{{scenario.parcelHeightCm}}'),
      click(byRole('button', 'Xác nhận'), { within: inDialog }),
      expectNetwork(
        'Ops duyệt reverse (booking intent)',
        { method: 'POST', path: API.returnAuthorize, status: 200 },
        {
          payloadContains: { 'parcel.weightG': '{{scenario.parcelWeightG}}' },
          responseContains: { 'data.status': 'AUTHORIZED' },
        },
      ),
      waitFor(byText('Đã duyệt, đang chờ vận đơn hoàn được xác minh.')),
      screenshot('return-authorized'),
      assertEffect(
        'return.authorized',
        'DB/outbox: reverse booking intent + seller/warehouse scope',
        {
          returnId: '{{returnId}}',
          status: 'AUTHORIZED',
          reverseBookingIntent: true,
        },
      ),

      logout(),
      login('WAREHOUSE_STAFF'),
      goto(APP_UNDER_TEST.routes.warehouseReturns, 'Hàng hoàn'),
      expectNetwork('Staff tải danh sách hàng hoàn', {
        method: 'GET',
        path: API.returns,
        status: 200,
      }),
      click(byRole('button', 'Nhận hàng tại kho'), { within: sectionWith('returnReason') }),
      waitFor(byRole('heading', 'Nhận hàng tại kho')),
      fill(byLabel('Quét mã hoàn hoặc vận đơn'), '{{returnId}}'),
      click(byRole('button', 'Xác nhận'), { within: inDialog }),
      expectNetwork(
        'Staff xác nhận nhận hàng vật lý',
        { method: 'POST', path: API.returnArrival, status: 200 },
        {
          payloadContains: { parcelScan: '{{returnId}}' },
          responseContains: { 'data.status': 'ARRIVED' },
        },
      ),
      waitFor(byText('Đã nhận tại kho')),
      waitForNetwork(
        'Danh sách hàng hoàn tải lại sau arrival',
        { method: 'GET', path: API.returns, status: 200 },
        {
          select: {
            path: 'data.items',
            where: { field: 'id', equals: '{{returnId}}' },
            then: 'arrivedAt',
          },
          notNull: true,
        },
      ),
      capture('returnLineId', { method: 'GET', path: API.returns }, undefined, {
        path: 'data.items',
        where: { field: 'id', equals: '{{returnId}}' },
        then: 'lines[0].id',
      }),
      capture('returnSku', { method: 'GET', path: API.returns }, undefined, {
        path: 'data.items',
        where: { field: 'id', equals: '{{returnId}}' },
        then: 'lines[0].sku',
      }),
      capture('returnLotCode', { method: 'GET', path: API.returns }, undefined, {
        path: 'data.items',
        where: { field: 'id', equals: '{{returnId}}' },
        then: 'lines[0].lotCode',
      }),
      capture('lotId', { method: 'GET', path: API.returns }, undefined, {
        path: 'data.items',
        where: { field: 'id', equals: '{{returnId}}' },
        then: 'lines[0].lotId',
      }),
      assertEffect('return.arrived', 'DB: arrival + inspectionDueAt (48h) đã lưu', {
        returnId: '{{returnId}}',
        status: 'ARRIVED',
        inspectionDue: true,
      }),

      reload(),
      waitFor(byRole('button', 'Kiểm tra hàng hoàn'), { within: sectionWith('returnReason') }),
      click(byRole('button', 'Kiểm tra hàng hoàn'), { within: sectionWith('returnReason') }),
      waitFor(byRole('heading', 'Kiểm tra hàng hoàn')),
      fill(byLabel('Thực nhận'), '1'),
      select(byLabel('Phân loại'), { value: 'ACCEPTED' }),
      upload(byLabel('Ảnh kiểm tra riêng tư')),
      click(byRole('button', 'Xác nhận'), { within: inDialog }),
      expectNetwork(
        'Xin signed upload bằng chứng QC',
        { method: 'POST', path: API.returnEvidence, status: 200 },
        { responseContains: { 'data.method': 'PUT' } },
      ),
      expectNetwork(
        'Staff ghi inspection',
        { method: 'POST', path: API.returnInspection, status: 200 },
        {
          payloadContains: {
            receivedQty: 1,
            classification: 'ACCEPTED',
            'evidence.sha256': '{{evidence.sha256}}',
          },
        },
      ),
      waitFor(byText('Đang xử lý kiểm tra chất lượng')),
      screenshot('return-inspected'),
      assertEffect('return.inspected', 'DB: inspection evidence + classification ACCEPTED', {
        returnId: '{{returnId}}',
        receivedQty: 1,
        classification: 'ACCEPTED',
        hasEvidence: true,
      }),

      logout(),
      login('WAREHOUSE_MANAGER'),
      goto(APP_UNDER_TEST.routes.warehouseReturns, 'Hàng hoàn'),
      expectNetwork('Manager tải danh sách hàng hoàn', {
        method: 'GET',
        path: API.returns,
        status: 200,
      }),
      click(byRole('button', 'Duyệt chất lượng / yêu cầu sửa'), {
        within: sectionWith('returnReason'),
      }),
      waitFor(byRole('heading', 'Duyệt chất lượng / yêu cầu sửa')),
      select(byLabel('Kết quả duyệt'), { value: 'APPROVE' }),
      fill(byLabel('Lý do'), '{{scenario.reviewReason}}'),
      click(byRole('button', 'Xác nhận'), { within: inDialog }),
      expectNetwork(
        'Manager duyệt chất lượng độc lập',
        { method: 'POST', path: API.returnReview, status: 200 },
        { payloadContains: { decision: 'APPROVE', reason: '{{scenario.reviewReason}}' } },
      ),
      waitFor(byText('Đã duyệt')),
      assertEffect('return.reviewed', 'DB: reviewer khác inspector, line reviewed', {
        returnId: '{{returnId}}',
        decision: 'APPROVE',
        reviewerDistinctFromInspector: true,
      }),

      logout(),
      login('WAREHOUSE_STAFF'),
      goto(APP_UNDER_TEST.routes.warehouseReturns, 'Hàng hoàn'),
      expectNetwork('Staff tải hàng hoàn đã duyệt', {
        method: 'GET',
        path: API.returns,
        status: 200,
      }),
      click(byRole('button', 'Xác nhận nhập kho / cách ly'), {
        within: sectionWith('returnReason'),
      }),
      waitFor(byRole('heading', 'Xác nhận nhập kho / cách ly')),
      expectNetwork('Tải bin đích theo kho gốc', {
        method: 'GET',
        path: API.returnBins,
        status: 200,
      }),
      capture('returnBinId', { method: 'GET', path: API.returnBins }, 'data.items[0].id'),
      capture('returnBinCode', { method: 'GET', path: API.returnBins }, 'data.items[0].code'),
      select(byLabel('Loại đích đến'), { value: 'SELLABLE' }),
      select(byLabel('Vị trí đích'), { value: '{{returnBinId}}' }),
      fill(byLabel('Quét mã vị trí đích'), '{{returnBinCode}}'),
      fill(byLabel('Quét mã sản phẩm'), '{{returnSku}}'),
      fill(byLabel('Quét lô gốc'), '{{returnLotCode}}'),
      click(byRole('button', 'Xác nhận'), { within: inDialog }),
      expectNetwork(
        'Staff nhập kho hàng hoàn đã duyệt',
        { method: 'POST', path: API.returnStock, status: 200 },
        {
          payloadContains: {
            destination: 'SELLABLE',
            toBinId: '{{returnBinId}}',
            binScan: '{{returnBinCode}}',
            skuScan: '{{returnSku}}',
            lotScan: '{{returnLotCode}}',
            lineId: '{{returnLineId}}',
          },
          responseContains: { 'data.status': 'COMPLETED' },
        },
      ),
      waitFor(byText('Hoàn tất nhập hàng')),
      screenshot('return-restocked'),
      assertEffect(
        'return.restocked',
        'DB: một RETURN stock movement vào bin SELLABLE, giữ lot gốc',
        {
          returnId: '{{returnId}}',
          status: 'COMPLETED',
          destination: 'SELLABLE',
          stockMovements: 1,
          originalLot: true,
        },
      ),
    ],
  },

  // ── trace / recall / CSV / notice (Ops) ───────────────────────────────────────────────────
  {
    id: 'TRACE-01-ops-trace-recall-csv-notice',
    version: 1,
    title: 'Ops trace lô, xuất CSV liên hệ đã che, thu hồi lô và xếp thông báo người bán',
    screen: 'trace/recall',
    covers: ['ops-trace-recall-csv-notice'],
    requirements: ['SS-1139', 'SS-1142'],
    actors: [{ role: 'OPS_DISPATCHER', actorScope: 'PLATFORM' }],
    routes: [APP_UNDER_TEST.routes.inventory],
    dependsOn: ['RET-01-owner-return-ops-reverse-staff-qc-manager-review-stock'],
    preconditions: [
      {
        kind: 'fixture',
        key: 'seed.trace.lotWithProvenance',
        description:
          'Lô từ RET-01 còn provenance đã lấy/giao trong warehouse Ops được phân công; affected recipients còn tồn tại (masked).',
      },
    ],
    syntheticData: { recallReason: 'C08 synthetic lot recall' },
    expected: {
      ui: [
        'Tab "Truy xuất / Thu hồi" hiển thị rows với lotId, picked/returned, trạng thái lô.',
        'Sau thu hồi: trạng thái lô "Thu hồi" và nút "Gửi thông báo cho người bán" xuất hiện.',
        'Modal thông báo nêu rõ xác nhận gửi chưa đồng nghĩa khách đã nhận.',
      ],
      network: [
        'GET trace/lots/:id 200; GET affected 200 (name/phone masked tại BE; CSV escape formula).',
        'POST trace/lots/:id/recall 200 trả releasedQty/reallocatedQty/recoveryCount.',
        'POST trace/lots/:id/notifications 200 trả queued/examined/nextCursor.',
      ],
      persisted: ['trace.rows', 'recall.applied', 'recall.export.audited', 'recall.notice.queued'],
    },
    persistedEffectKeys: [
      'trace.rows',
      'recall.applied',
      'recall.export.audited',
      'recall.notice.queued',
    ],
    steps: [
      login('OPS_DISPATCHER'),
      goto(APP_UNDER_TEST.routes.inventory, 'Truy xuất / Thu hồi'),
      click(byRole('tab', 'Truy xuất / Thu hồi')),
      waitFor(byLabel('ID lô / kiện hàng')),
      select(byLabel('Hướng truy xuất'), { value: 'lots' }),
      fill(byLabel('ID lô / kiện hàng'), '{{lotId}}'),
      click(byRole('button', 'Truy xuất')),
      expectNetwork(
        'Ops trace lô theo forward direction',
        { method: 'GET', path: API.traceLots, status: 200 },
        {
          responseNumberAtLeast: { 'data.items.length': 1 },
          responseContains: { 'data.items.0.lotCode': '{{returnLotCode}}' },
        },
      ),
      waitFor(byText('Đã lấy hàng')),
      screenshot('trace-forward'),
      click(byRole('button', 'Xuất danh sách liên hệ đã che')),
      expectNetwork(
        'Xuất danh sách affected (audited, masked)',
        { method: 'GET', path: API.traceAffected, status: 200 },
        {
          responseNumberAtLeast: { 'data.items.length': 1 },
          responseContains: { 'data.items.0.phone': /\*/ },
        },
      ),
      expectDownload('CSV download thật với header + cell đã che', 'recall-.*\\.csv$', {
        header: 'orderId,parcelId,name,phone,qty',
        requireMasked: true,
        timeoutMs: 20000,
      }),
      assertEffect('trace.rows', 'DB: trace projection có provenance thật, không PII chưa che', {
        lotId: '{{lotId}}',
        rows: 1,
      }),
      assertEffect(
        'recall.export.audited',
        'DB/audit: mỗi page export affected được audit, không raw contact',
        { lotId: '{{lotId}}', maskedExport: true, auditRows: 1 },
      ),
      click(byRole('button', 'Thu hồi lô')),
      waitFor(byRole('heading', 'Thu hồi lô')),
      fill(byLabel('Lý do thu hồi'), '{{scenario.recallReason}}'),
      click(byRole('button', 'Xác nhận thu hồi'), { within: inDialog }),
      expectNetwork(
        'Thu hồi lô',
        { method: 'POST', path: API.traceRecall, status: 200 },
        {
          payloadContains: { reason: '{{scenario.recallReason}}' },
          payloadHasKeys: ['operationId', 'expectedVersion', 'reason'],
          responseHasKeys: ['data.releasedQty', 'data.reallocatedQty', 'data.recoveryCount'],
        },
      ),
      waitFor(byRole('button', 'Đóng'), { within: inDialog }),
      click(byRole('button', 'Đóng'), { within: inDialog }),
      waitFor(byRole('button', 'Gửi thông báo cho người bán')),
      click(byRole('button', 'Gửi thông báo cho người bán')),
      waitFor(byRole('heading', 'Gửi thông báo cho người bán')),
      expectText(
        'UI nêu rõ gửi thành công không đồng nghĩa khách đã nhận',
        'Xác nhận gửi thành công chưa có nghĩa khách hàng đã nhận được.',
      ),
      click(byRole('button', 'Gửi thông báo cho người bán'), { within: inDialog }),
      expectNetwork(
        'Xếp thông báo recall cho seller channel',
        { method: 'POST', path: API.traceNotify, status: 200 },
        { responseHasKeys: ['data.queued', 'data.examined', 'data.nextCursor'] },
      ),
      waitFor(byText(/Đã xếp \d+ thông báo mới/)),
      screenshot('recall-notified'),
      assertEffect(
        'recall.applied',
        'DB: lot RECALLED, released/reallocated/recovery đúng transaction + outbox',
        { lotId: '{{lotId}}', lotStatus: 'RECALLED', outboxEvents: 1 },
      ),
      assertEffect(
        'recall.notice.queued',
        'DB: notice dedupe theo (lotId, parcelId), chưa tuyên khách đã nhận',
        { lotId: '{{lotId}}', dedupe: true },
      ),
    ],
  },

  // ── n8n outage: core vẫn chạy, notice không được tuyên delivered ─────────────────────────
  {
    id: 'N8N-01-notice-delivery-outage',
    version: 1,
    title: 'n8n offline: trace/notice core vẫn chạy, delivery vẫn PENDING và không đổi stock',
    screen: 'trace/recall — n8n outage',
    covers: ['n8n-outage'],
    requirements: ['SS-1139', 'SS-1150'],
    actors: [{ role: 'OPS_DISPATCHER', actorScope: 'PLATFORM' }],
    routes: [APP_UNDER_TEST.routes.inventory],
    dependsOn: ['TRACE-01-ops-trace-recall-csv-notice'],
    preconditions: [
      {
        kind: 'env',
        name: 'P3_N8N_OFFLINE',
        description: 'C11 bật n8n offline (không có SMTP/webhook delivery) cho run này.',
      },
      {
        kind: 'fixture',
        key: 'seed.n8n.offline',
        description: 'C11 xác nhận n8n không chạy/không delivery được trước scenario.',
      },
      {
        kind: 'fixture',
        key: 'seed.trace.recalledLot',
        description: 'Lô đã RECALLED từ TRACE-01 với notice PENDING (chưa DELIVERED).',
      },
    ],
    expected: {
      ui: [
        'UI vẫn trace được lô đã thu hồi và vẫn mở form thông báo; không hiển thị trạng thái "đã gửi/đã nhận".',
      ],
      network: [
        'GET trace/lots/:id 200; POST notifications 200 trả queued/examined (dedupe giữ nguyên).',
        'Không có network success giả cho delivery; delivery state do worker/n8n ngoài browser quyết định.',
      ],
      persisted: ['notice.pendingUnderOutage', 'stock.unchangedDuringOutage'],
    },
    persistedEffectKeys: ['notice.pendingUnderOutage', 'stock.unchangedDuringOutage'],
    steps: [
      login('OPS_DISPATCHER'),
      goto(APP_UNDER_TEST.routes.inventory, 'Truy xuất / Thu hồi'),
      click(byRole('tab', 'Truy xuất / Thu hồi')),
      waitFor(byLabel('ID lô / kiện hàng')),
      select(byLabel('Hướng truy xuất'), { value: 'lots' }),
      fill(byLabel('ID lô / kiện hàng'), '{{lotId}}'),
      click(byRole('button', 'Truy xuất')),
      expectNetwork(
        'Core trace vẫn chạy khi n8n offline',
        { method: 'GET', path: API.traceLots, status: 200 },
        { responseNumberAtLeast: { 'data.items.length': 1 } },
      ),
      waitFor(byText('Thu hồi')),
      click(byRole('button', 'Gửi thông báo cho người bán')),
      waitFor(byRole('heading', 'Gửi thông báo cho người bán')),
      expectText(
        'Không tuyên bố khách đã nhận thông báo',
        'Xác nhận gửi thành công chưa có nghĩa khách hàng đã nhận được.',
      ),
      click(byRole('button', 'Gửi thông báo cho người bán'), { within: inDialog }),
      expectNetwork(
        'Queue notice idempotent trong outage',
        { method: 'POST', path: API.traceNotify, status: 200 },
        { responseHasKeys: ['data.queued', 'data.examined', 'data.nextCursor'] },
      ),
      screenshot('n8n-offline-notice'),
      assertEffect(
        'notice.pendingUnderOutage',
        'DB: notice không DELIVERED khi n8n offline, retry bounded',
        {
          lotId: '{{lotId}}',
          allowedStatus: ['PENDING', 'SENDING', 'FAILED', 'UNKNOWN'],
          delivered: false,
        },
      ),
      assertEffect(
        'stock.unchangedDuringOutage',
        'DB: notice/outage không tạo/thay đổi stock movement',
        { lotId: '{{lotId}}', stockMovementsUnchanged: true },
      ),
    ],
  },

  // ── unknown outcome: request bị chặn ở network, retry cùng operationId ───────────────────
  {
    id: 'FAULT-01-unknown-outcome-same-operation',
    version: 1,
    title:
      'Mất mạng trước khi request tới server: UI giữ operation và retry đúng cùng payload (không chứng minh server-committed-response-lost)',
    screen: 'màn 4 — cycle count (unknown outcome)',
    covers: ['unknown-outcome'],
    requirements: ['SS-1144', 'SS-1145'],
    actors: [{ role: 'WAREHOUSE_STAFF', actorScope: 'PLATFORM' }],
    routes: [APP_UNDER_TEST.routes.counts],
    preconditions: [
      {
        kind: 'fixture',
        key: 'seed.count.pendingObservation',
        description:
          'C11 seed: một kế hoạch PLANNED giao đúng Staff với đúng một line chưa đếm (bin/SKU/lot LOT_BIN).',
      },
    ],
    syntheticData: {
      observedQty: 7,
      faultMode:
        'CDP Fetch.failRequest tại request stage: request KHÔNG tới server; trường hợp server đã commit nhưng client mất response là limitation NOT VERIFIED (cần fault-injection endpoint/proxy riêng)',
    },
    expected: {
      ui: [
        'Lần gửi đầu bị chặn ở network: hiển thị "Chưa xác nhận được thao tác...", form giữ nguyên, nút "Gửi lại thao tác đã lưu".',
        'Sau khi bỏ chặn, retry gửi đúng operationId/payload và thành công "Chờ duyệt".',
      ],
      network: [
        'Lần 1 không có response 2xx (request bị chặn trước server); lần 2 POST observation 200.',
        'LIMITATION: chưa chứng minh replay khi server đã commit nhưng client mất response (xem SS-1151 doc).',
        'operationId và các field nội dung giống nhau giữa hai lần gửi.',
      ],
      persisted: ['count.unknownOutcome.singleObservation'],
    },
    persistedEffectKeys: ['count.unknownOutcome.singleObservation'],
    steps: [
      login('WAREHOUSE_STAFF'),
      goto(APP_UNDER_TEST.routes.counts, 'Kiểm kê, nhập trả và tiêu hủy'),
      expectNetwork('Staff tải kế hoạch seed', { method: 'GET', path: API.countList, status: 200 }),
      capture('faultCountId', { method: 'GET', path: API.countList }, 'data.items[0].id'),
      capture('faultReason', { method: 'GET', path: API.countList }, 'data.items[0].createReason'),
      capture(
        'faultBinScan',
        { method: 'GET', path: API.countList },
        'data.items[0].lines[0].binCode',
      ),
      capture('faultSkuScan', { method: 'GET', path: API.countList }, 'data.items[0].lines[0].sku'),
      capture(
        'faultLotScan',
        { method: 'GET', path: API.countList },
        'data.items[0].lines[0].lotCode',
      ),
      click(byRole('button', 'Nộp kết quả đếm'), { within: sectionWith('faultReason') }),
      waitFor(byRole('heading', 'Nộp kết quả đếm')),
      fill(byLabel('Số lượng'), '{{scenario.observedQty}}'),
      fill(byLabel('Quét mã vị trí'), '{{faultBinScan}}'),
      fill(byLabel('Quét mã sản phẩm'), '{{faultSkuScan}}'),
      fill(byLabel('Quét mã lô'), '{{faultLotScan}}'),
      upload(byLabel('Ảnh bằng chứng riêng tư (PNG/JPEG/WebP, tối đa 5 MB)')),
      block('*inventory-workflows/counts/*/observation*'),
      click(byRole('button', 'Xác nhận'), { within: inDialog }),
      waitFor(byRole('button', 'Gửi lại thao tác đã lưu'), { timeoutMs: 45000 }),
      expectText('UI báo chưa xác nhận được thao tác', 'Chưa xác nhận được thao tác.'),
      screenshot('unknown-outcome-blocked'),
      unblock(),
      click(byRole('button', 'Gửi lại thao tác đã lưu'), { within: inDialog }),
      expectNetwork(
        'Retry gửi observation sau khi bỏ chặn',
        { method: 'POST', path: API.countObservation, status: 200 },
        { payloadContains: { observedQty: '{{scenario.observedQty}}' } },
      ),
      expectReplayedRequest(
        'Retry giữ đúng operationId/nội dung của lần gửi mất mạng',
        { method: 'POST', path: API.countObservation },
        ['operationId', 'lineId', 'observedQty', 'binScan', 'skuScan', 'lotScan'],
      ),
      waitFor(byText('Chờ duyệt')),
      assertEffect(
        'count.unknownOutcome.singleObservation',
        'DB: chỉ một observation/ledger cho line, không nhân đôi',
        { countId: '{{faultCountId}}', observations: 1 },
      ),
    ],
  },

  // ── role/scope denial (Accountant + Seller Owner trên surface kho/trace) ──────────────────
  {
    id: 'RBAC-01-accountant-owner-denied-surfaces',
    version: 1,
    title: 'Accountant và Seller Owner bị chặn khỏi màn kho/trace; 403 không đăng xuất',
    screen: 'role/scope guard',
    covers: ['revoke-scope-change'],
    requirements: ['SS-1022', 'SS-1139'],
    actors: [
      { role: 'ORCA_ACCOUNTANT', actorScope: 'PLATFORM' },
      { role: 'SELLER_OWNER', actorScope: 'TENANT' },
    ],
    routes: [APP_UNDER_TEST.routes.counts, APP_UNDER_TEST.routes.inventory],
    preconditions: [],
    syntheticData: {},
    expected: {
      ui: [
        'Accountant vào thẳng /warehouse/counts thấy trang 403 "Không có quyền truy cập", vẫn còn phiên.',
        'Seller Owner vào /inventory không thấy tab "Truy xuất / Thu hồi".',
      ],
      network: [
        'Accountant: không có request counts nào được gửi; refresh session vẫn 200.',
        'Owner: không có request /trace/*; không gọi recall/notification.',
      ],
      persisted: [],
    },
    persistedEffectKeys: [],
    steps: [
      login('ORCA_ACCOUNTANT'),
      goto(APP_UNDER_TEST.routes.counts),
      waitFor(byText('Không có quyền truy cập')),
      expectUrl('Ở lại trang 403 trong phiên', '/403'),
      expectHidden('Không render nút tạo kế hoạch', byRole('button', 'Tạo kế hoạch kiểm kê')),
      expectRequestCount(
        'Không gọi counts khi bị chặn route',
        { method: 'GET', path: API.countList },
        { max: 0 },
      ),
      screenshot('accountant-403'),
      logout(),
      login('SELLER_OWNER'),
      goto(APP_UNDER_TEST.routes.inventory, 'Tồn kho đa kho'),
      expectHidden('Owner không thấy tab trace/recall', byRole('tab', 'Truy xuất / Thu hồi')),
      expectRequestCount(
        'Owner không gọi recall',
        { method: 'POST', path: API.traceRecall },
        { max: 0 },
      ),
      screenshot('owner-inventory-no-trace'),
    ],
  },

  // ── revoke warehouse assignment → next request denied, 403 không logout ──────────────────
  {
    id: 'SCOPE-01-revoke-warehouse-assignment',
    version: 1,
    title:
      'Admin thu hồi assignment kho; Staff mất quyền ngay request kế tiếp nhưng không bị logout',
    screen: 'scope change',
    covers: ['revoke-scope-change'],
    requirements: ['SS-982', 'SS-1144'],
    actors: [
      { role: 'ORCA_ADMIN', actorScope: 'PLATFORM' },
      { role: 'WAREHOUSE_STAFF', actorScope: 'PLATFORM' },
    ],
    destructive: true,
    routes: [APP_UNDER_TEST.routes.platformStaff, APP_UNDER_TEST.routes.counts],
    preconditions: [
      {
        kind: 'fixture',
        key: 'seed.scope.staffAssigned',
        description:
          'Staff trong scenario đang có assignment tại warehouse kiểm thử (chạy cuối, sau các scenario khác).',
      },
      {
        kind: 'env',
        name: 'P3_WAREHOUSE_STAFF_EMAIL',
        description: 'Email synthetic của Staff dùng để tìm đúng row trong /admin/staff.',
      },
    ],
    syntheticData: {},
    expected: {
      ui: [
        'Admin bỏ chọn toàn bộ kho và lưu thành công ("Đã lưu phân quyền kho.").',
        'Staff request kế tiếp thấy cảnh báo không tải được dữ liệu/không còn kho, KHÔNG bị đẩy về /login.',
      ],
      network: [
        'PUT /v1/admin/staff/:id/warehouses 200 với warehouseIds [].',
        'Sau revoke: GET /v1/warehouses trả 200 rỗng hoặc 403; POST /v1/auth/refresh 200 (phiên còn hiệu lực).',
      ],
      persisted: ['scope.assignment.revoked', 'scope.requestDeniedAfterRevoke'],
    },
    persistedEffectKeys: ['scope.assignment.revoked', 'scope.requestDeniedAfterRevoke'],
    steps: [
      login('ORCA_ADMIN'),
      goto(APP_UNDER_TEST.routes.platformStaff, 'Phân quyền kho cho nhân viên ORCA'),
      waitFor(byText('{{env:P3_WAREHOUSE_STAFF_EMAIL}}')),
      click(byRole('button', 'Gán kho'), { within: rowWithEnv('P3_WAREHOUSE_STAFF_EMAIL') }),
      waitFor(byRole('button', 'Bỏ chọn tất cả')),
      click(byRole('button', 'Bỏ chọn tất cả')),
      click(byRole('button', 'Lưu kho được gán')),
      expectNetwork(
        'Admin thu hồi toàn bộ kho của Staff',
        { method: 'PUT', path: API.staffAssign, status: 200 },
        { payloadMatches: { warehouseIds: { type: 'array', maxLength: 0 } } },
      ),
      waitFor(byText('Đã lưu phân quyền kho.')),
      screenshot('scope-revoked'),
      assertEffect('scope.assignment.revoked', 'DB: assignment rỗng sau thao tác Admin', {
        staffEmailEnv: 'P3_WAREHOUSE_STAFF_EMAIL',
        warehouseIds: 0,
      }),
      assertEffect(
        'scope.requestDeniedAfterRevoke',
        'C11 kiểm scoped DB/API: Staff không còn đọc được warehouse sau revoke',
        { staffEmailEnv: 'P3_WAREHOUSE_STAFF_EMAIL', denied: true },
      ),
      logout(),
      login('WAREHOUSE_STAFF'),
      goto(APP_UNDER_TEST.routes.counts),
      expectNetwork('Session vẫn hợp lệ sau revoke (403 không logout)', {
        method: 'POST',
        path: API.refresh,
        status: 200,
      }),
      expectNetwork(
        'Request kho phản ánh scope mới (rỗng hoặc 403)',
        { method: 'GET', path: API.warehouses, statusAnyOf: [200, 403] },
        { absentKeys: ['accessToken', 'password'] },
      ),
      expectText(
        'UI báo không còn kho/không tải được dữ liệu trong phạm vi mới',
        /Không tải được|Chưa có kho|không có quyền/i,
      ),
      expectUrl('Vẫn ở route guard cho phép, không quay lại login', '/warehouse/counts'),
      screenshot('scope-deny-after-revoke'),
    ],
  },
]);

export default SCENARIOS;
