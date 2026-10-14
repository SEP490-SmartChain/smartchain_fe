# PM review: tạo đơn cho seller — 09/10/2026

## Mục tiêu và kết luận

Seller cần tìm đúng hàng, nhập giá bán, thấy tổng cần thu và gửi đơn mà không phải hiểu SKU/UUID hoặc tự đoán nguyên nhân lỗi. Lượt này sửa luồng tạo đơn thủ công; API tiếp nhận và contract tài chính hiện hành không thay đổi.

Giá `200000` thuần được chấp nhận khi tái hiện. Giá `200000 ` có khoảng trắng cuối bị từ chối ở bản cũ dù nhìn gần như giống ảnh người dùng. Không thể xác định ký tự gốc chỉ từ ảnh chụp. Đã sửa toàn bộ đầu vào tiền trong form để trim khoảng trắng, chuẩn hóa số 0 đầu và dấu nhóm nghìn hợp lệ; không làm tròn số lẻ, bỏ dấu âm hoặc đoán ký hiệu khoa học. API vẫn nhận chuỗi số nguyên canonical và giữ kiểm tra giới hạn.

Tìm theo tên có dữ liệu từ API thật, nhưng trước đây chỉ lọc dropdown đóng và giữ cả sản phẩm đang chọn nên người dùng khó thấy kết quả. Nay kết quả hiện trực tiếp dưới ô tìm, có tên/mã và nút Thêm vào đơn. Không đổi tên sản phẩm hoặc giả kết quả để lấp dữ liệu trống.

## Quyết định trải nghiệm

| Tình huống                             | Cách xử lý sau review                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Gõ hoặc dán tiền từ nguồn khác         | `200000`, `200000 `, `200.000`, `200,000`, nhóm nghìn bằng khoảng trắng → 200000; tổng tính bằng BigInt.                       |
| Nhập `200.5`, số âm hoặc quá 12 chữ số | Báo tại ô tương ứng, giữ giá đã nhập để sửa; không tạo đơn.                                                                    |
| Sửa một giá sai thành đúng             | Lỗi biến mất, thành tiền và tổng thu cập nhật; không hiện thêm lỗi chung lặp lại.                                              |
| Tìm hàng                               | Debounce 250ms, có trạng thái đang tìm, không tìm thấy, lỗi tải/thử lại; nút xóa tìm kiếm giữ dòng đơn đã điền.                |
| Thêm hàng từ kết quả                   | Điền dòng chưa chọn hàng trước; nếu hết dòng trống thì thêm dòng mới và focus đơn giá. Không thay hàng cũ ngầm định.           |
| Cùng một sản phẩm                      | Nút báo Đã có trong đơn; dropdown dòng khác loại sản phẩm đã dùng. Seller sửa số lượng ngay tại dòng hiện có.                  |
| Đơn nhiều hàng                         | Giữ sản phẩm/giá/số lượng khi tìm tên khác; hiện thành tiền từng dòng. Tải thêm kết quả ngay trong vùng tìm kiếm.              |
| Giá bán                                | Mặc định trống, bắt buộc nhập; cho phép 0 tường minh cho hàng tặng. Giá trị khai báo của catalog không được tự coi là giá bán. |
| Thu tiền                               | COD tự cộng tiền hàng; đã trả = 0; phần còn lại nhập riêng; ship khách trả hiện có điều kiện. Không cộng ship hai lần.         |
| Gửi lại sau mạng lỗi                   | Giữ nguyên cơ chế tham chiếu idempotency, bản nháp và quyền Seller Owner.                                                      |

Giữ giới hạn 100 dòng, sản phẩm own seller đang hoạt động, API authorization và scope invalidation. Seller Staff vẫn không được tạo đơn hoặc xem tài chính. Chưa bổ sung dữ liệu tồn/giá bán tự động vì catalog hiện hành chưa có contract phù hợp; không dùng số giả để cho giao diện có vẻ đầy đủ.

## Bằng chứng

Kiểm tra trên localhost:2324 → API localhost:3000 → DB local:

- Tìm Ceramic ra Demo Ceramic Mug; tìm Cotton ra Demo Cotton Tee. Sau khi thêm thành công, tự xóa từ khóa/kết quả và focus đơn giá; áp dụng cả điền dòng trống lẫn thêm dòng mới. Giá dòng trước được giữ nguyên. Xem [ảnh tự xóa tìm kiếm](orders-search-auto-clear.png).
- MUG × 2 với giá `200000 ` hoặc `200.000` hiển thị 400.000đ, không đỏ. Giá `200.5` bị chặn; sửa đúng thì hết đỏ.
- Tạo một đơn mẫu `UX-VERIFY-20261009-PRICE-SEARCH`: MUG × 2 × 200000 + TEE × 1 × 50000 = 450000 tiền hàng; phí `30.000 ` được lưu canonical 30000; tổng thu 480000. Chi tiết API thật hiển thị đúng hai sản phẩm và giá. Đơn còn trong DB local, trạng thái RECEIVED, chưa giao hàng.
- Unit regression kiểm tra khoảng trắng thường/NBSP/narrow-NBSP, dấu nhóm nghìn, số 0, giá lẻ, hỗn hợp dấu, số âm, scientific notation và giới hạn tiền; schema API vẫn từ chối tiền có dấu phân cách.

Quality gate lượt này: FE **158/158 tests**, TypeScript/lint/format/build qua; còn cảnh báo lint/bundle sẵn có. Không đổi source BE, không coi kết quả kiểm tra BE lượt trước là một lần chạy mới.

Ảnh API thật: [tìm sản phẩm và giá hợp lệ](orders-product-search-fixed.png), [đơn được tiếp nhận](orders-price-search-accepted.png). Giới hạn phân bổ kho/billing/Google OAuth và xung đột phiên bản SRS vẫn theo bàn giao BE; review này không nghiệm thu giao hàng/đối soát end-to-end.

## Payment breakdown — 09/10/2026

Tách giá bán, giảm giá, tiền hàng đã trả và phí ship đã trả; tự tính số còn thu. Khoản đã trả là khai báo khi tạo đơn, chưa xác minh ngân hàng. Đơn legacy hiển thị chưa có breakdown thay vì tạo số giảm/cọc giả. Form có thông báo ngay tại khoản tiền vượt giá trị, bảng tổng hợp và chế độ đã trả đủ tự cập nhật theo tiền hàng sau giảm. Quy tắc/API/migration/test: `smartchain_be/docs/SPRINT4_PAYMENT_BREAKDOWN_REVIEW.md`. Đơn UI đã xác minh `UX-VERIFY-20261009-BREAKDOWN`: tổng thu 270.000đ. Ảnh `orders-payment-breakdown-verified.png`.
