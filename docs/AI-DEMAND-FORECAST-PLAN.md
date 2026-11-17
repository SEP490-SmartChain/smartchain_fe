# Frontend dự báo nhu cầu AI

Trạng thái: đề xuất để review, chưa triển khai. Nhánh `feat/ai-demand-forecast`,
tạo từ develop `d4363ef` ngày 16/11/2026.

Kế hoạch BE/FE đầy đủ nằm tại
[kế hoạch bàn giao](../../smartchain_be/docs/AI-DEMAND-FORECAST-DELIVERY-PLAN.md).

## Phạm vi frontend

- Trang đề xuất `/inventory/forecast`, Seller Owner trong seller của mình.
- Bộ lọc SKU/vùng, thao tác chạy dự báo và theo dõi job qua API.
- Biểu đồ lịch sử 90 ngày và dự báo 30 ngày, bảng số liệu truy cập được bằng bàn phím.
- Baseline và model có nhãn riêng, cùng phạm vi/thời điểm để so sánh.
- Lịch sử kết quả bền vững sau refresh; trạng thái tắt AI, thiếu dữ liệu,
  timeout/quota, loading/empty/error và 403 rõ ràng.
- Gợi ý bổ sung hàng dẫn sang form ASN chưa lưu; người bán chọn kho và xác nhận.
- Logic trong feature inventory; tái sử dụng Common components, apiClient,
  accessPolicy, design tokens và vi/en. Không thêm feature folder khi chưa cần.
- Cache/polling theo seller/SKU/vùng, dừng và hủy response cũ khi đổi scope.

## Điều kiện bắt đầu implementation

Chốt API DTO, trạng thái, quyền, dữ liệu biểu đồ, công thức replenishment và
wireframe theo kế hoạch tổng. Kiểm tra phiên bản package và docs chính thức
trước code. Không dựng API thành công giả để thay backend còn thiếu.

## Nghiệm thu

Chạy luồng Owner → API thật → Redis worker → model thật → biểu đồ → form ASN.
Kiểm tra mobile/desktop, keyboard, vi/en, scope isolation và các trạng thái lỗi.
Chạy typecheck, lint, format, test và build theo AGENTS khi triển khai source.
