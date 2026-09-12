# Rules for SmartChain Frontend Source

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

- Policy trung tâm dùng bốn role backend: `SUPER_ADMIN`, `TENANT_ADMIN`, `DISPATCHER`, `ACCOUNTANT`.
- Hiện tại ánh xạ role sang capability nội bộ theo ma trận đã duyệt. Không đoán permission code backend.
- Chỉ chuyển sang permission server khi có seed, contract và cơ chế bật nguồn policy rõ ràng; không union hai nguồn để tránh cấp quyền ngoài ý muốn.
- Sidebar, route guard, global search, breadcrumb, settings tab và action-level visibility phải dùng cùng một policy.
- Người dùng nhiều role workspace nhận hợp capability của các role đó. `SUPER_ADMIN` không được trộn vào role workspace.
- Truy cập URL ngoài quyền hiển thị `403`; `403` không đăng xuất, `401` dùng flow refresh hiện có.
- Tenant Admin chỉ gán ba role workspace. Trang Roles & Permissions không có Add/Delete Role, CRUD permission hoặc custom role.
- Route nghiệp vụ chưa triển khai dùng shared `UnderConstruction`, không thêm mock API hay nghiệp vụ giả.
- `/components/*` phải được loại khỏi sidebar và route production bằng `import.meta.env.DEV`.

## Kiểm thử bắt buộc cho RBAC

- Tách role/capability policy và redirect thành hàm thuần.
- Test tối thiểu cả bốn role và trường hợp nhiều role.
- Test redirect sau login, quyền vào route, menu/search visibility và action visibility.
- Test `SUPER_ADMIN` không nhận workspace menu khi không có tenant context.
- Test direct URL ngoài quyền trả về luồng `403` và không làm mất session.

## Hoàn tất

Chỉ báo hoàn thành sau khi TypeScript, ESLint, Prettier, unit test và production build đều đạt. Ghi rõ kiểm tra nào chưa chạy được và lý do.
