# Kiểm thử tiếp luồng hợp đồng — 15/10/2026

Phạm vi: tiếp tục chat `Fix service access and custom orders`, kiểm tra form
chuẩn bị hợp đồng, nút đọc mẫu/xác nhận, trình xem PDF và bảo vệ phiên ký.

## Lỗi đã tái hiện và sửa

Trong `CommercialPreparationForm`, nút đọc mẫu không khai báo `type`, nên HTML
coi là nút submit. Trên trình duyệt, khi form đã hợp lệ và checkbox đã chọn,
bấm đọc mẫu đồng thời gọi callback tạo hợp đồng: bộ đếm mô phỏng tăng từ 0 lên 1.
Với form trống, đọc mẫu còn kích hoạt lỗi validation không cần thiết.

Đã đặt `type="button"` riêng cho nút đọc mẫu. Nút xác nhận vẫn là submit.
Test hồi quy bao phủ cả template cần hồ sơ doanh nghiệp và template cũ;
đã xác nhận test thất bại trước sửa và thành công sau sửa.

## Kiểm thử trình duyệt

Các kiểm thử form/PDF dùng component thật trên server fixture riêng tại
`127.0.0.1:24316`, dữ liệu giả, callback đếm lần gửi và PDF demo 30 trang.
Fixture không gọi backend, database hoặc signNow; kết quả này không chứng minh
đã tạo/ký hợp đồng qua provider.

| Tình huống                                 | Kết quả                                                          |
| ------------------------------------------ | ---------------------------------------------------------------- |
| Đọc mẫu với form trống                     | Mở PDF, không validation, bộ đếm gửi vẫn 0                       |
| Xác nhận với form trống/chưa chọn checkbox | Hiện lỗi, bộ đếm gửi vẫn 0                                       |
| Hồ sơ đủ nhưng điện thoại sai              | Chặn submit, đánh dấu trường lỗi                                 |
| Hồ sơ hợp lệ, đọc mẫu rồi đóng             | Giữ nội dung, bộ đếm gửi vẫn 0                                   |
| Bấm nút xác nhận khi hợp lệ                | Callback chạy 1 lần; form và hai nút bị khóa trong lúc xử lý     |
| Template cũ                                | Không yêu cầu hồ sơ; vẫn bắt buộc checkbox; đọc mẫu không submit |
| PDF trang 1/30                             | Nút trước bị khóa                                                |
| PDF trang 30/30                            | Nút sau bị khóa; quay trang trước hoạt động                      |
| Nút đóng / Escape                          | Đóng PDF, quay lại form                                          |
| PDF trả 404                                | Hiện hướng dẫn đóng và mở lại để lấy liên kết mới                |

## Kiểm tra môi trường local thật và giới hạn

Tại `http://localhost:2324/settings/contract`, Owner demo có hợp đồng Standard
`ORCA-STANDARD-LOCAL-DEMO-V3`, phí tháng 12.000.000 VND, cọc 3.000.000 VND,
hạn mức công nợ 5.000.000 VND. Ban đầu dịch vụ `PENDING_ACTIVATION`, yêu cầu ký
`PREPARING`. Lịch sử custom hiện diện.

Origin được cấu hình là `http://localhost:2324`. Đăng nhập qua
`http://127.0.0.1:2324` trả 403 do kiểm tra origin; dùng đúng localhost hoạt động.

Worker watch không khởi động thành công vì `EMFILE`; thử chạy bundle không watch
trong sandbox gặp lỗi kết nối PostgreSQL local. Yêu cầu quyền chạy worker ngoài
sandbox bị bộ duyệt an toàn tự động từ chối vì có thể thay đổi hợp đồng local và
gọi API signNow bằng credential đang cấu hình. Không chạy cách khác để vượt chặn.

Sau đó người dùng xác nhận chạy worker/call signNow và yêu cầu dùng DB dự án của
họ. Đã kiểm tra `DATABASE_URL` và `WORKER_DATABASE_URL` cùng trỏ `localhost/orca`;
đọc lại connection xác nhận database `orca`, role `orca_worker_app`, không BYPASSRLS.
Không tạo DB riêng, reset hoặc migration dữ liệu.

Worker chạy bundle không watch với cấu hình dự án. Yêu cầu hiện có chuyển thành
`IN_PROGRESS`, không có errorCode; UI hiển thị “Chờ bạn ký”. Outbox tương ứng vẫn
`PENDING` để tiếp tục kiểm tra chữ ký, attempts = 0, lastError = null. Đây là trạng
thái chờ bình thường, không phải hợp đồng đã được ký hoặc dịch vụ đã kích hoạt.

| Kiểm tra trên DB dự án / signNow thật | Kết quả                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| Worker xử lý yêu cầu Standard hiện có | `PREPARING` → `IN_PROGRESS`, UI tự cập nhật                                  |
| Xem bản hợp đồng chờ ký               | PDF tải thành công, 30 trang, trang đầu có thông tin bên ký đã khóa          |
| Ký hợp đồng                           | Lấy phiên ký và mở cửa sổ `app.signnow.com` đúng tài liệu                    |
| Đóng màn hình ký                      | Đóng panel, giữ hợp đồng chờ ký và hai nút hợp đồng                          |
| Ký lại sau khi đóng panel             | Mở phiên ký lại thành công                                                   |
| Mở lại signNow                        | Mở cửa sổ cùng tài liệu/yêu cầu ký                                           |
| Trạng thái server sau nhiều lần mở    | Vẫn cùng 1 signing request `331f3471-0d67-4b47-a93c-e4a6bc2fc82f`, không lỗi |
| Giao diện signNow                     | Đủ 30 trang, thông báo 1 trường bắt buộc, nút Start Filling                  |
| Trạng thái dịch vụ sau mở ký          | Vẫn `PENDING_ACTIVATION`, chưa acceptance/activation                         |

Đã giữ trang ORCA và phiên signNow để người dùng tiếp tục. Không tự nhập chữ ký,
hoàn tất chấp thuận hoặc ghi nhận thanh toán. Phần ký hoàn tất → xác minh chứng cứ
→ hóa đơn → xác minh đủ tiền → kích hoạt chưa được kiểm thử live trong lượt này.

Worker đầu tiên ghi nhận một lỗi audit Mongo tạm thời. Đã chạy lại bằng launcher
nạp đầy đủ cấu hình dự án trước khi khởi động; log worker mới không ghi nhận lỗi
trong thời gian quan sát. Runtime email trỏ Mailpit local, fanout bị tắt để không
gửi mail/webhook ngoài phạm vi kiểm thử; cấu hình DB/signNow vẫn từ `.env` của
người dùng. Không sửa `.env`. Worker tiếp tục chạy để theo dõi chữ ký.

## Kết quả kiểm tra tự động

| Lệnh                                                                                                                         | Kết quả                                                              |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `npx tsc --noEmit`                                                                                                           | Qua                                                                  |
| `npm run lint`                                                                                                               | 0 lỗi, 21 cảnh báo có sẵn                                            |
| `npm run format:check`                                                                                                       | Qua                                                                  |
| `npm test`                                                                                                                   | 919 qua, 0 bỏ qua                                                    |
| `npm run build`                                                                                                              | Qua; có cảnh báo kích thước chunk                                    |
| `npm exec nx -- test billing` tại backend                                                                                    | 218 qua; 1 test tích hợp DB bị bỏ qua do chưa cấu hình DB test riêng |
| `npm exec -- nx run api:test --testPathPatterns='commercial.controller\|ss-1302-commercial-privacy' --runInBand` tại backend | 59 qua, 2 suite                                                      |
| `git diff --check`                                                                                                           | Qua                                                                  |

Test HTTP lần đầu bị sandbox chặn mở cổng localhost (`EPERM`), sau đó chạy lại
với quyền phù hợp và qua. Các service của test HTTP được mock; đây không phải
kiểm thử provider hoặc database thật. Bộ test signing còn kiểm tra popup trước
request, popup bị chặn, scope đổi, lỗi request, URL provider allowlist,
idempotency và link PDF hết hiệu lực theo auth revision.

Không thay đổi source backend, credential hoặc trạng thái thanh toán. Thay đổi
trạng thái yêu cầu ký và dữ liệu provider được thực hiện qua worker/endpoint chính
thức đã được người dùng xác nhận; script chẩn đoán DB chỉ đọc qua RLS.
