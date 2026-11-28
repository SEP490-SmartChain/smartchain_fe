# ORCA-FE-MERGE-001 — Hợp nhất seller freight trên develop

- Dự án ORCA, repo smartchain_fe, checkout `/Users/vtafi/Project/University/smartchain_fe`.
- Ngày 28/11/2026, trạng thái **Hoàn thành**. HEAD `3b8657c`, MERGE_HEAD `b136309`. Git báo 3 file cùng sửa, 14 file cùng thêm và 6 file đã tự merge.
- Nghiệm thu 3/3. Đã duyệt trong chat. Git đã giải quyết đủ 17 file xung đột.

## Mục tiêu và quyết định đã duyệt

Khôi phục trạng thái merge có thể commit. Giữ luồng duyệt giao hàng, COD và vận đơn nhiều kiện của local. Tích hợp validation và giao diện freight P1–P3 của remote, gồm token `--sc-*`. Bảo toàn các thay đổi contract signing đã tự merge.

## Phạm vi của Codex Master

Hòa giải từng hunk trong các file dưới đây và soát hai locale đã tự merge để bảo đảm mọi key dùng ở giao diện đều có bản dịch.

- `src/features/orders/components/ManualOrderForm.tsx`
- `src/features/orders/components/OrderDetail.tsx`
- `src/features/orders/components/SellerOrders.tsx`
- `src/features/orders/seller-freight/form/OrderFormFreightSection.tsx`
- `src/features/orders/seller-freight/lookup/api/freightEstimateApi.ts`
- `src/features/orders/seller-freight/lookup/components/QuickFreightLookupModal.tsx`
- `src/features/orders/seller-freight/order-selection/components/OrderDetailFreightSection.tsx`
- `src/features/orders/seller-freight/order-selection/components/OrderFreightCell.tsx`
- `src/features/orders/seller-freight/order-selection/components/OrderStatusBadges.tsx`
- `src/features/orders/seller-freight/order-selection/components/OrderWaybillCell.tsx`
- `src/features/orders/seller-freight/order-selection/hooks/useOrderFreight.ts`
- `src/features/orders/seller-freight/order-selection/index.ts`
- `src/features/orders/seller-freight/order-selection/model/orderFreightCoordinator.ts`
- `src/features/orders/seller-freight/shared/index.ts`
- `src/features/orders/seller-freight/shared/schema.ts`
- `tests/seller-freight-integration.test.mjs`
- `tests/seller-order-freight-selection.test.mjs`

## API, dữ liệu và rủi ro

Giữ endpoint, quyền và tùy chọn `includeDispatchReview` theo caller. Duy trì parse trạng thái `APPROVED`, `REVIEW_REQUIRED` và số kiện tùy chọn trên dữ liệu cũ. Hai phía giới hạn báo giá dương ở 12 và 13 chữ số khác nhau. Đối chiếu contract BE và test biên trước khi hợp nhất. Giữ riêng validation dữ liệu nhập và tổng tiền đã ghi nhận.

## Các mốc nghiệm thu

1. Đối chiếu cả hai parent, gộp UI, hook, schema, exports và các assertion có ý nghĩa từ cả hai bộ test. Stage đúng file đã xử lý. Xác nhận `git ls-files -u` rỗng và kiểm tra marker, key dịch trùng hoặc thiếu.
2. Chạy `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build` và `git diff --cached --check`. Ghi kết quả và xử lý lỗi trong phạm vi merge.
3. Codex Quality Reviewer đối chiếu diff với cả hai parent và bằng chứng test. Xử lý phát hiện, chạy lại kiểm tra liên quan và xác nhận merge sẵn sàng commit.

Giữ hai parent để đối chiếu và phục hồi từng hunk nếu cần. Điểm bàn giao đã duyệt là merge sẵn sàng commit tại checkout hiện tại.

## Kết quả ngày 28/11/2026

- Giữ input 12 chữ số và quote dương tối đa 13 chữ số. Đã đối chiếu hàm `freightSaleVnd` trong backend cộng giá hãng và phụ phí bằng BigInt. Test kiểm tra báo giá sau phụ phí, từ chối cùng giá trị nếu dùng làm input và từ chối quote 14 chữ số.
- Khôi phục chọn nhiều đơn để tra cước riêng với chọn đơn để duyệt giao hàng, dịch thanh thao tác sang hai ngôn ngữ và căn đúng cột tiền trong dòng vận đơn mở rộng. Local đã có validation theo tương tác, trạng thái duyệt, bảo vệ kết quả tra cũ và hiển thị COD nhiều kiện.
- Lượt đầu có 5 lỗi ESLint và 2 test lỗi trong 1.727 test. Đã sửa điều kiện giá trong catalog và dấu ngoặc ở các file freight, đồng bộ assertion picking với tham số `scanContract=2` có sẵn, sửa 8 nhãn tiếng Việt. Thay đổi tự merge của luồng ký hợp đồng đã nằm trong index.
- `npx tsc --noEmit`, `npm run format:check`, `npm run build` và `git diff --cached --check` trả về 0. `npm run lint` trả về 0 với 70 cảnh báo. Build có cảnh báo kích thước chunk.
- `git ls-files -u` rỗng. Đã quét marker trong src, tests và messages, kiểm tra JSON trùng key và đối chiếu key của Orders giữa vi/en.
- Reviewer độc lập đã kiểm tra diff với cả hai parent và xác nhận các sửa lỗi cột, bản dịch, token màu, lint và assertion picking. Test tích hợp freight sau bổ sung test biên đạt 9/9.
- Lượt cuối trên toàn bộ thay đổi bàn giao: `npm test` đạt 1.728/1.728, 0 lỗi và 0 bỏ qua. Đã stage và giữ trạng thái merge sẵn sàng commit.
