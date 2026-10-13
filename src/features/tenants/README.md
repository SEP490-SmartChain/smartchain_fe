# features/tenants

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

Agreement/prepared PDF previews open inside the Owner portal without popups.
The viewer renders one page at a time and uses the bundled PDF worker; closing
releases the document. Failed/expired downloads show a retry instruction. Private
URLs stay in memory and are invalidated when the auth revision changes. Configure
storage CORS GET/HEAD for the actual web origin (`AUTH_WEB_ORIGIN`); a different
local Vite port also needs a matching test download endpoint.

Forms use RHF/Zod, Common controls, semantic tokens and en/vi resources. Enterprise
needs negotiated inputs. The reference PDF has draft legal placeholders and needs
approval before real contracts. Final signature is a human action.

Backend handoff: `smartchain_be/docs/SS-990-IMPLEMENTATION-STATUS.md`. SePay (S53),
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
