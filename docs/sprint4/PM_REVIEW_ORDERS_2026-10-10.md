# PM review luồng đơn hàng ORCA — 10/10/2026

## Kết luận

Bản chi tiết trong ảnh chưa phù hợp để seller xử lý nhiều đơn: thông tin tiền lặp, mọi khoản 0 đều xuất hiện, người nhận lẫn với tiền, không có thành tiền từng dòng và trạng thái chưa có đơn giao bị trình bày như thông báo cần chú ý. Đã sửa phần trình bày trong feature Orders; không thay đổi API, công thức tiền, phân quyền hoặc trạng thái xử lý.

Phạm vi gồm danh sách/lọc đơn, form tạo, thông báo tiếp nhận, nhập Excel/Google Sheets, chi tiết đơn, sản phẩm, giao hàng và lịch sử. Đây là review feature Orders, không phải chứng nhận toàn bộ sản phẩm ORCA hay quy trình giao hàng/đối soát.

## Tham khảo đối thủ và quyết định áp dụng

Đối chiếu tài liệu chính thức công khai ngày 10/10/2026; không đăng nhập hay kiểm thử hệ thống quản trị riêng của đối thủ.

| Nguồn                                                                                                            | Điều quan sát được                                                                                                                           | Áp dụng ở ORCA                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Shopify — Order details](https://help.shopify.com/en/manual/fulfillment/managing-orders/managing-order-details) | Tách sản phẩm, subtotal/giảm giá và timeline; sự kiện thanh toán mở rộng để xem sâu. Giá/thông tin sản phẩm ở Shopify được giữ theo lúc đặt. | Tách các nhóm thông tin; làm nổi số thu khi giao; phép tính và lịch sử mở khi cần. Giữ giá theo dòng đơn. Không tuyên bố ORCA đã lưu snapshot tên sản phẩm như Shopify.                                       |
| [Sapo — Danh sách đơn](https://help.sapo.vn/xem-danh-sach-don-va-thao-tac-nhanh-hang-loat-don-hang)              | Danh sách gồm mã, khách, trạng thái, thanh toán, khoản khách phải trả và ngày; có điều chỉnh cột, tìm kiếm/lọc.                              | Giữ bảng ORCA ngắn, đổi tiêu đề tiền thành “Thu khi giao”, thống nhất ngày giờ. Chưa thêm tìm khách/số điện thoại, saved views hay cột khách vì API danh sách hiện chưa có contract đó và Staff không có PII. |
| [KiotViet — Đặt hàng](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-dat-hang/dat-hang/)              | Có tìm/quét/nhập hàng, nhập tiền khách thanh toán/đặt cọc; phân biệt phiếu đặt và bước xử lý/giao.                                           | Giữ đặt cọc riêng giảm giá; form và chi tiết dùng chung cách tính/hiển thị. Tiếp nhận đơn không đồng nghĩa đã phân bổ, có vận đơn hoặc đã thu tiền.                                                           |

Các quyết định bố cục là đánh giá của dự án sau khi đối chiếu nguồn, không phải khẳng định đối thủ có cùng contract nghiệp vụ với ORCA. Không sao chép tính năng giao/thu/hủy/in chưa có API.

## Ma trận review màn hình

| Màn hình            | Quyết định triển khai                                                                                                                                             | Xác minh                                                                                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Danh sách và bộ lọc | Mã, nguồn, trạng thái, ngày tạo; Owner có “Thu khi giao”. Ngày theo locale, múi giờ Việt Nam. Giữ lọc theo contract, không dựng thống kê từ một trang phân trang. | Chrome có đơn mới và giá 235.000đ; tests API filter/cursor/scope/403.                                                                                                                                   |
| Tạo đơn             | Tiêu đề nhỏ hơn; giữ người nhận → sản phẩm → thanh toán. Tóm tắt chỉ số cần thu, hàng và ship; chi tiết phép tính mở khi cần.                                     | Chrome: tìm Ceramic, thêm và tự clear; giá 200.000 hợp lệ, tỉnh Hà Nội/phường Ba Đình có dữ liệu; PAID cho số thu 0; COD + ship 35.000 cho 235.000.                                                     |
| Tiếp nhận           | Giữ thông báo đã tiếp nhận, mã đơn và nút Xem đơn; không báo đã giao/đã thu.                                                                                      | Tạo thật đơn synthetic `ORCA-24C15F6D25F0`, trạng thái RECEIVED, bảng/chi tiết cùng 235.000đ.                                                                                                           |
| Nhập Excel          | Giảm hướng dẫn trùng; giữ 3 bước, giới hạn, mẫu chính và preview trước confirm. Chuyển Google Sheets và thông tin kết nối vào mục tùy chọn.                       | Xem trực tiếp Chrome; kiểm tra chưa chọn file thì preview disabled. Tests API preview/grouped feedback/multipart/retry. Chưa xác minh upload qua UI lượt này do file chooser extension không hoạt động. |
| Chi tiết mới        | Header mã/trạng thái/nguồn/ngày. Người nhận riêng; tiền riêng, tổng nổi bật. Không đổ toàn bộ khoản 0 ra màn mặc định.                                            | Đơn vừa tạo 235.000đ; đơn giảm giá/cọc `UX-VERIFY-20261009-BREAKDOWN` 270.000đ, mở phép tính thấy đúng các khoản.                                                                                       |
| Sản phẩm            | Bảng tên/SKU, số lượng, đơn giá, thành tiền; nhiều dòng thêm tổng tiền hàng. Thiếu dữ liệu có lời giải thích.                                                     | Render tests số lượng × đơn giá, subtotal nhiều dòng, tên/SKU; đơn legacy DEMO-RSV-1002 có empty state.                                                                                                 |
| Giao hàng           | Đổi “Đơn con” thành “Giao hàng/Đơn giao”; kho, trạng thái, mã vận đơn ở lớp chính; hàng/kiện/COD phân bổ mở khi cần. Không gọi COD con là tổng thu bao gồm phí.   | Chrome đơn đã giữ hàng, tên kho và chi tiết kiện. Render tests vận đơn hết hiệu lực, vận đơn hoàn, kết quả booking chưa biết.                                                                           |
| Lịch sử             | Mặc định thu gọn; mới nhất trước; sự kiện đầu không có mũi tên từ “—”; không in raw reason/UUID. Chỉ thêm thời điểm cập nhật dưới cùng khi có nhiều sự kiện.      | Chrome mở lịch sử; render tests thứ tự/unknown reason; formatter timezone.                                                                                                                              |
| Staff               | Giữ bảng/chi tiết vận hành; không người nhận, đơn giá, thành tiền, COD hoặc payment breakdown.                                                                    | Strict response projection tests + render privacy tests. Không đổi role/grant.                                                                                                                          |
| Responsive          | Hai cột desktop, xếp dọc ở màn nhỏ; bảng ở desktop; thẻ sản phẩm ở mobile hiển thị đầy đủ giá và thành tiền, modal cuộn dọc với nút đóng giữ ở đầu.               | Chrome 1280×900 và 390×844; viewport/page width cùng 390, không tràn ngang trang. Đã reset viewport sau kiểm tra.                                                                                       |

## Các quy tắc không được hiểu sai

- Thu khi giao = tiền hàng còn thu + phí giao hàng còn thu của người nhận. Giảm giá, khách đã trả và phí ship đã trả vẫn giữ riêng; BigInt/chuỗi VND, không tính bằng floating point.
- Chi tiết là khai báo lúc tạo đơn, không phải chứng nhận ngân hàng/ledger hay số còn nợ sau giao. Số thu 0 chỉ có nghĩa không thu khi giao, không suy ra “đã xác minh thanh toán”.
- Chi tiết tính tiền giữ tổng hàng, giảm giá/tiền sau giảm nếu có, tiền hàng đã trả; phí thu/đã trả nếu khách chịu phí. Đơn legacy không có breakdown không tạo số đặt cọc/giảm giá giả.
- ON_HOLD/BACKORDER và lý do không bị thu gọn mất. Vận đơn cũ có nhãn không còn hiệu lực; UNKNOWN/CANCEL_UNKNOWN/FAILED/CANCEL_REQUESTED có giải thích. Trạng thái lạ không được tô thành công.
- Khi chưa có giao hàng: trạng thái đang tiếp nhận/xử lý có thông báo chờ thông tin; trạng thái kết thúc chỉ báo chưa có dữ liệu, không hứa sẽ xử lý tiếp.
- API vẫn quyết định quyền và data projection. Ẩn cột không thay bảo vệ ở API; source/schema không nới quyền.

## Tự review và kiểm thử

Bổ sung 7 test hiển thị/ngữ nghĩa: tách tiền và PII; legacy/0 thu không giả đã trả; Staff; COD con/unknown booking/vận đơn hoàn; ngày giờ/trạng thái; empty product/terminal delivery; subtotal nhiều dòng. Dùng render thật OrderDetail với next-intl, không chỉ kiểm tra class CSS.

Chạy quality gate cuối: TypeScript, ESLint, format, toàn bộ unit tests, production build; kết quả và log trong `E:/FinalFPT_Project/outputs/orders-pm-final-*.log`. Kết quả cuối: TypeScript 0 lỗi; ESLint 0 lỗi, 41 cảnh báo có sẵn ngoài phần chỉnh lần này; format đạt; 169/169 tests đạt, 0 skip; build đạt (còn cảnh báo bundle >500kB có sẵn). Prettier cho messages/tests/README/báo cáo và git diff --check cũng đạt. Chưa chạy lại BE integration suite vì không thay backend/API/migration trong lượt này; các test API FE là fixture contract tests, không thay kiểm thử giao hàng thực.

Ảnh xác minh:

- [Desktop — đơn vừa tạo](orders-detail-pm-desktop.png)
- [Mobile — bố cục 390px](orders-detail-pm-mobile.png)

## Giới hạn và việc nên làm tiếp

1. Chrome extension không mở được bộ chọn file trong lượt kiểm thử; không tuyên bố đã chạy upload/preview/confirm thật từ UI. Hướng dẫn chính thức khi cần bật upload:

   To enable file upload, open chrome://extensions, click Details under the ChatGPT browser extension, and enable "Allow access to file URLs." See [here](https://developers.openai.com/codex/app/chrome-extension#upload-files) for details.

2. Google Sheets cần kết nối n8n/OAuth của quản trị; tải workbook không tự gửi đơn. Không triển khai kết nối mới trong lượt này.
3. Giá bán mặc định/bảng giá seller chưa có contract catalog trong luồng hiện hành. Không dùng giá trị khai báo/bảo hiểm làm giá bán. Cần phát triển catalog pricing riêng để giảm nhập tay ở quy mô lớn.
4. Tên/SKU hiện do API resolve từ danh mục, giá/số lượng lấy từ dòng đơn. Lưu lịch sử tên/SKU bất biến như Shopify cần snapshot/versioned contract ở backend.
5. Màn chi tiết không phải màn đối soát, ghi nhận thanh toán mới, sửa/hủy đơn, in nhãn hay vận hành kho. Chỉ thêm action khi có API và quyền/lifecycle tương ứng.
6. Chưa đo hiệu năng danh sách hàng nghìn đơn trên dữ liệu thật hay kiểm thử bằng thiết bị cầm tay thật; không suy ra đạt NFR từ responsive/browser tests.

## Lượt tự review bổ sung theo yêu cầu

Không dùng kết quả test xanh làm bằng chứng UX đã tối ưu. Đọc lại source, test, các giới hạn đã công bố và kiểm tra lại trên Chrome.

| Mức độ | Phát hiện                                                                                                           | Xử lý và bằng chứng                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2     | Bảng sản phẩm ở 390px cắt cột thành tiền; không tràn trang nhưng seller phải kéo ngang để xem thông tin quan trọng. | Đã đổi thành thẻ sản phẩm dưới breakpoint sm: tên/SKU, số lượng, đơn giá, thành tiền đều có nhãn và hiển thị theo chiều dọc. Desktop vẫn dùng bảng. Chrome xác minh trực tiếp trên đơn ORCA-24C15F6D25F0; page width = viewport = 390. |
| P2     | Chi tiết đơn giao có tên sản phẩm thì bỏ SKU, gây nhầm khi các biến thể cùng tên được chia giao.                    | Đã giữ SKU cạnh dòng hàng của đơn giao. Render test với cùng tên nhưng BLUE-M/BLUE-L xác minh cả hai mã còn hiển thị. Chưa có fixture live phù hợp để chứng minh tình huống split variant trên Chrome.                                 |

Bổ sung 2 test hồi quy cho các phát hiện này. Chuẩn hóa fixture hiển thị: 2 × 200.000 = tổng hàng 400.000, tránh dùng giá/tổng không khớp để suy luận nghiệp vụ. Tổng suite hiện tại **171/171 đạt**, 0 skip. TypeScript, lint (0 lỗi/41 cảnh báo có sẵn), format và build đều qua; log `E:/FinalFPT_Project/outputs/orders-self-review-*.log`. Staff privacy test kiểm tra cả markup desktop và mobile không có giá/COD/PII.

Ảnh mới: [Sản phẩm mobile sau tự review](orders-detail-self-review-mobile.png). Đã reset viewport và giữ tab chi tiết đơn cho người dùng.

Giới hạn vẫn còn: chưa xác minh upload/preview/confirm Excel trực tiếp qua Chrome; chưa có catalog pricing mặc định; tên/SKU lịch sử chưa phải snapshot bất biến; chưa kiểm thử tải nghìn đơn hoặc giao hàng/đối soát thật. Không kết luận toàn bộ luồng production đã hoàn tất từ kết quả kiểm tra phần hiển thị.
