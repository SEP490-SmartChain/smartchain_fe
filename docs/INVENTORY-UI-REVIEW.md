# Rà soát UI tồn kho — 15/10/2026

Phạm vi: trang `/inventory`, dữ liệu và quyền theo các API đang có. Ảnh người dùng là
tham chiếu giao diện; nội dung tài liệu nghiệp vụ chỉ dùng đối chiếu yêu cầu.

## Vấn đề và thay đổi

- Màn hình cũ đặt cảnh báo dài, tìm kiếm và lời nhắc chọn kho trong cùng một thẻ,
  khiến bước chọn phạm vi không rõ. Chuyển bộ chọn kho thành vùng dùng chung phía
  trên nội dung; giữ kho đã chọn khi đổi tab.
- Tab tổng quan chỉ dành cho Seller Owner/Staff: backend `InventoryStocksController`
  chỉ nhận hai role này và yêu cầu tenant. `inventory.view` chỉ là quyền vào trang,
  không cho phép gọi mọi API trong trang. Capability `inventory.stocks.view` phản ánh
  đúng contract hiện có; không mở thêm quyền backend. Manager bắt đầu ở Lô và vị trí,
  Ops bắt đầu ở Sổ biến động. Các role còn lại không tự nhận API chưa hỗ trợ.
- Tổng quan SKU gộp SKU/tên sản phẩm và mã/tên kho; căn phải số lượng. Chỉ số phía
  trên có nhãn toàn bộ phạm vi tài khoản vì API summary không hỗ trợ lọc theo kho.
- Lô/vị trí gộp thông tin định danh, dùng badge điều kiện cấp hàng và thể hiện tổng
  tồn/đang giữ bên cạnh số vật lý chưa giữ. Không suy mọi số vật lý là đủ điều kiện xuất.
- Hạn dùng phân biệt cảnh báo với khóa xuất dựa `isBlocked` của server. Hiển thị
  ngày còn lại, hết hạn hôm nay, đã quá hạn và thiếu ngày; không tự tính lại quyết định
  khóa từ ngày hoặc số lượng. Cài đặt cảnh báo được mở riêng theo quyền của Owner.
- Sổ biến động thể hiện số tăng/giảm và số dư sau biến động; giữ đầy đủ mã nguồn và
  người thao tác. Không có thao tác sửa lịch sử hoặc ghi tồn kho.
- Tìm kiếm và trạng thái thường dùng luôn hiện; mã lô/vị trí và khoảng ngày nằm trong
  bộ lọc mở rộng, có số bộ lọc đang áp dụng và nút xóa. Ngày đầu lớn hơn ngày cuối
  chặn truy vấn và giải thích cách sửa.

## Ma trận tình huống

| Tình huống                                | Hành vi UI                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| Đang tải danh sách kho                    | Bộ chọn bị khóa, trạng thái tải; chưa gọi API chi tiết                    |
| Có nhiều kho, platform chưa chọn          | Hướng dẫn chọn kho và nút đưa focus vào bộ chọn                           |
| Chỉ có một kho, tab platform yêu cầu kho  | Dùng kho duy nhất để bỏ bước chọn không cần thiết                         |
| Không có kho trong phạm vi platform       | Trạng thái riêng, hướng dẫn kiểm tra phân công; không báo tồn bằng 0      |
| Danh sách kho lỗi                         | Thông báo và thử tải lại, không coi là danh sách rỗng                     |
| Seller chưa lọc kho                       | Xem hàng của own seller tại tất cả kho; tenant vẫn lấy từ server          |
| Chuyển tab                                | Giữ kho đã chọn; tab và panel có liên kết accessible name                 |
| Chuyển kho khi request cũ đang chạy       | Remount panel theo kho, bỏ phản hồi cũ; không hiển thị số của kho trước   |
| User/role/assignment đổi                  | Auth revision remount toàn bộ workspace và dữ liệu cũ                     |
| Dữ liệu lần đầu đang tải                  | Trạng thái tải bảng, không hiện empty state                               |
| Không có bản ghi                          | Giải thích theo từng loại dữ liệu                                         |
| Từ khóa/bộ lọc không có kết quả           | Thông báo không khớp và nút xóa bộ lọc                                    |
| API 403                                   | Thông báo thiếu quyền/phân công, giữ phiên; không gợi ý retry lặp vô ích  |
| Lỗi mạng, máy chủ hoặc định dạng response | Phân biệt lý do, có retry; không giả danh sách rỗng hay giá trị 0         |
| Tải thêm                                  | Giữ bảng hiện tại, khóa nút tải thêm trong lúc chờ, đếm số bản ghi đã tải |
| Tải thêm thất bại                         | Giữ các dòng đã tải và cursor; thử lại cùng trang                         |
| Lô không có ngày hết hạn                  | Hiển thị chưa có dữ liệu, không tự kết luận không cần theo dõi hạn        |
| Lô bị khóa nhưng còn số lượng             | Giữ số vật lý, hiển thị khóa; không chuyển thành khả dụng để phân bổ      |
| Biến động âm/dương/0                      | Hiển thị dấu và số dư sau biến động; không dựa duy nhất vào màu           |
| Màn hình hẹp                              | Bộ chọn/bộ lọc xuống dòng; bảng cuộn ngang bên trong vùng bảng            |
| Giữ chỗ/nhả hàng                          | Vẫn bị deny theo capability PROPOSED; thay UI không mở nghiệp vụ này      |

## Bằng chứng kiểm tra và giới hạn

- `tests/inventory-ui.test.mjs`: render workspace theo cả 7 role, kiểm tab mặc định,
  mixed/unknown/missing scope/legacy deny, thông báo 403 và lỗi retryable.
- `tests/ss-1302-action-matrix.test.mjs`: ma trận độc lập xác nhận aggregate API chỉ
  Seller Owner/Staff. Các test API tồn kho, lô, hạn dùng và privacy cũ vẫn chạy.
- Browser fixture `node tests/inventory-ui-browser.mjs`, URL
  `http://127.0.0.1:24373/tests/fixtures/inventory-preview.html`: component thật,
  dữ liệu giả, không ghi tồn kho/database hay gọi dịch vụ ngoài. Fixture áp dụng
  cùng hạn chế seller-only cho hai endpoint aggregate để không che lỗi 403.
- Đã quan sát Manager chọn kho, đổi sang Hạn dùng vẫn giữ kho, các dòng cận hạn/hết
  hạn/thiếu ngày/khóa xuất; mobile 390 × 844 không tràn ngang trang. Đã mô phỏng lỗi
  trang kế tiếp: giữ 6 dòng cũ, retry thành 12 dòng.
- Các case còn lại trong bảng mô tả hành vi đã triển khai, không khẳng định tất cả
  được kiểm thử E2E bằng backend thật. Lần thử đăng nhập demo local trả 403 trước
  khi vào trang; kiểm tra browser ở đợt này dùng fixture. Không sửa bảo vệ đăng nhập
  hoặc dữ liệu tài khoản để vượt qua lỗi đó.
