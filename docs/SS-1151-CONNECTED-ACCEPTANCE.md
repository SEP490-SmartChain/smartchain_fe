# SS-1151 — C08 connected acceptance (FE browser scenarios, ORCA P3)

**Trạng thái: PREPARED — CONNECTED RUN PENDING.**

Harness và scenario data cho màn 4 (cycle count), màn 5 (returns) và trace/recall đã được dựng và
tự kiểm tra bằng Wave-2 gate. **Connected run chưa chạy**: chờ C11 cung cấp actual API/worker/DB/
Redis disposable, seed contract và fixture-assert service. Tài liệu này **không tuyên PASS** cho
bất kỳ scenario nào.

| Hạng mục         | Giá trị                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Ngày             | 13 November 2026                                                                                                                     |
| FE repo          | `smartchain_fe` · branch `develop` · base SHA **67de607** (working tree còn P3 changes)                                              |
| BE repo          | `smartchain_be` · SHA **fb0850f** (chỉ là mốc đối chiếu; C08 không sửa BE)                                                           |
| Work order       | `plans/p3/DEEPSEEK-WORK-ORDERS.md` — C08 (test writer + Codex owner report)                                                          |
| Browser adapter  | D07: Chrome for Testing 151 + CDP thuần Node built-ins; không thêm dependency                                                        |
| Wave-2 gate      | PASS — `--dry-run`/`--list` validate data + harness; `--self-test-lock` 16/16, `--check-env` PASS với env loopback; không mở browser |
| Wave-4 connected | **NOT RUN** — chờ C11 disposable environment                                                                                         |
| CI browser lane  | NOT VERIFIED — không có lane browser trong CI hiện tại                                                                               |

> Không dùng screenshot-only, không `route.fulfill`/mock business API, không đọc/ghi production.
> Một kết quả chỉ được gọi là PASS khi mọi scenario được chọn tự assert UI + network thật +
> persisted effect qua fixture-assert service và process thoát 0.

## 1. Phạm vi

- Dùng **actual FE app/router** (Vite dev server) và **actual API** do C11 dựng, trên loopback,
  với dữ liệu synthetic disposable. Không dùng fixture preview/fake fetch của Sprint 5/6 làm
  bằng chứng.
- Màn 4 — cycle count: Manager tạo/assign, Staff đếm mù + scan + evidence, Manager review/post,
  stale → reject → resnapshot → đếm lại → post.
- Màn 5 — returns: Seller Owner request → Ops reverse authorize → Staff arrival/QC →
  Manager review → Staff stock.
- Trace/recall: Ops trace lô, export CSV liên hệ đã che, recall, notice (và biến thể n8n offline).
- Guard: role/scope bị từ chối (Accountant/Seller Owner), thu hồi warehouse assignment,
  unknown-outcome retry cùng operationId.
- Assert trực tiếp request/response live qua CDP Network (method, path, status, payload/response
  keys/giá trị), UI text/visibility/URL, download CSV (header + masking), và persisted effect qua
  fixture-assert service. Không assert qua app backdoor.

### 2.2 Disposable stack lock (P1)

Connected run chỉ được chạy trên stack disposable local; harness áp dụng đồng thời:

1. **Env validation trước khi mở browser** (`--check-env` dùng chung logic): bắt buộc
   `P3_DISPOSABLE=1`, `P3_RUN_ID` hợp lệ, `P3_FE_URL`/`P3_API_URL`/`P3_FIXTURE_ASSERT_URL` là
   `http(s)` loopback (`127.0.0.1`/`localhost`/`::1`), không embed credential; artifact dir phải
   nằm trong `artifacts/` của repo.
2. **Per-request allowlist qua CDP Fetch**: mọi request `http(s)/ws(s)` bị pause; chỉ origin của
   đúng FE/API/fixture-assert của run được `continue`, còn lại bị `Fetch.failRequest`
   (`BlockedByClient`) và scenario FAIL với `NETWORK_ORIGIN_BLOCKED`. Navigation cũng bị kiểm
   origin trước và sau khi load. Fault injection dùng cùng cơ chế nên không thể tắt guard.
3. **Run binding**: `P3_RUN_ID` đi vào artifact dir, run manifest, trace và fixture-assert; browser
   profile là thư mục tạm riêng theo run và luôn bị xoá trong `finally`.

### Deliverable

| File                                        | Vai trò                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `tests/p3-connected-browser.mjs`            | Harness CDP thuần Node; CLI `--dry-run`, `--list`, `--scenario`, run-all |
| `tests/fixtures/p3-connected-scenarios.mjs` | Versioned scenario data (data-only, không credentials/PII); fixture v1   |
| `docs/SS-1151-CONNECTED-ACCEPTANCE.md`      | Report này: matrix, env, commands, C11 preconditions, giới hạn           |

## 2. Harness — cách chạy và điều kiện

### 2.1 CLI

| Lệnh                                                   | Hành vi                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node tests/p3-connected-browser.mjs --dry-run`        | Validate import/step schema/targets/request matchers/dependency order/duplicate id/capture/screenshot/coverage/REQUIRED_ENV shape. Không cần env, **không mở browser**. Exit 0 khi hợp lệ và in `PREPARED — CONNECTED RUN PENDING`; exit 1 khi scenario malformed/unknown step kind/missing dependency/duplicate id. |
| `node tests/p3-connected-browser.mjs --list`           | In scenario id, title, role/scope, screen, số step, dependency, coverage. Exit 0.                                                                                                                                                                                                                                    |
| `node tests/p3-connected-browser.mjs --check-env`      | Validate disposable lock (P3_DISPOSABLE=1, P3_RUN_ID hợp lệ, FE/API/fixture-assert là loopback, artifact path trong repo); không mở browser. Exit 0 = lock hợp lệ, 2 = NOT RUN kèm lý do.                                                                                                                            |
| `node tests/p3-connected-browser.mjs --self-test-lock` | Self-test deterministic allowlist/lock (16 check, không cần env/browser): chặn external host, LAN IP, sai port, sai scheme, run-id traversal, artifacts ngoài repo; exit 0 = PASS.                                                                                                                                   |
| `node tests/p3-connected-browser.mjs --scenario=<id>`  | Chạy một scenario **cùng dependency closure** (ví dụ COUNT-02 cần COUNT-01 để có capture/seed state).                                                                                                                                                                                                                |
| `node tests/p3-connected-browser.mjs`                  | Chạy toàn bộ 10 scenario theo dependency order; scenario `destructive` chạy cuối.                                                                                                                                                                                                                                    |

Exit codes: `0` = pass/valid; `1` = assert fail, timeout, harness error hoặc scenario data sai;
`2` = **NOT RUN** (thiếu env, FE/API/fixture-assert không reachable, browser không có, hoặc
precondition scenario-level như `P3_N8N_OFFLINE` chưa bật). NOT RUN không bao giờ được ghi thành PASS.

### 2.2 Cơ chế chạy thật (không mock)

- Launch Chrome headless với `--headless=new --remote-debugging-port=0 --user-data-dir=<tmp runId>
--no-first-run --no-default-browser-check --disable-gpu` (headless-shell bỏ `--headless=new`).
  Đọc endpoint từ `<user-data-dir>/DevToolsActivePort` (fallback `http://127.0.0.1:<port>/json/version`),
  mở WebSocket CDP, gửi command có id và await response, subscribe event.
- Mỗi scenario chạy trong **browser context riêng** (cookie/localStorage sạch); `APP_LOCALE=vi`
  được set để khớp label tiếng Việt của scenario; mỗi scenario kết thúc dispose context.
- Login/logout là plumbing thật: login điền form `#login-email`/`#login-password` (env
  `P3_<ROLE>_EMAIL`/`P3_<ROLE>_PASSWORD`), hỗ trợ `P3_LOGIN_WORKSPACE_SLUG` khi API trả 409,
  chờ `POST /v1/auth/login` 200 rồi rời `/login`; logout qua user menu → `Đăng xuất` → về `/login`.
- Network recorder chỉ ghi request/response **thật** từ CDP `Network.*`; assertion dùng cửa sổ
  “sau action gần nhất” (không nhận record cũ) để tránh stale PASS. Retry assertion poll có timeout
  bounded, fail ghi rõ status/path/candidate gần nhất.
- Fault: `Network.setBlockedURLs` cho `block`, fallback `Fetch.failRequest`; `offline`/`online`
  qua `Network.emulateNetworkConditions`. Không mock response.
- Download CSV: `Browser.setDownloadBehavior` (fallback `Page.setDownloadBehavior`) vào `downloads/`
  của run, kiểm file ổn định rồi đọc; fallback đọc response body khi response là attachment/CSV. Assert header + masking: reject cell
  điện thoại 9–12 chữ số không mask và yêu cầu có cell chứa `*`.
- Fixture-assert: `POST $P3_FIXTURE_ASSERT_URL` JSON `{key, params, scenarioId, runId}` + header
  `Authorization: Bearer $P3_FIXTURE_ASSERT_TOKEN`; chỉ PASS khi response JSON `{ok:true, runId}`
  khớp đúng `P3_RUN_ID` — response của run khác bị từ chối (`FIXTURE_ASSERT_RUN_MISMATCH`).
  Network/5xx/401/403 từ service được coi là NOT RUN (môi trường), không phải PASS.
- Screenshot lưu `artifacts/p3-connected/<runId>/<name>.png`; fail tự chụp
  `failure-<scenarioId>.png`. `P3_TRACE=1` thêm network snapshot vào `trace.jsonl`.
- Cleanup browser + temp profile + context nằm trong `finally`; SIGINT/SIGTERM cũng cleanup trước khi exit.

### 2.3 Step kinds được implement

`login`, `logout`, `goto`, `click`, `fill`, `select`, `upload`, `waitFor`, `wait`, `reload`,
`fault` (`block|unblock|offline|online`), `capture`, `expectNetwork`, `expectRequestCount`,
`expectReplayedRequest`, `expectText`, `expectHidden`, `expectUrl`, `expectDownload`,
`waitForNetwork`, `fixtureAssert`, `screenshot`.

Selector strategies: `css | label | role | text | placeholder` (+ `closest`, `index`, `within`).
Step kind không thực thi được đầy đủ sẽ fail `UNSUPPORTED_STEP` (ví dụ select target không phải
native `<select>`, upload target không có `input[type=file]`) — không silent skip.

`expectNetwork` assert được: `status`/`statusAnyOf`, `payloadHasKeys`, `payloadContains`,
`payloadMatches` (shape như `{type:'array',maxLength:0}`), `responseHasKeys`, `responseContains`
(kể cả RegExp), `responseNumberAtLeast`, `absentKeys` (deep key presence), timeout bounded.
`expectReplayedRequest` so sánh đúng `operationId`/`lineId`/`observedQty`/scan fields giữa 2 request;
request bị chặn vẫn phải còn `postData` thì assertion mới pass (nếu capability CDP không giữ payload
thì fail rõ, không bỏ qua).

## 3. Scenario matrix (id → role → UI/network/effect)

Thứ tự chạy: COUNT-01 → COUNT-02 → COUNT-03; RET-01 → TRACE-01 → N8N-01; COUNT-04, FAULT-01,
RBAC-01, SCOPE-01 độc lập; SCOPE-01 `destructive` chạy cuối.

| #   | Scenario id                                                     | Role/scope                                                                                 | Màn / mục tiêu                                                                                 | Network chính                                                                                                                                                                                                                                                                                                                                             | Persisted effect (fixture-assert key)                                                                                |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 01  | `COUNT-01-manager-create-assign`                                | `WAREHOUSE_MANAGER@PLATFORM`                                                               | Màn 4: tạo kế hoạch + giao lại người đếm                                                       | GET warehouses 200; GET counts/options 200; POST counts 201 (`PLANNED`, lineCount≥1, operationId/assigneeId/reason/binIds); POST counts/:id/assignment 200 (`expectedVersion`)                                                                                                                                                                            | `count.plan.created`; `count.assignment.applied`                                                                     |
| 02  | `COUNT-02-staff-blind-observe-evidence`                         | `WAREHOUSE_STAFF@PLATFORM`                                                                 | Màn 4: đếm mù, scan bin/SKU/lot, upload evidence rồi gửi observation                           | GET counts 200 **không có** `expectedQty`/`varianceQty`/`variancePercent`; POST evidence 200 (signed PUT); POST observation 200 (`observedQty`, scans, `evidence.sha256` khớp file)                                                                                                                                                                       | `count.observation.blind`                                                                                            |
| 03  | `COUNT-03-manager-review-post`                                  | `WAREHOUSE_MANAGER@PLATFORM`                                                               | Màn 4: Manager duyệt rồi ghi nhận kiểm kê đúng một lần                                         | POST review 200 (`decision=APPROVE`, reason); POST post 200 đúng 1 lần (`status=POSTED`); `expectRequestCount` post ≤ 1                                                                                                                                                                                                                                   | `count.review.approved`; `count.posted`                                                                              |
| 04  | `COUNT-04-stale-reject-resnapshot-recount`                      | `WAREHOUSE_MANAGER`, `WAREHOUSE_STAFF` (PLATFORM)                                          | Màn 4: reject vòng 1 → resnapshot → đếm lại vòng 2 → duyệt → post                              | POST observation 200; POST review `REJECT` 200; POST resnapshot 200 (`PLANNED`); observation vòng 2 200 (version mới, không 409); review `APPROVE`; post `POSTED`                                                                                                                                                                                         | `count.resnapshot.round`; `count.recount.posted`                                                                     |
| 05  | `RET-01-owner-return-ops-reverse-staff-qc-manager-review-stock` | `SELLER_OWNER@TENANT`, `OPS_DISPATCHER`, `WAREHOUSE_STAFF`, `WAREHOUSE_MANAGER` (PLATFORM) | Màn 5: Owner request → Ops reverse → Staff arrival/QC → Manager review → Staff stock           | POST returns 201 (`REQUESTED`, `operationId`/lines/pickup); POST authorize 200 (`AUTHORIZED`, parcel weight); POST arrival 200 (`ARRIVED`); POST evidence 200 (signed PUT); POST inspection 200 (`receivedQty`, `ACCEPTED`, evidence sha); POST review 200 (`APPROVE`); POST stock 200 (`COMPLETED`, `SELLABLE`, toBinId/scan khớp lot gốc); GET bins 200 | `return.requested`; `return.authorized`; `return.arrived`; `return.inspected`; `return.reviewed`; `return.restocked` |
| 06  | `TRACE-01-ops-trace-recall-csv-notice`                          | `OPS_DISPATCHER@PLATFORM`                                                                  | Trace/recall: trace lô, CSV masked, recall, notice người bán                                   | GET trace/lots/:id 200 (items≥1, lotCode); GET affected 200 (phone masked bằng `*`); POST recall 200 (released/reallocated/recovery); POST notifications 200 (queued/examined/nextCursor); download CSV `recall-*.csv` header + masked                                                                                                                    | `trace.rows`; `recall.applied`; `recall.export.audited`; `recall.notice.queued`                                      |
| 07  | `N8N-01-notice-delivery-outage`                                 | `OPS_DISPATCHER@PLATFORM`                                                                  | Trace/recall khi n8n offline: core vẫn chạy, delivery vẫn PENDING                              | GET trace/lots/:id 200; POST notifications 200 (queued/examined, dedupe); không có success delivery giả trong browser                                                                                                                                                                                                                                     | `notice.pendingUnderOutage`; `stock.unchangedDuringOutage`                                                           |
| 08  | `FAULT-01-unknown-outcome-same-operation`                       | `WAREHOUSE_STAFF@PLATFORM`                                                                 | Màn 4: mất mạng **trước khi request tới server**, retry cùng operationId (xem limitation 11.3) | Lần 1 request bị Fetch.failRequest ở request stage (không tới server, không có response 2xx); UI giữ form + thông báo “Chưa xác nhận được thao tác”; retry POST observation 200; 2 request cùng `operationId`/lineId/observedQty/bin/SKU/lot                                                                                                              | `count.unknownOutcome.singleObservation`                                                                             |
| 09  | `RBAC-01-accountant-owner-denied-surfaces`                      | `ORCA_ACCOUNTANT@PLATFORM`, `SELLER_OWNER@TENANT`                                          | Guard 403 không logout; Owner không thấy tab trace/recall                                      | Accountant: 0 request counts, session refresh 200; ở lại `/403`. Owner: không có request trace/recall/notification; vẫn ở route inventory                                                                                                                                                                                                                 | — (không có persisted effect)                                                                                        |
| 10  | `SCOPE-01-revoke-warehouse-assignment`                          | `ORCA_ADMIN@PLATFORM`, `WAREHOUSE_STAFF@PLATFORM`                                          | Admin thu hồi toàn bộ kho; Staff mất scope ngay request sau                                    | PUT admin/staff/:id/warehouses 200 với `warehouseIds=[]`; sau revoke refresh 200, GET warehouses 200 rỗng hoặc 403; vẫn ở `/warehouse/counts`, không về `/login`                                                                                                                                                                                          | `scope.assignment.revoked`; `scope.requestDeniedAfterRevoke`                                                         |

## 4. Coverage mapping (9 acceptance bullets)

| Bullet                                                    | Scenario           |
| --------------------------------------------------------- | ------------------ |
| `manager-create-assign`                                   | COUNT-01           |
| `staff-scan-evidence-blind`                               | COUNT-02           |
| `manager-review-post`                                     | COUNT-03           |
| `stale-recount`                                           | COUNT-04           |
| `owner-return-ops-reverse-staff-qc-manager-approve-stock` | RET-01             |
| `ops-trace-recall-csv-notice`                             | TRACE-01           |
| `revoke-scope-change`                                     | RBAC-01 + SCOPE-01 |
| `unknown-outcome`                                         | FAULT-01           |
| `n8n-outage`                                              | N8N-01             |

## 5. Env matrix (chỉ tên biến — không ghi value/secret vào repo)

### 5.1 Runtime bắt buộc

| Env                       | Ý nghĩa                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `P3_DISPOSABLE`           | **Bắt buộc = `1`**; từ chối chạy nếu thiếu (khóa disposable stack)                   |
| `P3_RUN_ID`               | **Bắt buộc**; khóa run/evidence/fixture, pattern `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` |
| `P3_FE_URL`               | FE dev server thật; default `http://127.0.0.1:2324`; phải loopback                   |
| `P3_API_URL`              | API disposable của C11 (dùng cho preflight reachability)                             |
| `P3_FIXTURE_ASSERT_URL`   | Endpoint fixture-assert an toàn do C11 cung cấp; phải loopback                       |
| `P3_FIXTURE_ASSERT_TOKEN` | Token của fixture-assert (không in/log)                                              |

### 5.2 Credentials theo role (chỉ role được chọn mới bắt buộc)

`P3_<ROLE>_EMAIL` + `P3_<ROLE>_PASSWORD` cho: `ORCA_ADMIN`, `OPS_DISPATCHER`,
`WAREHOUSE_MANAGER`, `WAREHOUSE_STAFF`, `ORCA_ACCOUNTANT`, `SELLER_OWNER`
(`SELLER_STAFF` nằm trong danh sách role nhưng không scenario C08 nào login role này).

`P3_WAREHOUSE_STAFF_EMAIL` đồng thời là email synthetic hiển thị trong `/admin/staff` (scenario
SCOPE-01 dùng để tìm đúng row Staff).

### 5.3 Scenario-scoped

| Env                        | Dùng bởi | Điều kiện                                                    |
| -------------------------- | -------- | ------------------------------------------------------------ |
| `P3_N8N_OFFLINE`           | N8N-01   | phải truthy (`1`/`true`); nếu thiếu/false scenario = NOT RUN |
| `P3_WAREHOUSE_STAFF_EMAIL` | SCOPE-01 | env credential của role `WAREHOUSE_STAFF`                    |

### 5.4 Optional

| Env                       | Ý nghĩa                                                                 |
| ------------------------- | ----------------------------------------------------------------------- |
| `P3_BROWSER_BIN`          | Override Chrome/Chrome-for-Testing binary (D07)                         |
| `P3_LOGIN_WORKSPACE_SLUG` | Needed only if login trả 409 (email dùng chung nhiều workspace)         |
| `P3_BE_SHA` / `P3_FE_SHA` | Ghi vào `run.json`/`summary.json` cho provenance (khuyến nghị bắt buộc) |
| `P3_TRACE`                | `1` = thêm network snapshot từng step vào `trace.jsonl`                 |
| `P3_ARTIFACTS_DIR`        | Override thư mục artifact (default `artifacts/p3-connected`)            |

Harness chỉ in **tên biến + presence**, không in value. Không commit artifact, token hay env file.

## 6. Wave 2 — verification đã chạy (local)

CWD cho tất cả lệnh: `/Users/vtafi/Project/University/smartchain_fe`.

| Lệnh                                                                                                                                               | Exit | Ghi chú                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------ |
| `node --check tests/p3-connected-browser.mjs`                                                                                                      | 0    | Syntax OK                                                                                                          |
| `node --check tests/fixtures/p3-connected-scenarios.mjs`                                                                                           | 0    | Syntax OK                                                                                                          |
| `node tests/p3-connected-browser.mjs --dry-run`                                                                                                    | 0    | 10 scenarios · 364 steps · 21 step kinds (22nd `wait` supported, chưa dùng); in `PREPARED — CONNECTED RUN PENDING` |
| `node tests/p3-connected-browser.mjs --list`                                                                                                       | 0    | In đủ 10 scenario + role/dependency/coverage                                                                       |
| `node_modules/.bin/prettier --check tests/p3-connected-browser.mjs tests/fixtures/p3-connected-scenarios.mjs docs/SS-1151-CONNECTED-ACCEPTANCE.md` | 0    | Format gate                                                                                                        |
| `node tests/p3-connected-browser.mjs` (không set env)                                                                                              | 2    | NOT RUN rõ danh sách env thiếu; **không mở browser**, không ghi PASS                                               |
| Negative `--dry-run` trên bản copy trong `/tmp` (unknown step kind, duplicate scenario id, missing dependency, unknown selector strategy)          | 1    | Mỗi case đều fail validation, chứng minh dry-run không pass ẩu; không sửa fixture repo                             |

`--dry-run` kiểm tra: module exports/`FIXTURE_VERSION`/`ORCA_ROLES`/`ACTOR_SCOPES`/`REQUIRED_COVERAGE`/
`REQUIRED_ENV` shape, `APP_UNDER_TEST.routes`, schema từng scenario, step kind + field whitelist,
selector targets, request matcher regex/HTTP status, timeout bounds, duplicate scenario id/capture/
screenshot, dependency graph + declaration order + cycle, variable resolution theo dependency closure
(`{{scenario.*}}`, `{{env:*}}`, `{{evidence.*}}`, capture), fixture-assert key ↔ `persistedEffectKeys`,
coverage 9/9 và screenshot name uniqueness trong cùng run dir.

## 7. Wave 4 — connected run (CHƯA CHẠY, chờ C11)

Khi C11 đã dựng xong môi trường disposable, chạy đúng cây FE đang review (ghi SHA + trạng thái
working tree) với env từ secret manager/local shell (ví dụ dạng dưới đây, giá trị `<...>` chỉ là
placeholder — không commit):

```bash
cd /Users/vtafi/Project/University/smartchain_fe
P3_FE_URL=http://127.0.0.1:2324 \
P3_API_URL=http://127.0.0.1:3000/api \
P3_FIXTURE_ASSERT_URL=http://127.0.0.1:3100/fixture-assert \
P3_FIXTURE_ASSERT_TOKEN="<C11 token>" \
P3_ORCA_ADMIN_EMAIL="<synthetic>" P3_ORCA_ADMIN_PASSWORD="<synthetic>" \
P3_OPS_DISPATCHER_EMAIL="<synthetic>" P3_OPS_DISPATCHER_PASSWORD="<synthetic>" \
P3_WAREHOUSE_MANAGER_EMAIL="<synthetic>" P3_WAREHOUSE_MANAGER_PASSWORD="<synthetic>" \
P3_WAREHOUSE_STAFF_EMAIL="<synthetic>" P3_WAREHOUSE_STAFF_PASSWORD="<synthetic>" \
P3_ORCA_ACCOUNTANT_EMAIL="<synthetic>" P3_ORCA_ACCOUNTANT_PASSWORD="<synthetic>" \
P3_SELLER_OWNER_EMAIL="<synthetic>" P3_SELLER_OWNER_PASSWORD="<synthetic>" \
P3_N8N_OFFLINE=1 \
P3_BE_SHA=fb0850f P3_FE_SHA=67de607+<dirty> \
P3_TRACE=1 \
node tests/p3-connected-browser.mjs
```

Chạy lẻ (kèm dependency closure) để điều tra:

```bash
node tests/p3-connected-browser.mjs --scenario=COUNT-01-manager-create-assign
node tests/p3-connected-browser.mjs --scenario=RET-01-owner-return-ops-reverse-staff-qc-manager-review-stock
```

Điều kiện để gọi PASS (Wave 4):

1. Process exit 0 và `summary.json.status = PASS` với đủ scenario được chọn.
2. Mọi `expectNetwork` khớp request/response thật (không có fallback stub) và mọi
   `fixtureAssert` trả `{ok:true}`.
3. Không có step fail/timeout; screenshot + trace gắn `runId`, `P3_FE_SHA`/`P3_BE_SHA` và browser
   version.
4. Download CSV có header đúng và masking hợp lệ (không có cell phone 9–12 số không mask).

Nếu thiếu bất kỳ điều kiện nào → FAIL/NOT RUN tương ứng, không được ghi PASS một phần.

## 8. Evidence layout (khi chạy thật)

```text
artifacts/p3-connected/<runId>/          # untracked, local-only
├── run.json                             # runId, FE/BE SHA, browser version, env names/presence, mode
├── summary.json                         # PASS/FAIL/NOT RUN + counts + coverage + error
├── trace.jsonl                          # step + (P3_TRACE) network snapshot
├── scenario-<id>.json                   # steps, requestIds, fixtureAsserts, screenshots, console errors
├── <screenshot-name>.png                # 19 screenshot theo scenario
├── failure-<scenarioId>.png             # chỉ khi scenario fail
├── uploads/evidence-synthetic.png       # PNG 64×64 deterministic, kèm sha256/fileSize
└── downloads/<scenarioId>/              # CSV export (RECALL-*.csv)
```

`runId` dạng `2026...Z-<4hex>`; SHA lấy từ `P3_FE_SHA`/`P3_BE_SHA` (nếu thiếu ghi `UNRECORDED` —
Wave 4 nên set). Artifact không được commit; khi bàn giao chỉ ghi đường dẫn + runId + SHA.

## 9. Preconditions C11 (chưa có trong session này → NOT RUN)

### 9.1 Dịch vụ disposable

- Actual FE app/router tại `P3_FE_URL` (Vite dev, không preview fixture, không mock network).
- Actual API tại `P3_API_URL`, worker chạy để xử lý outbox/notice (n8n outage scenario cần n8n
  offline nhưng core API vẫn trả trace/notice queued).
- PostgreSQL/Redis (và Mongo/MinIO nếu API khởi động yêu cầu) disposable, synthetic, không dùng
  project/prod DB; credentials synthetic.
- Fixture-assert service an toàn (không exposed production, không backdoor trong app): nhận
  `POST {key, params, scenarioId}`, xác thực bearer token, trả `{ok:true}` chỉ khi DB/outbox/journal
  thật khớp.

### 9.2 Seed contract

Mỗi scenario khai báo precondition `fixture` key; C11 phải seed đúng và verify trước run:

| Seed key                        | Scenario           | Dữ liệu synthetic bắt buộc                                                                                              |
| ------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `seed.count.warehouseReady`     | COUNT-01, COUNT-04 | Warehouse platform được assign; đúng 1 LOT_BIN stock đếm được (1 bin, 1 SKU, 1 lot); staff directory có đúng 1 Staff    |
| `seed.count.assignedToStaff`    | COUNT-02           | Kế hoạch COUNT-01 vẫn `PLANNED`, giao đúng Staff, line chưa có observation                                              |
| `seed.count.reviewPending`      | COUNT-03           | Kế hoạch COUNT-01 đang `REVIEW` với observation + evidence đủ mọi line                                                  |
| `seed.return.eligibleDelivered` | RET-01             | Delivered order trong cửa sổ 7 ngày, còn qty returnable; origin warehouse có STORAGE bin active; Staff/Manager assigned |
| `seed.trace.lotWithProvenance`  | TRACE-01           | Lot từ RET-01 còn provenance đã lấy/giao trong warehouse Ops được assign; affected recipients còn tồn tại (masked)      |
| `seed.n8n.offline`              | N8N-01             | C11 xác nhận n8n không chạy/không delivery được trước scenario                                                          |
| `seed.trace.recalledLot`        | N8N-01             | Lot đã `RECALLED` từ TRACE-01 với notice `PENDING` (chưa `DELIVERED`)                                                   |
| `seed.count.pendingObservation` | FAULT-01           | Một kế hoạch `PLANNED` giao đúng Staff, đúng 1 line chưa đếm (bin/SKU/lot LOT_BIN)                                      |
| `seed.scope.staffAssigned`      | SCOPE-01           | Staff trong scenario đang assignment tại warehouse kiểm thử (scenario destructive chạy cuối, sau các scenario khác)     |

### 9.3 Fixture-assert contract cho persisted effects

`key` phải thuộc `persistedEffectKeys` của scenario (harness dry-run enforce 2 chiều):

| Scenario | Keys                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| COUNT-01 | `count.plan.created`, `count.assignment.applied`                                                                     |
| COUNT-02 | `count.observation.blind`                                                                                            |
| COUNT-03 | `count.review.approved`, `count.posted`                                                                              |
| COUNT-04 | `count.resnapshot.round`, `count.recount.posted`                                                                     |
| RET-01   | `return.requested`, `return.authorized`, `return.arrived`, `return.inspected`, `return.reviewed`, `return.restocked` |
| TRACE-01 | `trace.rows`, `recall.applied`, `recall.export.audited`, `recall.notice.queued`                                      |
| N8N-01   | `notice.pendingUnderOutage`, `stock.unchangedDuringOutage`                                                           |
| FAULT-01 | `count.unknownOutcome.singleObservation`                                                                             |
| SCOPE-01 | `scope.assignment.revoked`, `scope.requestDeniedAfterRevoke`                                                         |

## 10. Adapter path/version (D07)

- Duyệt: Chrome for Testing **151.0.7922.34** dùng sẵn trong cache máy:
  `~/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
  fallback `~/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`
  hoặc `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- Node **22.23.2**, global `WebSocket` + `fetch`; CDP thuần, **không thêm package/lockfile**
  (repo không có playwright/puppeteer). Browser version thực tế được ghi từ `Browser.getVersion`
  vào `run.json`/`summary.json`.
- Trình duyệt/cache ngoài repo không tái lập trên máy/CI khác → evidence local-only; CI browser
  lane cần approve riêng (ghi NOT VERIFIED).

## 11. Giới hạn / điều chưa xác minh

- **Connected run chưa chạy**: không có screenshot/trace/requestId thật, không có kết quả
  PASS/FAIL per scenario trong tài liệu này. Mọi tuyên bố “đạt” chỉ giới hạn ở Wave-2 validation.
- C11 environment + seed contract + fixture-assert service chưa có trong session tạo harness;
  đây là lý do toàn bộ run thật là NOT RUN.
- Không có CI browser lane; không có proof tái lập trên CI/khác máy.
- FE working tree đang có P3 changes chưa commit (ngoài 3 file C08); Wave 4 phải chạy trên exact
  tree đó và ghi `P3_FE_SHA` + dirty-tree note. Nếu UI/label đổi sau base 67de607, selector có thể
  drift và scenario sẽ FAIL rõ thay vì pass ẩu.
- Test này chứng minh hành vi UI/network/persisted effect của disposable local environment; không
  thay UAT, performance/NFR, security UAT hoặc production readiness.
- Masking CSV được assert heuristic (header, cell phone 9–12 số không mask, có `*`); C10 canary/
  privacy matrix vẫn là gate riêng.
- Harness chỉ chạy Chromium local; không cross-browser.

## 12. Gate status

| Gate                                   | Trạng thái                                         |
| -------------------------------------- | -------------------------------------------------- |
| Wave 2 — scenario + harness validation | PASS (dry-run/list/syntax/prettier, không browser) |
| Wave 4 — connected run trên C11 env    | **NOT RUN — CONNECTED RUN PENDING**                |
| Screenshot/trace/requestId evidence    | Chưa có (chỉ sinh khi Wave 4 chạy)                 |
| CI browser lane                        | NOT VERIFIED                                       |
| UAT / production readiness             | Ngoài phạm vi C08; chưa thực hiện                  |

### 11.3 Giới hạn FAULT-01

FAULT-01 hiện chặn request tại **request stage trước khi tới server**, nên chứng minh được retry
cùng operationId khi request chưa commit. Trường hợp **server đã commit nhưng client mất response**
(post-commit unknown outcome) **NOT VERIFIED** — muốn chứng minh cần fault-injection endpoint/proxy
riêng cho phép drop response sau commit (không dùng app backdoor); đây là dependency còn mở cho
connected run/UAT, không được tuyên PASS thay.

> **Kết luận:** C08 ở trạng thái **PREPARED — CONNECTED RUN PENDING**. Không có scenario nào
> được tuyên PASS cho đến khi Wave 4 chạy trên môi trường C11 disposable và mọi assertion
> UI/network/persisted-effect thật đều pass.
