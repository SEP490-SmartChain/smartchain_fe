# Phạm vi giao diện và phân quyền ORCA

SS-999: tab dịch vụ fulfillment tại `/admin/tariffs` dùng `tariffs.manage`
(PLATFORM Admin/Accountant), theo UC-117 và API
`/v1/commercial/service-tariffs`. Quyền này chỉ quản trị service tariff,
không grant plan/agreement publication, finance posting hoặc carrier secrets.

Ngày 02/10/2026. Baseline làm việc: `Report3_Software Requirement Specification.docx` §2.1, §3.1.3, các UC và BR. Tài liệu thay mô tả orca bốn role. Đây là đặc tả UI theo yêu cầu mới, **không phải tuyên bố các grant/API/screen đã triển khai hoặc được duyệt đầy đủ**.

Policy hiện có ở `src/lib/accessPolicy.ts`; backend có core-auth action catalog riêng. Mọi gap được giữ rõ ở mục 8. Không viết policy code trong đợt tài liệu này. Ma trận screen không được dùng thay action-level API authorization.

## 1. Bảy role và hai actor scope

| Role              | Actor scope | Mục đích và giới hạn                                                                                                                                        |
| ----------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ORCA_ADMIN        | PLATFORM    | Kho, carrier account, staff/assignment, commercial configuration, seller suspension và audit. Không tự suy Admin phải thao tác thay Accountant mọi posting. |
| OPS_DISPATCHER    | PLATFORM    | Allocation/carrier rules, exception/timeout recovery, trace/recall và claim investigation; current warehouse assignment.                                    |
| WAREHOUSE_MANAGER | PLATFORM    | Warehouse task assignment và approvals receiving discrepancy, lot substitution, count/return QC; current assigned warehouses.                               |
| WAREHOUSE_STAFF   | PLATFORM    | Receive/inspect/putaway/pick/pack/handover/count result trong assigned task/kho. Không COD/order values/invoices/API secrets.                               |
| ORCA_ACCOUNTANT   | PLATFORM    | Verified receipts, purchase/sell tariffs, invoices, carrier reconciliation, claim approval, seller ledger/statements/manual payouts.                        |
| SELLER_OWNER      | TENANT      | Một seller; profile/agreement/SKU/ASN/sales orders/API keys/staff/finance; không vận hành kho, carrier account hoặc routing rules.                          |
| SELLER_STAFF      | TENANT      | Role cố định; order/stock read và tạo/sửa/theo dõi ASN. Không SKU edit, sales order create, risky-COD confirm, finance/API key hoặc staff management.       |

Guest chỉ registration/email verification. Sales Channel, 3PL, SePay, n8n và AI là integration actors, không role nhân viên được gán. Internal worker là cơ chế bên trong ORCA.

`TENANT` yêu cầu tenantId có giá trị và mọi effective seller operation trong cùng tenant. `PLATFORM` yêu cầu tenantId null trên principal; seller/warehouse filter là resource context được server kiểm tra. Mixed-scope roles, unknown scope, role không hợp lệ và legacy-only principal đều deny. Không mặc định cấp SUPER_ADMIN nếu không tìm thấy platform grants.

ORCA_ADMIN và ORCA_ACCOUNTANT có all-warehouse scope theo policy hiện có; action permission và RLS vẫn bắt buộc. Các PLATFORM role còn lại phải có active warehouse assignment. UI selected warehouse là filter trong tập server cho phép; không grant quyền. Sau revoke, request kế tiếp và menu/profile refresh phải phản ánh scope mới.

## 2. Nguồn policy và khả năng tương thích

- `src/lib/accessPolicy.ts` là nguồn UI duy nhất cho route, sidebar, search, breadcrumb, settings và action visibility. Không union `tenantStore.can` hoặc legacy fallback thành nguồn thứ hai.
- Role/capability UI không thay server authorization. Khi chuyển sang server permissions, có contract version/feature flag rõ và một nguồn duy nhất; không hiểu permissions rỗng thành “cấp tất cả” hoặc tự fallback rộng.
- Capability/action mới phải có nguồn UC + resource scope + role grant cụ thể. Thiếu source hoặc contract giữ PROPOSED và deny. Không lấy chữ A trong một screen làm quyền approve mọi object.
- Không đổi tên route/API/cookie/issuer hoặc code lỗi public như side effect của sửa convention. Existing compatibility routes có thể giữ URL, nhưng menu/guard/action phải theo policy ORCA khi triển khai.
- Guest không có session vào portal; user thiếu granted role vào Access Denied có next action hợp lệ, không tự chọn portal rộng nhất.

## 3. Ba portal và định hướng route

| Portal     | Role                                       | Screen groups                                                                                                             | Giới hạn                                                                                                                                                          |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seller     | Owner, Staff                               | Order/stock dashboard, SKU theo Owner, ASN, invoices/payment/statement theo Owner, channel keys/staff theo Owner          | Staff không nhận financial payload. Seller không có routing/carrier admin/warehouse execution.                                                                    |
| Warehouse  | Manager, Staff                             | Assigned warehouse tasks, receiving/QC/putaway, pick/pack/label/handover, return inspection, count                        | Approval actions của Manager tách Staff; receiving cho đối chiếu khai gửi; kiểm kê tồn kho mù không tải expected qty. Recipient dữ liệu chỉ task/label cần thiết. |
| Operations | Admin, Ops, Manager, Accountant theo quyền | Seller contracts, warehouse master, rule/exception, carrier configuration, reconciliation, finance, scoped analytics/logs | Một shell không có nghĩa mọi role thấy mọi module; manager/ops theo assignment.                                                                                   |

Các prefix `/seller/*`, `/warehouse/*`, `/ops/*` chỉ là đề xuất tổ chức route nếu nhóm muốn chuyển URL; không phải contract đã tạo. Existing `/orders`, `/inventory`, `/admin/*`, `/settings/*` có thể map portal-compatible khi review từng route. Tránh bật một route rộng rồi chỉ ẩn menu. Post-login destination dựa scope + granted capabilities; multi-role cùng scope chọn default hợp lệ qua function thuần, không chỉ `roles[0]`.

## 4. Ma trận screen SRS

R = scoped read; W = operational write; A = approval/configuration; — = denied. **Đây là matrix screen**, mỗi action vẫn cần UC, owner/assignment và lifecycle. Manager được đọc staff không đồng nghĩa được gán warehouse. Staff count write không có approval. ASN receiving result cho seller không phải warehouse execution. Own-profile write không staff administration.

| Screen group                   | Admin | Ops | WH Manager | WH Staff | Accountant | Owner | Seller Staff      |
| ------------------------------ | ----- | --- | ---------- | -------- | ---------- | ----- | ----------------- |
| Identity và own profile        | A     | W   | W          | W        | W          | W     | W                 |
| Staff và warehouse assignments | A     | —   | R          | —        | —          | A     | —                 |
| Seller contracts và plans      | A     | R   | —          | —        | A          | W     | —                 |
| Warehouse zones và bins        | A     | R   | R          | R        | —          | R     | —                 |
| SKU và ASN                     | R     | R   | R          | R        | —          | W     | ASN only          |
| Receiving QC và putaway        | R     | R   | A          | W        | —          | R     | ASN results only  |
| Inventory và expiry            | R     | W   | A          | R/count  | R          | R     | R                 |
| Picking packing handover       | R     | R   | A          | W        | —          | R     | Order status only |
| Routing và carrier accounts    | A     | A   | —          | —        | R          | —     | —                 |
| Orders và exceptions           | R     | A   | W          | R        | R          | W     | Order view only   |
| Returns và recalls             | R     | A   | A          | W        | R          | W     | —                 |
| Claims và compensation         | R     | W   | R          | —        | A          | W     | —                 |
| Invoices ledger payouts        | R     | —   | —          | —        | A          | W     | —                 |
| Carrier reconciliation         | R     | —   | —          | —        | A          | —     | —                 |
| Demand và seller reports       | R     | R   | R          | —        | R          | W     | Order/stock only  |
| Audit và integration logs      | A     | R   | R          | —        | —          | —     | —                 |

Log group phải tách tiếp: UC-152 audit = Admin only; UC-153 API/scan = Admin và Manager; UC-154 integration health = Admin và Ops. Accountant và Owner dùng evidence trong business screen được phép, không vì có ledger mà được technical log browser.

## 5. Action boundaries dễ nhầm

| Hành động                                | Actor theo SRS                                       | Scope và điều kiện                                                                                                                                                                                                                            |
| ---------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gán platform role và warehouse           | Admin, UC-06/07                                      | Platform authority; Manager staff read không assignment write.                                                                                                                                                                                |
| Seller staff role assignment             | Owner, UC-06/15                                      | Chỉ SELLER_STAFF trong own seller; không custom grants, không tự đổi Owner.                                                                                                                                                                   |
| Cập nhật own user profile                | Authenticated roles, UC-16                           | Own display name/contact phone; không thay role/owner/status/assignment.                                                                                                                                                                      |
| Standard agreement acceptance            | Owner, UC-08                                         | Version/evidence; không individual Admin approval; không tự activate.                                                                                                                                                                         |
| Custom contract confirmation             | Admin, UC-08                                         | Signed offline evidence; Accountant xác minh tiền là action khác.                                                                                                                                                                             |
| SKU create/edit/import                   | Owner, UC-26–UC-30                                   | Own SKU; history dimensions/cost snapshots không overwritten.                                                                                                                                                                                 |
| ASN draft/edit/submit/track              | Owner và Staff, UC-31–UC-35                          | Seller-selected eligible warehouse; không warehouse receive/QC execution.                                                                                                                                                                     |
| ASN arrival check-in                     | Warehouse Staff, FU-21 / UC-37                       | `warehouse.asn.checkIn`; assigned warehouse; POST `/v1/warehouses/:warehouseId/asns/:id/arrival`; Manager read không grant check-in.                                                                                                          |
| Receipt photo upload / confirmation      | Warehouse Staff, FU-21 / UC-39                       | `warehouse.asn.uploadPhoto`; live assigned warehouse and counted record; `asn_evidence.create/update` endpoints in the receipt photo contract. Manager reads verified photos only through `asn_evidence.read`; no QC approval or stock write. |
| Receiving/QC/pick/pack/return inspection | Staff theo từng UC                                   | Assigned warehouse/task; Manager discrepancy/substitution/count/QC review; không finance.                                                                                                                                                     |
| Normal sales order create/import         | Owner hoặc scoped Sales Channel, UC-65–UC-69         | Không Staff; no seller warehouse/carrier selector; durable async acceptance.                                                                                                                                                                  |
| Risky COD confirmation                   | Owner, UC-71/72                                      | Own held order; không Staff hoặc warehouse actor.                                                                                                                                                                                             |
| Withdrawal request                       | Owner, UC-79                                         | Seller chọn warehouse/lot; registered address; debt and service gate; no sales quota.                                                                                                                                                         |
| Allocation/carrier rule activation       | Admin và Ops, UC-76/96/97                            | Platform-owned, assigned scope, versioned contract exceptions; no seller edits.                                                                                                                                                               |
| Carrier credential management/test       | Admin, UC-92/93                                      | Encrypted/masked, per warehouse/account; không Ops manage secret do routing A.                                                                                                                                                                |
| Return QC và restock                     | Staff/Manager theo UC-108/109                        | Manager confirms classification; staff physical restock only reviewed quantity/current lot eligibility.                                                                                                                                       |
| Disposal                                 | Manager/Staff, UC-56                                 | Consent hoặc authorized lot policy; no auto-dispose vì owner không trả lời.                                                                                                                                                                   |
| Claim investigation                      | Ops, UC-115                                          | Evidence và responsibility; không financial approval.                                                                                                                                                                                         |
| Claim compensation approval              | Accountant, UC-116                                   | Contract cap/cost snapshot; unique posting.                                                                                                                                                                                                   |
| Carrier reconciliation                   | Accountant, UC-137–UC-143                            | Platform carrier batch có nhiều seller; Seller Owner không upload/match raw carrier file.                                                                                                                                                     |
| Invoice/ledger read                      | Owner own, Accountant; Admin scoped read theo screen | Staff và warehouse roles denied; cost/margins chỉ permitted ORCA roles.                                                                                                                                                                       |
| Statement review/dispute                 | Owner, UC-131/132                                    | Own line/review window; eligible remainder vẫn được trả.                                                                                                                                                                                      |
| Payout approve/record transfer           | Accountant, UC-133/134                               | Positive confirmed eligible amount; actual transfer evidence mới PAID.                                                                                                                                                                        |
| Optional assistant                       | Admin, Ops, Manager, Accountant, Owner, UC-165       | Read-only và existing field/data scope; Guest/Staff/WH Staff denied.                                                                                                                                                                          |

Đây là intended behavior theo SRS, chưa phải code permission names mới. Dùng exact API contract khi implement; capability chưa có seed không tự phát minh rồi grant.

## 6. Privacy và state handling

- API projections loại field không được phép; frontend không cache payload thừa rồi chỉ hide cột. Search/export/print/file download và AI sources dùng cùng scope/field privacy.
- Warehouse Staff không order money/COD/invoice/API key. Seller Staff không bất kỳ financial metrics/exports, API keys, staff config hoặc contract detail.
- Draft ASN, receiving actual, quarantine và sellable hiển thị riêng; unavailable stock không ngầm treat as allocatable. Receipt receiving trả `declaredQty` và `cartonCount` cho Staff/Manager trong kho được phân công để đối chiếu. Kiểm kê tồn kho mù không tải expected qty xuống browser.
- Async state `202`, BACKORDER, ON_HOLD, LABEL_VERIFYING, CANCEL_UNKNOWN, return awaiting QC và payout APPROVED có explanation/next allowed action. Không hiển thị unknown là success.
- 401 refresh/session lifecycle; 403 giữ session và show denied; 409 stale version giữ draft và reload. Debt/payment-required không xử lý như logout.
- User/role/warehouse switch invalidates cached queries và pending responses để tránh data scope cũ xuất hiện. Refresh grants không tự widen authority.
- ReturnUrl chỉ đọc payment status từ API. Standard acceptance/custom confirmation chưa đủ initial payments không ACTIVE. Deposit không wallet UI.
- Invoice ISSUED, signed manifest và posted ledger chỉ view; adjustment/reversal/dispute dùng flow riêng có evidence.
- `/components/*` chỉ development theo `import.meta.env.DEV`, không grant production cho bất kỳ role.

## 7. Kiểm thử khi sửa policy hoặc screen code

- Bảy roles + multi-role cùng scope; mixed scope, missing scope, unknown role và legacy roles deny.
- Route/sidebar/global search/action visibility cùng policy; URL trực tiếp denied vẫn 403.
- Seller foreign ID; platform warehouse ngoài assignment; assignment revoke có hiệu lực request sau.
- Manager approval và Staff operation tách; own profile không staff administration; Seller Staff ASN write vẫn không SKU/order/finance write.
- DTO/export/label/cache/AI privacy; receipt receiving chỉ thêm `declaredQty`/`cartonCount`, kiểm kê tồn kho mù không trả expected qty; recipient chỉ permitted task.
- Async 202/unknown booking/cancel/QC/payment/payout display; replay và stale form không auto grant/complete.
- 403 không logout, 401 refresh unavailable mới login; no role fallback/permission union.
- Chạy quality gate theo AGENTS khi sửa code. Đợt Markdown này chỉ format/diff/link/source verification.

## 8. SS-982: gán kho cho ORCA staff

Route `/admin/staff`, menu/search `platform_staff` và capability `iam.warehouses.assign`
dùng cùng policy: chỉ PLATFORM `ORCA_ADMIN`. Contract SS-980/SS-982 là
`GET /v1/admin/staff`, `GET /v1/admin/staff/warehouse-options` và
`PUT /v1/admin/staff/:id/warehouses` với `warehouseIds` (UUID, tối đa 100, không trùng).
Mảng rỗng thu hồi toàn bộ assignment; quyền action vẫn do role quyết định. Backend xác
thực session và reload assignment hiện hành trên mỗi request.

UI dùng API client, React Hook Form/Zod, Common components và i18n hiện có; chỉ báo lưu
thành công sau server confirmation. Đổi identity/scope/role sẽ unmount, hủy request và
xóa dữ liệu staff đang hiển thị. Các grant còn thiếu được liệt kê bên dưới thuộc đợt riêng.

## 9. SS-1086: cấu hình routing rule

Route `/rules` dùng `rules.view`; mọi thao tác cấu hình dùng capability trung tâm
`routing.rule.set`. Cả hai chỉ cho PLATFORM `ORCA_ADMIN` và `OPS_DISPATCHER` theo
UC-76/96/97, BR-42 và action/API SS-1084. Manager, warehouse staff, Accountant,
Seller và identity legacy/mixed scope đều bị từ chối. Backend kiểm tra assignment
hiện hành qua RLS cho rule/kho; metadata picker không trả carrier credentials và
không mở quyền quản trị seller. Scope/role/identity thay đổi sẽ xóa form, dữ liệu
và pending reads của màn hình. UI không cấp quyền SYSTEM worker hoặc đặt quyền
cho các workflow allocation/booking của package khác.

### Sprint 4 tariff contract v1 (12/10/2026)

`tariffs.manage` chỉ PLATFORM Admin/Accountant, theo UC-94/118 và API `/v1/platform/tariffs`. `/admin/tariffs` là tariff-only route; không mở generic `/admin/*` hay carrier credentials cho Accountant. `/admin/carriers` vẫn Admin và có tab bảng cước. Purchase/sell read, draft/create/update/publish/close dùng backend role gate + transaction-local resources `carrier_purchase`/`tariff`; không nhận tenant/actor từ body. Preview nội bộ ở endpoint này chỉ Admin vì warehouse metadata hiện chưa grant Accountant; không broaden warehouse access để mô phỏng cước. Tests `freight-tariffs.test.mjs` kiểm cả các route bị deny và mixed/unknown scopes. Migration/RLS integration trên DB disposable phải được xác minh trước rollout; code contract không chứng minh DB dự án đã cutover.

## 10. Gap implementation phải giải quyết ở đợt sau

SS-1090 simulator uses `rules.simulate.allocation` for PLATFORM Ops only (RP3
FU-42/UC-77), and `rules.simulate.carrier` for PLATFORM Admin/Ops (FU-35/UC-98).
The SS-1089 endpoint rechecks the actor and live database grants; sample seller
references never authorize another tenant. Rules screen access is insufficient
for Admin-only allocation simulation. Preview does not publish or perform stock,
order, billing or booking effects; planning and price projections remain pending.

Source hiện có đã có `actorScope` và ORCA role policy. SS-1302 đã thu hẹp backend `contract.read` về Seller Owner và `contract.approve` về Admin, bổ sung ma trận bảy role cho API/UI cùng kiểm field và download trên các surface đã triển khai. Directory ASN dùng DTO kho riêng. Từ 16/10/2026, receipt receiving trả `declaredQty`/`cartonCount` cho Staff/Manager để đối chiếu; kiểm kê tồn kho mù giữ giới hạn expected quantity. Bằng chứng và giới hạn nằm ở [SS-1302 audit](SS-1302-PERMISSION-AUDIT.md). Core-auth audit grant và các workflow chưa triển khai vẫn cần đối chiếu khi phát triển consumer; không dùng screen matrix để mở mọi action.

Việc sửa tài liệu không đổi effective grants. Không tự bật permission mới chỉ vì matrix này có chữ R/W/A. Khi implementation, lập exact action matrix với source, diff consumer/API/DTO, migrate role/reference dữ liệu rồi chạy tests; legacy cutoff có contract version. Shared warehouse/RLS migration chưa hoàn tất thì không tuyên bố ORCA auth end-to-end đã xong.

Source/audit toàn bộ 165 UC/61 BR/20 NFR và target DB ở repo backend: `docs/ORCA-SRS-CHANGE-ANALYSIS.md`, `docs/ORCA-SRS-TRACEABILITY.md`, `db.md`. Các grant hoặc route đề xuất chưa có acceptance evidence vẫn PROPOSED.

UC-39 QC proposal: `warehouse.asn.inspect` is a Staff-only, assigned-warehouse action
for `POST /v1/warehouses/:warehouseId/asns/:asnId/receiving/records/:recordId/inspections`.
Staff and assigned Manager may read the matching GET projection. This proposal action
does not grant Manager approval, discrepancy closure, putaway, inventory or financial writes.
The form requires the actual count to be fully partitioned and only uses verified receipt
photo IDs; it preserves the exact operation/payload after an uncertain response.

UC-41 Manager receipt review: `warehouse.asn.review` is limited to a pure PLATFORM
WAREHOUSE_MANAGER on the selected live assigned warehouse. The decision API is
`POST /v1/warehouses/:warehouseId/asns/:asnId/receiving/reviews`; its GET projection also
permits assigned Staff. The decision covers exact current physical QC/report IDs and a
receipt revision, with a mandatory reason. Staff cannot approve via a hidden button or
an alternative route. The server/RLS checks grants again on replay. This capability does
not grant product/lot metadata edits, inventory posting, billing or notification delivery.

SS-1072 reviewed physical stock posting: `warehouse.asn.postStock` belongs only to pure
PLATFORM WAREHOUSE_STAFF on the live assigned warehouse. It posts the selected actual record
to `receiving/records/:recordId/stock` after Manager approval. Manager/Staff read the evidence,
while Manager cannot perform the Staff stock effect. Quantities/Seller identity come from
reviewed evidence; no generic inventory editing, metadata writes or finance access is granted.
