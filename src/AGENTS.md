# Rules for ORCA Frontend Source

File này áp dụng cho mọi file trong `src/`. Phải đọc và tuân thủ `../AGENTS.md` trước.

## Trước khi sửa source

- Đọc đầy đủ `../convention.md`.
- Với UI, đọc `../docs/DESIGN_SYSTEM.md` và kiểm tra `styles/tokens.css`, `styles/globals.css` cùng component dùng chung liên quan.
- Với auth, role, permission, sidebar, route, search hoặc action, đọc `../docs/RBAC_UI_SCOPE.md`.
- Kiểm tra `git status --short`, code lân cận, test liên quan và public export của feature.
- Chỉ sửa phạm vi nhỏ nhất đáp ứng đầy đủ yêu cầu; không ghi đè thay đổi chưa commit không thuộc nhiệm vụ.

## UI và design system

- Font toàn app là Archivo 400/500/600/700.
- Dùng semantic token `--sc-*`; không hardcode màu thương hiệu hoặc tạo palette riêng trong page.
- Giữ scale, spacing, radius, elevation và motion trong `docs/DESIGN_SYSTEM.md`.
- Motion phải tôn trọng `prefers-reduced-motion`.
- Tái sử dụng `components/Common`; component xuất hiện từ hai nơi phải được tách dùng chung.
- Sidebar thu gọn chỉ hiển thị icon; desktop/mobile phải dùng cùng cấu trúc điều hướng và policy.
- Interactive element cần accessible name, focus state và keyboard behavior. Bảng cần accessible label, icon-only button cần `aria-label`.

## Kiến trúc source

- Page chỉ lắp ghép feature; logic nghiệp vụ tái sử dụng đặt trong feature phù hợp.
- Feature không deep-import file nội bộ của feature khác.
- Shared component, hook, store, service và lib không phụ thuộc ngược vào page hoặc feature.
- Mọi request mạng đi qua `services/apiClient.ts`; component không gọi `fetch` trực tiếp.
- Form dùng React Hook Form và Zod theo `convention.md`.
- Dữ liệu chưa tin cậy phải được validate trước khi đi vào UI.

## RBAC UI

- Policy trung tâm là `lib/accessPolicy.ts`, theo `../docs/RBAC_UI_SCOPE.md`. PLATFORM dùng
  `ORCA_ADMIN`, `OPS_DISPATCHER`, `WAREHOUSE_MANAGER`, `WAREHOUSE_STAFF`, `ORCA_ACCOUNTANT`;
  TENANT dùng `SELLER_OWNER`, `SELLER_STAFF`. Guest và external system không phải staff role.
- Capability mới phải có UC/action/resource/scope và API contract rõ; thiếu nguồn thì giữ đề xuất
  và deny. Ma trận screen không grant mọi action; không đoán permission code backend.
- Chỉ chuyển sang permission server khi có seed, contract và cơ chế bật nguồn policy rõ ràng; không union hai nguồn để tránh cấp quyền ngoài ý muốn.
- Sidebar, route guard, global search, breadcrumb, settings tab và action-level visibility phải dùng cùng một policy.
- Người dùng nhiều role chỉ union capability trong cùng actor scope. Unknown/missing/mixed scope
  hoặc legacy role không fallback để cấp quyền. Selected seller/warehouse chỉ là filter trong
  phạm vi server cho phép; scope/grant/assignment đổi phải invalidate cache và pending responses.
- Truy cập URL ngoài quyền hiển thị `403`; `403` không đăng xuất, `401` dùng flow refresh hiện có.
- Seller Owner chỉ quản lý staff trong own seller và gán/thu hồi `SELLER_STAFF` cố định; không
  custom role/permission hoặc platform assignment. ORCA role/warehouse assignment thuộc Admin;
  quyền đọc staff của Manager không grant assignment write.
- Seller Staff có scoped order/stock read và ASN; không SKU edit, sales order create, risky-COD
  confirm, tài chính/API key hoặc staff administration. Seller không quản lý kho/carrier/routing
  platform; normal sales order không có seller warehouse/carrier selector.
- Warehouse Staff không nhận/store/render COD, order value, invoice hoặc API secret. Recipient PII
  chỉ ở task/label được phép; blind count không tải expected quantity. Hiding column không thay
  server projection. Export/search/print/download và optional AI phải giữ cùng field/data scope.
- Route nghiệp vụ chưa triển khai dùng shared `UnderConstruction`, không thêm mock API hay nghiệp vụ giả.
- `/components/*` phải được loại khỏi sidebar và route production bằng `import.meta.env.DEV`.

## Kiểm thử bắt buộc cho RBAC

- Tách role/capability policy và redirect thành hàm thuần.
- Test đủ bảy role, nhiều role cùng scope, unknown/missing/mixed scope và legacy deny.
- Test redirect sau login, quyền vào route, menu/search visibility và action visibility.
- Test seller khác, warehouse ngoài assignment, revoke grant/assignment và cache sau scope switch.
- Test Manager approval tách Staff operation; Seller Staff ASN write không cấp SKU/order/finance
  write; Owner staff management không cấp platform assignment.
- Test privacy payload/cache/export/label và blind count; API trả field thừa phải báo backend gap,
  không coi việc hide cột là đã bảo vệ dữ liệu.
- Test direct URL ngoài quyền trả về luồng `403` và không làm mất session.

## Trạng thái và contract ORCA

- `202 Accepted` là đang xử lý, BACKORDER/ON_HOLD/UNKNOWN/LABEL_VERIFYING có explanation và hành
  động hợp lệ. Không đổi authoritative stock/task trước server confirmation; retry dùng cùng
  operation reference. Contract chưa có không giả response hoặc sinh reference mới để báo success.
- ASN declared, received, quarantine và sellable khác nhau; cancel/return chưa physical confirm
  không nhập lại stock trên UI. API status/nullable owner, expiry, tracking phải theo contract,
  không chữa bằng seller/ngày hết hạn/tracking giả.
- VND dùng decimal string/formatting; không tính ledger/COD bằng floating point ở UI. Payment
  ReturnUrl chỉ đọc trạng thái API; không tự set PAID/ACTIVE. Deposit không là ví nạp/rút.
- Invoice issued, manifest signed và ledger posted dùng flow correction/reversal/dispute riêng.
  Optional AI suggestion chờ human acceptance qua action chuẩn; không tự post stock/tài chính.

## Hoàn tất

Thay đổi source code phải qua TypeScript, ESLint, Prettier, unit test và production build theo
`../AGENTS.md`. Nếu chỉ sửa Markdown, chạy format/local-link/diff checks; không cần runtime tests
để xác minh văn bản. Ghi rõ kiểm tra nào chưa chạy hoặc skip và lý do; build xanh không chứng minh
nghiệp vụ ORCA mới đã hoàn tất.
