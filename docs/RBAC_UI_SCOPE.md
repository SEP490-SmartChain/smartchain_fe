# Phạm vi giao diện và phân quyền ORCA

Ngày 02/10/2026. Baseline làm việc: `Report3_Software Requirement Specification.docx` §2.1, §3.1.3, các UC và BR. Tài liệu thay mô tả SmartChain bốn role. Đây là đặc tả UI theo yêu cầu mới, **không phải tuyên bố các grant/API/screen đã triển khai hoặc được duyệt đầy đủ**.

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

| Portal     | Role                                       | Screen groups                                                                                                             | Giới hạn                                                                                                                 |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Seller     | Owner, Staff                               | Order/stock dashboard, SKU theo Owner, ASN, invoices/payment/statement theo Owner, channel keys/staff theo Owner          | Staff không nhận financial payload. Seller không có routing/carrier admin/warehouse execution.                           |
| Warehouse  | Manager, Staff                             | Assigned warehouse tasks, receiving/QC/putaway, pick/pack/label/handover, return inspection, count                        | Approval actions của Manager tách Staff; blind count không tải expected qty. Recipient dữ liệu chỉ task/label cần thiết. |
| Operations | Admin, Ops, Manager, Accountant theo quyền | Seller contracts, warehouse master, rule/exception, carrier configuration, reconciliation, finance, scoped analytics/logs | Một shell không có nghĩa mọi role thấy mọi module; manager/ops theo assignment.                                          |

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

| Hành động                                | Actor theo SRS                                       | Scope và điều kiện                                                                                      |
| ---------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Gán platform role và warehouse           | Admin, UC-06/07                                      | Platform authority; Manager staff read không assignment write.                                          |
| Seller staff role assignment             | Owner, UC-06/15                                      | Chỉ SELLER_STAFF trong own seller; không custom grants, không tự đổi Owner.                             |
| Cập nhật own user profile                | Authenticated roles, UC-16                           | Own display name/contact phone; không thay role/owner/status/assignment.                                |
| Standard agreement acceptance            | Owner, UC-08                                         | Version/evidence; không individual Admin approval; không tự activate.                                   |
| Custom contract confirmation             | Admin, UC-08                                         | Signed offline evidence; Accountant xác minh tiền là action khác.                                       |
| SKU create/edit/import                   | Owner, UC-26–UC-30                                   | Own SKU; history dimensions/cost snapshots không overwritten.                                           |
| ASN draft/edit/submit/track              | Owner và Staff, UC-31–UC-35                          | Seller-selected eligible warehouse; không warehouse receive/QC execution.                               |
| Receiving/QC/pick/pack/return inspection | Staff theo từng UC                                   | Assigned warehouse/task; Manager discrepancy/substitution/count/QC review; không finance.               |
| Normal sales order create/import         | Owner hoặc scoped Sales Channel, UC-65–UC-69         | Không Staff; no seller warehouse/carrier selector; durable async acceptance.                            |
| Risky COD confirmation                   | Owner, UC-71/72                                      | Own held order; không Staff hoặc warehouse actor.                                                       |
| Withdrawal request                       | Owner, UC-79                                         | Seller chọn warehouse/lot; registered address; debt and service gate; no sales quota.                   |
| Allocation/carrier rule activation       | Admin và Ops, UC-76/96/97                            | Platform-owned, assigned scope, versioned contract exceptions; no seller edits.                         |
| Carrier credential management/test       | Admin, UC-92/93                                      | Encrypted/masked, per warehouse/account; không Ops manage secret do routing A.                          |
| Return QC và restock                     | Staff/Manager theo UC-108/109                        | Manager confirms classification; staff physical restock only reviewed quantity/current lot eligibility. |
| Disposal                                 | Manager/Staff, UC-56                                 | Consent hoặc authorized lot policy; no auto-dispose vì owner không trả lời.                             |
| Claim investigation                      | Ops, UC-115                                          | Evidence và responsibility; không financial approval.                                                   |
| Claim compensation approval              | Accountant, UC-116                                   | Contract cap/cost snapshot; unique posting.                                                             |
| Carrier reconciliation                   | Accountant, UC-137–UC-143                            | Platform carrier batch có nhiều seller; Seller Owner không upload/match raw carrier file.               |
| Invoice/ledger read                      | Owner own, Accountant; Admin scoped read theo screen | Staff và warehouse roles denied; cost/margins chỉ permitted ORCA roles.                                 |
| Statement review/dispute                 | Owner, UC-131/132                                    | Own line/review window; eligible remainder vẫn được trả.                                                |
| Payout approve/record transfer           | Accountant, UC-133/134                               | Positive confirmed eligible amount; actual transfer evidence mới PAID.                                  |
| Optional assistant                       | Admin, Ops, Manager, Accountant, Owner, UC-165       | Read-only và existing field/data scope; Guest/Staff/WH Staff denied.                                    |

Đây là intended behavior theo SRS, chưa phải code permission names mới. Dùng exact API contract khi implement; capability chưa có seed không tự phát minh rồi grant.

## 6. Privacy và state handling

- API projections loại field không được phép; frontend không cache payload thừa rồi chỉ hide cột. Search/export/print/file download và AI sources dùng cùng scope/field privacy.
- Warehouse Staff không order money/COD/invoice/API key. Seller Staff không bất kỳ financial metrics/exports, API keys, staff config hoặc contract detail.
- Draft ASN, receiving actual, quarantine và sellable hiển thị riêng; unavailable stock không ngầm treat as allocatable. Blind count expected qty không được tải xuống browser của counter.
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
- DTO/export/label/cache/AI privacy; count expected quantity không ở response; recipient chỉ permitted task.
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

## 9. Gap implementation phải giải quyết ở đợt sau

Source hiện có đã có `actorScope` và ORCA role policy. Các grant được triển khai từ auth contract trước đây không hoàn toàn đồng bộ SRS cập nhật 02/10: backend core-auth audit grant còn rộng, contract read còn Seller Staff, contract approval còn Accountant; compatibility upload/reconciliation còn legacy groups. Frontend capabilities dựa screen matrix cũ cũng cần review action-level theo UC mới.

Việc sửa tài liệu không đổi effective grants. Không tự bật permission mới chỉ vì matrix này có chữ R/W/A. Khi implementation, lập exact action matrix với source, diff consumer/API/DTO, migrate role/reference dữ liệu rồi chạy tests; legacy cutoff có contract version. Shared warehouse/RLS migration chưa hoàn tất thì không tuyên bố ORCA auth end-to-end đã xong.

Source/audit toàn bộ 165 UC/61 BR/20 NFR và target DB ở repo backend: `docs/ORCA-SRS-CHANGE-ANALYSIS.md`, `docs/ORCA-SRS-TRACEABILITY.md`, `db.md`. Các grant hoặc route đề xuất chưa có acceptance evidence vẫn PROPOSED.
