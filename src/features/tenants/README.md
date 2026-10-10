# features/tenants

Quản lý tenant, người dùng, vai trò và quyền RBAC, workspace config, webhook đầu ra, Super Admin console. BE: `iam`. SRS: FE-02 → FE-07.

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
