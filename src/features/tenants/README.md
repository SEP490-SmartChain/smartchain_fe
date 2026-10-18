# features/tenants

## SS-999 service tariffs

The fulfillment-services tab on `/admin/tariffs` uses the shared `tariffs.manage`
policy for PLATFORM Admin/Accountant, with no additional seller or warehouse
access. Requests use `/v1/commercial/service-tariffs`; the backend rechecks live
roles and RLS. Service tariff authority does not grant plan publication.

Drafts use RHF/Zod, exact decimal-string prices, contiguous quantity tiers and
UTC input timestamps. Effective dates display in Vietnam time. Saving and
publishing require an audit reason and the server's `updatedAt` revision.
Published prices are read-only; closing their future window preserves content.
API failures retain the form; no local success is shown. Auth revision remounts
the manager and aborts pending reads/mutations.

Test contracts: `service-tariff-schema.test.mjs`, `service-tariff-api.test.mjs`.
The UI configures rates; it cannot post seller fees or calculate ledger balances.

## SS-990 ORCA commercial onboarding

Baseline: UC-08–UC-13 and BR-59; existing identity UC-01–UC-05 is reused.
Historical FE identifiers below are not the SS-990 requirement mapping.

- Owner `/settings/contract`: standard plans, prepared PDF, signNow embedded
  signing/window fallback, server polling, signed evidence and invoices.
- All new Owners see the same published Basic/Standard choices until they create
  a personal contract. Once a current contract exists, choices are hidden. Basic
  is 7,000,000 VND/month for the confirmed demo; historical contracts keep their
  original plan fee. Monthly fee, deposit and permitted service debt are distinct.
- New `BUSINESS_PROFILE_V1` terms require RHF/Zod contracting party declarations
  and explicit review before preparation. PDF previews are read-only; ORCA locks
  the declared details and server commercial data before opening signNow. Sample
  and prepared PDF windows have distinct names and instructions. Authenticated
  email, tenant, price and role cannot be supplied through this form.
- Admin Plans, Quotas and tenant Contract tab: immutable publication, custom
  inquiry/draft/PDF/confirmation, scheduled changes and guarded lifecycle.
- `/billing`: Owner own invoices/quotas; Accountant bank evidence/receipt;
  Admin financial read. Staff and warehouse roles have no financial actions.
- All HTTP uses `apiClient` and schemas; multipart uses `uploadForm`. Auth
  revisions/unmount cancel pending work. Signing URLs stay in memory;
  ReturnUrl cannot accept a contract or credit payment.

The seller shell reads live service status from the allowlisted auth profile and
shows pending/suspended/closed instructions across seller pages. New order/import
and ASN create/submit controls require ACTIVE service; read, profile, contract,
payment and eligible cancellation remain available. Backend gates are authoritative.
Navigation, browser focus and the status refresh action recheck the profile.

Custom inquiries load their persisted own-seller history from
`GET /v1/commercial/custom-inquiries`, including after a page reload and after a
contract is created. A pending inquiry replaces the new-request form with its
history. Dates use Asia/Ho_Chi_Minh; failed loads show a retry without enabling an
unverified duplicate request. The API serializes concurrent fresh references.
Regression coverage: `tests/seller-subscription.test.mjs`, plus backend PostgreSQL
custom-inquiry concurrency and ASN service-state integration suites.

HTTP, localhost and IP-address deployments use the separate signing window so
the provider's return navigation does not hit local-network iframe restrictions.
Public HTTPS deployments retain the embedded view and window fallback. In both
cases, only fresh worker/provider verification closes the pending signing state.

Agreement/prepared PDF previews open inside the Owner portal without popups.
The viewer renders one page at a time and uses the bundled PDF worker; closing
releases the document. Failed/expired downloads show a retry instruction. Private
URLs stay in memory and are invalidated when the auth revision changes. Configure
storage CORS GET/HEAD for the actual web origin (`AUTH_WEB_ORIGIN`); a different
local Vite port also needs a matching test download endpoint.

Forms use RHF/Zod, Common controls, semantic tokens and en/vi resources. Enterprise
needs negotiated inputs. The reference PDF has draft legal placeholders and needs
approval before real contracts. Final signature is a human action.

Backend handoff: `orca_be/docs/SS-990-IMPLEMENTATION-STATUS.md`. SePay (S53),
recurring/storage billing (S17), refunds/settlement (S16), notifications (S19/S52)
and intake quota consumers are separate dependencies; no fake completion is shown.

Quản lý tenant, người dùng, vai trò và quyền RBAC, workspace config, webhook đầu ra, Super Admin console. BE: `iam`. SRS: FE-02 → FE-07.

## ORCA directory contract

Seller account responses and filters use `SELLER_OWNER` / `SELLER_STAFF`; legacy
and platform role codes are rejected by the seller directory response validator.
Platform seller lists read `data` as the item array and `meta.pagination` as cursor
metadata, matching the backend envelope. Regression checks are included in
`tests/orca-api-contracts.test.mjs` and `tests/staff-accounts.test.mjs`.

## API Keys cho ERP (SS-473)

`ApiKeyManager` là tab `/settings/api-keys` (ORCA `SELLER_OWNER` theo D8 v3): tạo, xem và thu hồi API key để
ERP/POS/website gọi `POST /api/v1/ingest/products`. Key đầy đủ chỉ hiện một lần trong
`SecretRevealModal` (component dùng chung ở `components/Common`) và không lưu vào store hay
localStorage. API: `api/apiKeyApi.ts` gọi `/api/v1/iam/api-keys`; form dùng `schemas/apiKey.schemas.ts`.
Endpoint trong "Thông tin kết nối" lấy từ `VITE_PUBLIC_API_URL` qua `lib/publicApiUrl.ts`, chỉ
nhận HTTPS tới tên miền công khai (bỏ qua localhost, IP nội bộ, http://). Chưa có địa chỉ hợp lệ
thì hiện thông báo liên hệ quản trị, không suy ra từ origin của trang.

## Sprint 3 Orders (SS-1160/1165)

Scope `orders:write` cho `/api/v1/ingest/orders`; form mặc định chỉ chọn quyền này.
Hướng dẫn retry `X-Idempotency-Key` và xử lý 202 có cả vi/en. Màn hình được remount
khi user/tenant/scope đổi để xóa secret trong memory; request list cũ không ghi vào
component sau unmount. Mockup import được vào Figma:
[API Keys Sprint 3](../../../docs/design/sprint-3-api-keys.svg). Chưa xuất bản Figma
khi chưa có file đích.

## Demo payment after signing

The user-requested “Paid (mock)” action calls `POST /v1/commercial/mock-payments`
with the current contract ID. It appears only when the server catalog enables mock
payments and the contract is signed/confirmed. Backend receipt allocation and activation
are authoritative; the hook reloads invoices, service status and the auth profile state
after success. Errors remain visible and do not show a local success. Refreshing retains
the state saved by the backend. No real money transfer occurs. The backend switch defaults
to enabled in every environment, including production; set it false to hide and disable it.
