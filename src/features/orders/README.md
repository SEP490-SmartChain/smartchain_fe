# Seller orders — Sprint 4

SS-1168 / SS-1171, branch `feat/SS-1171-seller-orders`, synced with develop before publication. OrdersPage composes SellerOrders; API contracts, hooks and forms stay inside this feature.

Seller Owner can create manual orders, download a seller-specific XLSX template and preview/import up to 100 product rows/1 MiB. Owner and Staff can browse own-seller orders with code/status/channel/date filters, cursor pagination, history, fulfillment suborders, parcel summaries and tracking. Strict Staff schemas omit recipient and financial fields. Platform roles keep the existing unavailable screen until their business-specific screens are implemented.

Manual form uses React Hook Form/Zod, real active SKU selection, integer quantities and exact VND strings. A draft retains its idempotency key for retry and disables concurrent submit. Acceptance means RECEIVED, pending core processing. FormData upload leaves multipart boundary generation to the browser.

Manual drafts remain mounted when their dialog closes, preserving inputs, product labels, generated code and retry reference within the current page/session scope. Confirmed acceptance or explicit discard resets the draft; discard requires confirmation. Page reload/navigation and identity/seller/role changes clear it. No recipient data is persisted to browser storage. Changing a line's SKU clears its old unit price; selecting a product into an empty line also clears any previous price. Seller catalog does not yet provide a default sales price.

Payment mode selects automatic goods COD, prepaid goods (zero COD) or an editable remaining balance. Buyer shipping appears only when the recipient pays; seller-paid mode clears it from the payload. Owner list/detail show the recipient collection total separately from goods value. Current repository contract defines COD as outstanding merchandise, with outstanding buyer shipping added separately. See the handoff for the conflicting external SRS version and unimplemented downstream allocation/billing.

Manual entry selects province/ward names and active products; codes stay internal. Optional order codes and declared goods value are generated/calculated when blank. Excel uses Vietnamese columns, product/address dropdowns and separate quantity/price cells. Product lines with the same order code become one atomic order. Single-product orders may leave the code blank using a generated hidden reference. Preview reports READY without creating orders; confirmation rechecks live intake rules. Legacy technical workbooks remain supported for compatibility.

Normalized address/product/warehouse names are displayed in detail; internal UUIDs and raw error codes are kept out of seller-facing feedback.

Auth scope keys include session revision, actor, tenant, roles and permissions. Changes remount the screen and abort requests; stale responses cannot populate another seller/session. Permission denied never triggers a write retry or widens roles.

Tests: `tests/seller-orders.test.mjs`. Gates: `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build`.

API/Excel contracts and demo steps: BE `docs/SPRINT4_ORDER_INTAKE_HANDOFF.md`. SS-1169 Figma delivery requires a target file; no uploaded mockup is claimed.

## Payment breakdown — 09/10/2026

Tách giá bán, giảm giá, tiền hàng đã trả và phí ship đã trả; tự tính số còn thu. Khoản đã trả là khai báo khi tạo đơn, chưa xác minh ngân hàng. Đơn legacy hiển thị chưa có breakdown thay vì tạo số giảm/cọc giả. Form có thông báo ngay tại khoản tiền vượt giá trị, bảng tổng hợp và chế độ đã trả đủ tự cập nhật theo tiền hàng sau giảm. Quy tắc/API/migration/test: `smartchain_be/docs/SPRINT4_PAYMENT_BREAKDOWN_REVIEW.md`. Đơn UI đã xác minh `UX-VERIFY-20261009-BREAKDOWN`: tổng thu 270.000đ. Ảnh `orders-payment-breakdown-verified.png`.

## PM review — 10/10/2026

Danh sách dùng nhãn ngắn “Thu khi giao”; ngày giờ theo locale và múi giờ Việt Nam. Chi tiết tách người nhận/thanh toán/sản phẩm/giao hàng; số thu khi giao nổi bật, phép tính và lịch sử mở khi cần. Form tạo đơn dùng chung OrderPaymentSummary. Dữ liệu lúc tạo đơn không được diễn giải thành trạng thái đã xác minh thanh toán. COD đơn giao có nhãn riêng, không gọi là tổng thu gồm phí.

Phân tích, nguồn đối chiếu, ma trận kiểm thử và giới hạn: [PM_REVIEW_ORDERS_2026-10-10.md](../../../docs/sprint4/PM_REVIEW_ORDERS_2026-10-10.md).

## Snapshot và nhập lại — 11/10/2026

Chi tiết dùng tên/SKU snapshot từ backend; đơn cũ có `identitySource: CURRENT_CATALOG` hiển thị chú thích. Preview/confirm Excel nhận `existing: true` để hiển thị “Đơn đã tồn tại”, giữ nút “Xem đơn” và không cộng vào số tạo mới. Lỗi tiền hiển thị cột, số đã nhập và mức tối đa với phân nhóm hàng nghìn. Manual retry hỗ trợ `replayed` trong strict response schema. Migration và bằng chứng: BE `docs/SPRINT4_IDENTITY_IMPORT_REVIEW.md`.
