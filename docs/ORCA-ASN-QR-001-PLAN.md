# ORCA-ASN-QR-001 · Một QR cho mỗi phiếu gửi hàng

| Mục             | Giá trị                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| Dự án           | ORCA · Nhập kho (ASN), UC-34 và UC-37                                                                       |
| Repo triển khai | `SEP490-SmartChain/smartchain_fe`                                                                           |
| Checkout        | `/Users/vtafi/Project/University/smartchain_fe`, `develop` tại `c516c3c`                                    |
| Repo đối chiếu  | `smartchain_be` tại `d8ce9b55` và `smartchain_mobile` tại `0e79310`                                         |
| Thay đổi có sẵn | Cả ba checkout có thay đổi của các task khác. FE đã có diff trong `messages/en.json` và `messages/vi.json`. |
| Trạng thái      | Đã triển khai · Bị chặn ở kiểm tra định dạng toàn FE · 26/11/2026 (giờ Việt Nam)                            |
| Tiến độ         | 3/4 mốc · đạt xem trước, in trong trình duyệt và tra cứu trên PostgreSQL cục bộ                             |
| Bước tiếp theo  | Chạy lại kiểm tra định dạng toàn FE khi hai tệp thông báo realtime đã được xử lý.                           |

## Mục tiêu và quyết định nghiệp vụ

- Yêu cầu ngày 26/11/2026. Phiếu có 3 thùng dùng một QR chung để kho quét một lần và mở cả phiếu.
- Đã duyệt trong chat ngày 26/11/2026. Bản xem trước và bản in có một QR của phiếu, kèm mã phiếu bằng chữ và số thùng khai báo. Có thể in lại cùng mã từ chi tiết phiếu. Số thùng thực nhận vẫn do kho kiểm đếm.
- Nhãn thùng đã phát hành tiếp tục dùng để tra cứu. Mã tham chiếu từng thùng tiếp tục xuất hiện dưới mục mã tra cứu của chi tiết phiếu.

## Hành vi đã xác minh trong source

- Khi gửi ASN, backend tạo `cartonCount` mã tham chiếu, ví dụ các hậu tố `-C0001` đến `-C0003` cho phiếu 3 thùng. Web dùng từng mục trong `cartonLabelRefs` để tạo một hình QR trong phần xem trước và bản in. [Backend tạo tham chiếu](../../smartchain_be/packages/inventory/src/lib/repositories/prisma-asn.repository.ts), [Web tạo và in QR](../src/features/inbound/components/AsnLabels.tsx).
- Web kho chuyển nội dung quét thành tham số tìm kiếm theo kho. Backend tìm được `asnCode` và kiểm tra mã thùng theo mảng tham chiếu đã lưu. [Luồng quét web](../src/features/inbound/components/ReceivingWorkspace.tsx), [API danh sách theo kho](../../smartchain_be/apps/api/src/app/inbound/warehouse-asns.controller.ts), [Truy vấn ASN](../../smartchain_be/packages/inventory/src/lib/repositories/prisma-asn.repository.ts).
- Mobile gửi chuỗi quét vào API lookup theo kho. API ưu tiên khớp chính xác `asnCode`, trả về cả `cartonCount` và các dòng hàng. Bắt đầu kiểm hàng là thao tác riêng, gắn với ID phiếu. [Màn hình quét mobile](../../smartchain_mobile/lib/features/asn_scanner/asn_scanner_screen.dart), [API mobile](../../smartchain_be/apps/api/src/app/inventory/mobile-inbound.service-adapter.ts).

## Phạm vi, API và dữ liệu

- `AsnLabels` dùng giá trị `asn.asnCode` do API trả về làm toàn bộ nội dung QR. Bản xem trước và bản in dùng cùng một ảnh QR đã tạo thành công. Nút in chỉ bật khi ảnh sẵn sàng. Lỗi tạo ảnh hiển thị thông báo và cho phép thử lại, giữ mã phiếu bằng chữ để nhập tay.
- `AsnDetail` dùng trạng thái phiếu để quyết định có cho xem và in QR. Phiếu nháp và phiếu hủy không có thao tác in. Số thùng hiển thị lấy từ `asn.cartonCount`, kể cả khi mảng tham chiếu rỗng. Cập nhật chữ trong hộp thoại gửi, chi tiết và bản in ở cả tiếng Việt và tiếng Anh.
- Hợp đồng `POST /v1/asns/:id/submit`, seller ASN DTO, luồng tra cứu web/mobile và phạm vi quyền kho hiện hành áp dụng cho QR mới. Phạm vi triển khai chỉ ở FE, với schema, migration và dữ liệu hiện hữu. [Hợp đồng ASN](../../smartchain_be/docs/SS-1063-ASN.md), [Hợp đồng check-in](../../smartchain_be/docs/SS-1071-ASN-ARRIVAL.md).

## File và trách nhiệm

Codex Master sở hữu toàn bộ thay đổi FE. Codex Quality Reviewer kiểm tra độc lập diff, luồng tra cứu và bằng chứng sau triển khai.

| File trong `smartchain_fe`                      | Thay đổi dự kiến                                        |
| ----------------------------------------------- | ------------------------------------------------------- |
| `src/features/inbound/components/AsnDetail.tsx` | Phần QR cấp phiếu, trạng thái và số thùng               |
| `src/features/inbound/components/AsnLabels.tsx` | Một QR theo `asnCode` trong xem trước và bản in         |
| `messages/vi.json`, `messages/en.json`          | Nội dung cấp phiếu, thao tác gửi và trạng thái tạo QR   |
| `src/features/inbound/README.md`                | Hướng dẫn in QR phiếu và tra cứu tại kho                |
| `tests/ss-1066-asn-browser.mjs`                 | Fixture phiếu 3 thùng, mô phỏng API giữ 3 mã tham chiếu |
| `tests/picking-barcode.test.mjs`                | Cập nhật kiểm tra QR nếu cách gọi bộ tạo QR thay đổi    |
| `docs/ORCA-ASN-QR-001-PLAN.md`                  | Trạng thái, quyết định và bằng chứng cho task           |

## Nghiệm thu và kiểm thử

1. **Đối chiếu hành vi hiện tại.** Đã xác minh từ source luồng sinh mã thùng, in QR và tra cứu bằng mã phiếu trên web/mobile.
2. **Kiểm tra xem trước và bản in.** Thử phiếu 3 thùng bằng `node tests/ss-1066-asn-browser.mjs`. Bản xem trước và vùng in có đúng một QR. Giải mã ảnh để đối chiếu với `asnCode` và xác nhận hiển thị số thùng khai báo là 3. Kiểm tra phiếu 1 thùng, phiếu đã gửi từ trước, phiếu nháp và phiếu hủy. Kiểm tra khi mở phiếu khác, phần in chỉ dùng QR của phiếu mới và chờ ảnh sẵn sàng.
3. **Kiểm tra nhận diện tại kho.** Dùng mã giải từ QR để tra cứu trên web và mobile với dữ liệu local. Đối chiếu cùng ID phiếu, đúng kho và số thùng trên phản hồi có `cartonCount`. Kiểm tra mã thùng đã phát hành vẫn mở được phiếu. Xác minh tra cứu và xác nhận tiếp nhận là hai thao tác riêng. Ghi rõ mỗi bằng chứng là UI dùng fixture hay API chạy với dữ liệu thật trong môi trường local. Nếu thiếu thiết bị, ghi riêng kết quả quét camera chưa xác minh.
4. **Kiểm tra toàn repo FE và review độc lập.** Chạy `node --test tests/picking-barcode.test.mjs tests/asn-api.test.mjs`, `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build` và `git diff --check`. Ghi kết quả từng lệnh và xử lý lỗi thuộc phạm vi trước khi bàn giao. Reviewer đối chiếu trạng thái in, khả năng đọc QR, phạm vi quyền và tương thích nhãn cũ.

## Bằng chứng ngày 26/11/2026

| Kiểm tra thực tế                                                     | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixture bằng `node tests/ss-1066-asn-browser.mjs`, Chromium và ZXing | Đạt. Tạo và gửi phiếu 3 thùng với 3 mã thùng. Giải mã ảnh xem trước và ảnh chuẩn bị in đều trả đúng mã ASN. In thử trong Chromium có 1 trang, 1 QR và ghi 3 thùng. Phần in chờ giải mã ảnh, khôi phục được sau lỗi tạo ảnh và lấy đúng mã khi mở phiếu khác. Phiếu 1 thùng có thể in với mảng tham chiếu rỗng. Phiếu nháp và phiếu hủy không có nút in.                                                                                                                                                                         |
| PostgreSQL 16 dùng một lần với migration và role ứng dụng bị hạn chế | Đạt. `nx run inventory:integration --runInBand --testPathPatterns=prisma-asn.repository.integration --skipNxCache` chạy 30 test. `nx run api:test --runInBand --testPathPatterns=mobile-inbound.controller.spec --setupFilesAfterEnv=/private/tmp/orca-asn-qr-001-api-check.cjs --skipNxCache` chạy 7 test, gồm một test cục bộ gọi controller và adapter thật với mã đọc từ QR và 3 mã thùng cũ. Cả hai luồng trả cùng ID phiếu ở kho đúng, từ chối kết quả ở kho khác và không tạo phiếu nhận hàng. Mobile trả số thùng là 3. |
| Flutter với fixture                                                  | `flutter test --no-pub test/asn_scanner_test.dart test/dio_mobile_inbound_api_client_test.dart` đạt 7/7.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| FE                                                                   | `node --test tests/picking-barcode.test.mjs tests/asn-api.test.mjs` đạt 34/34. `npm test` đạt 1.660/1.660. `npx tsc --noEmit`, ESLint hai component, Prettier các tệp thuộc task, `npm run build` và `git diff --check` đạt. `npm run lint` có 39 cảnh báo ngoài hai component và 0 lỗi. Vite cảnh báo kích thước một số bundle.                                                                                                                                                                                                |
| Kiểm tra định dạng toàn FE                                           | `npm run format:check` báo [contracts.ts](../src/features/realtime-notifications/shared/contracts.ts) và [test-fixtures.ts](../src/features/realtime-notifications/shared/test-fixtures.ts). `git diff --exit-code HEAD` xác nhận hai tệp có nguyên trạng từ HEAD.                                                                                                                                                                                                                                                              |
| Review độc lập                                                       | Reviewer đã đọc diff, mã lân cận và chạy lại kiểm tra Chromium, ESLint, Prettier theo phạm vi. Không có phát hiện về logic hoặc bảo mật trong diff. Kiểm tra định dạng toàn FE vẫn báo lỗi ở các tệp đã nêu.                                                                                                                                                                                                                                                                                                                    |

### Tái lập kiểm tra trình duyệt

1. Từ checkout FE, chạy `node tests/ss-1066-asn-browser.mjs` và mở `http://127.0.0.1:24366/` với vai trò `SELLER_OWNER`. Tạo phiếu ở Kho Hà Nội, chọn SKU `SKU-BOX`, nhập 7 đơn vị và 3 thùng. Mở chi tiết bản nháp để kiểm tra trạng thái trước khi gửi.
2. Gửi phiếu, mở lại chi tiết và mở **Xem mã tra cứu và chứng từ**. Fixture giữ các mã có hậu tố `-C0001` đến `-C0003`. Bấm **Xem và in QR phiếu**. Giải mã ảnh trong hộp thoại bằng ZXing. Giá trị phải trùng mã phiếu trong phần xem trước. Mở bản in trong Chromium và so lại số QR, số trang, mã phiếu và dòng **Số thùng khai báo: 3**.
3. Lặp lại với phiếu thứ hai có 1 thùng. Kiểm tra QR đổi theo mã phiếu thứ hai. Hủy phiếu thứ hai rồi mở lại chi tiết để kiểm tra thao tác in đã ẩn.

Kiểm thử camera trên điện thoại và hình in giấy chưa được xác minh. Phần tra cứu đã dùng backend cục bộ và ảnh đọc trong trình duyệt. Triển khai hiện nằm trong checkout FE.

## Rủi ro và hoàn tác

- QR theo phiếu nhận diện một ASN. Nếu các thùng của cùng phiếu đến rời nhau, kho vẫn phải đối chiếu số lượng thực nhận và xử lý chênh lệch theo luồng hiện hành. QR đưa vào bản in cần được giải mã thử để xác minh kích thước và độ nét.
- Kiểm tra diff i18n theo từng đoạn để giữ các chỉnh sửa có sẵn. Nếu cần hoàn tác, hoàn tác các đoạn thuộc task trong FE. Dữ liệu mã đã phát hành và khả năng tra cứu QR phiếu có sẵn ở backend.
