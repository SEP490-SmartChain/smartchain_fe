# SS-1311 — whole-order-cancellation

Nhánh `feat/SS-1311-whole-order-cancellation`. Base: feat/SS-1193-packing-handover.

Phạm vi riêng task SS-1311; API thực thi ở nhánh BE cùng tên.

Sau self-review: Ops có capability PLATFORM riêng `orders.cancellation.ops` và màn hình danh sách đơn thuộc toàn bộ kho được phân công tại `/orders`. Danh sách lấy từ `GET /v1/orders/operations/cancellation-candidates`, tìm theo mã đơn và phân trang cursor; không cho nhập tenant/kho/UUID để mở rộng phạm vi. Seller Owner giữ flow TENANT hiện có. Đổi session/phân quyền huỷ request đang chạy và xoá dữ liệu cũ.

Form huỷ và putback mở lại sau phản hồi 4xx xác định; lỗi mạng, 408, 5xx hoặc idempotency conflict giữ nguyên UUID và payload để xác minh/thử lại. Nhánh này merge bản sửa SS-1193 cho packing và handover, giữ phụ thuộc theo task.

Kiểm tra: npx tsc --noEmit; npm run lint; npm run format:check; npm test; npm run build. Kết quả và merge dependencies tại outputs/sprint6-task-split của workspace.
