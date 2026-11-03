# Sprint 5 — giao diện soạn hàng

## Sửa hai lỗi UAT — 22/10/2026

- SS-1312/PICK_SHORT: Staff chọn ảnh PNG/JPEG/WebP tối đa 5 MiB, tải lên qua URL riêng tư và chờ API xác minh. Chỉ khi xác minh thành công mới bật gửi báo thiếu; không còn ô nhập mã bằng chứng thủ công. Manager có thể yêu cầu liên kết xem ảnh gắn với báo thiếu trong phạm vi kho được giao.
- Withdrawal thuộc SS-1179: xóa thông báo thành công khi sửa form, khi HTML validation chặn gửi và trước khi kiểm tra/tạo yêu cầu mới. Lỗi từ API thay bằng thông báo từ chối, không giữ thành công cũ.
- UI được kiểm tra bằng fixture cô lập với React Strict Mode, không thay đổi đơn/tồn UAT. Báo cáo và ảnh tại `outputs/sprint5-review/TWO-UAT-FIXES.md` trong workspace cha.

Nhánh `feat/SS-1179-allocation-pick-workflow`, đối chiếu SS-1179, SS-1186, SS-1312, SS-1313 và UC-78, UC-80–84.

`/warehouse/picking` dùng workspace trong feature orders. Manager tạo/phân công đợt và duyệt thay thế; Staff quét bin/SKU/lô, xác nhận lấy hàng và báo thiếu có bằng chứng. UI dùng policy tập trung, API vẫn kiểm tra role và phân công kho trực tiếp. Danh sách Staff không chứa tài chính, thông tin người nhận hoặc expected quantity kiểm kê.

Tạo đợt trả PROCESSING và poll request đã lưu đến COMPLETED/FAILED. Khi mất kết quả mạng, UI giữ nguyên `clientScanId`/payload và chỉ cho retry thao tác đó. Số đã pick chỉ đổi sau phản hồi server. Chuyển phiên đăng nhập remount workspace và hủy đọc cũ; đổi kho xóa trạng thái đợt đang xem. Thời gian hiển thị theo Asia/Ho_Chi_Minh.

Chi tiết đơn Seller có tab giải thích kho/lô, chỉ đọc provenance server đã lưu. Không tự suy diễn lý do cho kiện chưa có metadata. TOTAL_COST được mô tả là ước tính trong các phương án đã xét; cước thật vẫn theo đóng gói.

Contract BE, mapping task, migration và hướng dẫn runner: `smartchain_be/docs/SPRINT5-ALLOCATION-PICKING.md` tính từ thư mục workspace chung.

Kiểm tra: `node node_modules/typescript/bin/tsc --noEmit`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build`. Test role matrix có kỳ vọng độc lập cho hai capability picking. Kiểm tra Chrome dùng fixture giả, không gọi API/DB dự án; ảnh tại workspace `outputs/sprint5-picking-staff.png`.

## Cập nhật withdrawal và kiểm chứng luồng — 20/10/2026

SellerOrders có nút rút hàng cho Owner với service ACTIVE/SUSPENDED. Form đăng ký địa chỉ trả hàng theo version, tải tên tỉnh/phường và kho/SKU/lô từ API rồi gửi số lượng. Command tạo đơn không chứa tenant, địa chỉ tự truyền, COD hay phí. Khi phản hồi không xác định, form giữ nguyên command/clientRequestId và khóa chỉnh sửa để thử lại đúng yêu cầu; chỉ hiển thị tiếp nhận sau server xác nhận. Chi tiết WITHDRAWAL dùng nhãn rút hàng và phí dịch vụ phù hợp, không hiển thị breakdown thanh toán bán hàng.

WaveForm có defaultValues rỗng cho assigneeId/cutoffAt; Staff tải bất đồng bộ vẫn hiện placeholder cho đến khi chọn thật.

Vòng QA cuối sử dụng chính các component với API, PostgreSQL và Redis dùng một lần: Owner đăng ký → tạo withdrawal → mất phản hồi sau commit → retry không trùng đơn → Manager tạo wave → Staff quét hai dòng và hoàn tất. DB xác nhận tồn 0 và withdrawal PICKED. Danh tính, directory kho/Staff và hành chính là fixture; chưa kiểm thử JWT production hay scanner vật lý. FE đạt 1.031/1.031 test, typecheck, lint (0 error, 16 warning có sẵn), format và production build. Báo cáo đầy đủ tại `outputs/sprint5-review/QA-QC-FINAL-FIX-VERIFICATION.md` trong workspace cha.
