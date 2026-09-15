# Phạm vi giao diện theo vai trò SmartChain

## 1. Trạng thái tài liệu

- Trạng thái: Đã chốt các quyết định kỹ thuật ở mục 15; các câu hỏi nghiệp vụ còn lại ở mục 13 cần Product Owner xác nhận.
- Phạm vi: Giao diện sau đăng nhập, sidebar, route, trang và hành động được hiển thị theo vai trò.
- Chưa bao gồm: Thay đổi mã nguồn, API, cơ sở dữ liệu hoặc dữ liệu seed.
- Ngày đối chiếu: 12/09/2026.

## 2. Nguồn nghiệp vụ

Tài liệu này tổng hợp yêu cầu từ các nguồn sau:

1. `Report3_Software Requirement Specification.docx`
   - Mục 2.1 Actors.
   - Bảng Use Case FE-01 đến FE-67.
   - Bảng Screen Access Matrix.
   - Mục 3, các mô tả màn hình, hành động và đường dẫn điều hướng.
2. `Report1_Project Introduction.docx`
   - Mục 6.1 Major Features, đặc biệt FE-02 đến FE-07 về IAM và RBAC.
3. `smartchain_be/docs/AUTH-SCOPE.md`
   - Danh tính, role và permission phải được xác thực ở server.
   - Thay đổi role/permission có hiệu lực ở request bảo vệ kế tiếp.
   - Workspace không được cấp vai trò `SUPER_ADMIN`.
4. `smartchain_be/packages/iam/src/lib/domain/auth.types.ts`
   - Backend hiện hỗ trợ bốn role đăng nhập: `SUPER_ADMIN`, `TENANT_ADMIN`, `DISPATCHER`, `ACCOUNTANT`.

Nội dung báo cáo được dùng làm dữ liệu nghiệp vụ. Yêu cầu trực tiếp của người dùng vẫn là nguồn ưu tiên cao nhất.

## 3. Mô hình vai trò chính thức

| Role kỹ thuật | Tên hiển thị | Trách nhiệm chính |
| --- | --- | --- |
| `SUPER_ADMIN` | Quản trị hệ thống | Quản lý toàn nền tảng, tenant, danh mục 3PL, gói dịch vụ, sức khỏe hệ thống và giám sát liên tenant. |
| `TENANT_ADMIN` | Quản trị workspace | Thiết lập workspace, kho, kết nối 3PL, người dùng, vai trò, quy tắc và báo cáo trong tenant của mình. |
| `DISPATCHER` | Điều phối logistics | Theo dõi luồng đơn, tồn kho, định tuyến, vận đơn, ngoại lệ và can thiệp khi tự động hóa thất bại. |
| `ACCOUNTANT` | Kế toán tài chính | Tải tệp đối soát, theo dõi xử lý, kiểm tra sai lệch, tạo khiếu nại và xuất báo cáo tài chính. |

Các actor sau không tạo template sidebar cho người dùng đăng nhập:

- `Guest` là người chưa đăng nhập, chỉ dùng landing page, liên hệ bán hàng, đăng ký và kích hoạt tài khoản.
- `Sales Channel System`, `3PL Provider System`, `Webhook Subscriber` và `System Worker` là actor hệ thống hoặc tích hợp, không có app shell dành cho người dùng.

Tenant chỉ được gán `TENANT_ADMIN`, `DISPATCHER` và `ACCOUNTANT`. `SUPER_ADMIN` là tài khoản nền tảng, không thuộc tenant và không xuất hiện trong danh sách role có thể gán cho nhân viên.

## 4. Nguyên tắc áp dụng quyền lên giao diện

1. Profile trả về sau đăng nhập là nguồn dữ liệu cho UI, gồm `roles` và `permissions` do server xác thực.
2. Nếu một người dùng có nhiều role trong cùng tenant, UI lấy hợp của các quyền thuộc các role đó.
3. `SUPER_ADMIN` dùng template nền tảng riêng; không trộn menu workspace vào tài khoản nền tảng không có `tenantId`.
4. Sidebar, tìm kiếm toàn cục, breadcrumb, route và nút thao tác phải dùng cùng một policy trung tâm.
5. Ẩn menu hoặc nút chỉ là kiểm soát trải nghiệm. API vẫn phải kiểm tra role/permission và trả `403` khi thiếu quyền.
6. Khi quyền thay đổi, UI phải cập nhật từ `/auth/me` hoặc lần refresh session kế tiếp; không tin role do client tự lưu.
7. Truy cập trực tiếp URL không có quyền phải hiển thị trang `403 Không có quyền truy cập`, không dùng trang `404` và không tạo vòng lặp redirect.
8. Sau đăng nhập:
   - `SUPER_ADMIN` vào `/admin/tenants` cho đến khi có Admin Dashboard riêng.
   - Ba role workspace vào `/dashboard`.
9. Sau khi quyền bị thu hồi trong lúc đang dùng trang, request nhận `403` phải giữ phiên đăng nhập và chuyển sang trang còn được phép truy cập.

## 5. Template sidebar theo từng role

### 5.1 Super Admin

| Nhóm | Mục sidebar | Route dự kiến | Trạng thái hiện tại |
| --- | --- | --- | --- |
| Platform | Tenant Management | `/admin/tenants` | Đã có route cơ bản |
| Platform | Global Carrier Catalog | `/admin/carriers` | Đã có route cơ bản |
| Platform | Subscription Plans | `/admin/plans` | Cần dựng |
| Monitoring | Platform Health | `/admin/health` | Cần dựng |
| Monitoring | Audit Trail | `/admin/audit` | Cần dựng |
| Monitoring | API Traffic Logs | `/admin/api-traffic` | Cần dựng |
| Monitoring | System Observability | `/admin/observability` | Cần dựng |
| Monitoring | Webhook Delivery Logs | `/admin/webhooks` | Cần dựng |
| Monitoring | Quota Management | `/admin/quotas` | Cần dựng |
| Account | Profile và bảo mật cá nhân | `/settings/profile` | Đã có UI cơ bản |

Không hiển thị Orders, Inventory, Routing Rules, Shipments, Reconciliation, quản lý nhân viên hoặc Roles & Permissions của tenant khi `tenantId` là `null`.

### 5.2 Tenant Admin

| Nhóm | Mục sidebar | Route đề xuất | Quyền giao diện |
| --- | --- | --- | --- |
| Workspace | Dashboard | `/dashboard` | Xem dashboard vận hành và dashboard đối soát. |
| Operations | Orders / Control Tower | `/orders` | Xem đơn, chi tiết, timeline, nguyên nhân chọn carrier và xử lý ngoại lệ. |
| Operations | Inventory | `/inventory` | Xem tồn kho, reservation, danh sách kho và SKU; được tạo/sửa kho và SKU. |
| Operations | Routing Rules | `/rules` | Xem, tạo, xóa, rollback và cấu hình quy tắc/split/fallback/blackout zone. |
| Operations | Shipments | `/shipments` | Xem trạng thái vận đơn và dữ liệu liên quan trong tenant. |
| Finance | Reconciliation | `/reconciliation` | Xem dashboard đối soát, chi tiết sai lệch và báo cáo; không mặc định có quyền tải file hoặc tạo dispute. |
| Reports | Analytics | `/analytics` | Xem order volume, carrier distribution, delivery performance và fee discrepancy. |
| Integrations | Carrier Connections | `/settings/integrations` | Xem carrier, nhập API key, test connection, map pickup point và quản lý tenant rate card. |
| Manage Accounts | User | `/iam/users` | Xem, mời, cập nhật và khóa/mở khóa nhân viên. |
| Manage Accounts | Roles & Permissions | `/roles-permissions/roles` | Xem role hệ thống, gán role/quyền cho thành viên; không tạo hoặc xóa role nền tảng. |
| Workspace Settings | General | `/settings/general` | Cấu hình workspace, timezone, allocation default và notification. |
| Workspace Settings | Webhooks | `/settings/webhooks` | Cấu hình webhook và xem delivery log. |
| Workspace Settings | Usage | `/billing` | Chỉ xem gói hiện tại và quota; không có thanh toán thật trong phạm vi hiện tại. |
| Monitoring | Audit Trail | `/audit` | Chỉ xem log của tenant hiện tại và xuất báo cáo. |
| Monitoring | Integration Errors | `/integration-errors` | Xem lỗi tích hợp 3PL/ERP của tenant. |
| Account | Profile và bảo mật cá nhân | `/settings/profile` | Quản lý hồ sơ và bảo mật của chính mình. |

### 5.3 Logistics Dispatcher

| Nhóm | Mục sidebar | Route đề xuất | Quyền giao diện |
| --- | --- | --- | --- |
| Workspace | Dashboard | `/dashboard` | Xem chỉ số vận hành, order volume, carrier distribution và delivery performance. |
| Operations | Orders / Control Tower | `/orders` | Xem đơn, chi tiết, timeline, lý do chọn carrier; nhập Excel, xử lý lỗi địa chỉ và re-dispatch. |
| Operations | Inventory | `/inventory` | Xem kho, SKU, tồn kho toàn cục và reservation; không thấy nút tạo/sửa kho hoặc SKU. |
| Operations | Routing Rules | `/rules` | Xem, sắp thứ tự, chỉnh condition/action, bật/tắt, rollback và simulate; không thấy nút tạo mới hoặc xóa rule. |
| Operations | Shipments | `/shipments` | Xem hành trình/SLA, hủy vận đơn hợp lệ và xử lý các lần booking lỗi theo use case. |
| Reports | Analytics | `/analytics` | Xem báo cáo vận hành và dùng bộ lọc ngày/carrier/kho. |
| Monitoring | Integration Errors | `/integration-errors` | Xem lỗi tích hợp phục vụ chẩn đoán vận hành. |
| Account | Profile và bảo mật cá nhân | `/settings/profile` | Quản lý hồ sơ và bảo mật của chính mình. |

Không hiển thị Billing, Reconciliation, Staff Accounts, Roles & Permissions, Workspace Settings và toàn bộ Platform Admin.

### 5.4 Finance Accountant

| Nhóm | Mục sidebar | Route đề xuất | Quyền giao diện |
| --- | --- | --- | --- |
| Workspace | Dashboard | `/dashboard` | Xem dashboard tenant, ưu tiên KPI phí, COD và batch đối soát. |
| Finance | Reconciliation | `/reconciliation` | Tải CSV/XLSX, xem tiến độ stream, xem sai lệch, tạo dispute và xuất Excel. |
| Reports | Analytics | `/analytics` | Xem fee discrepancy report và dùng bộ lọc ngày/carrier/workspace hợp lệ. |
| Account | Profile và bảo mật cá nhân | `/settings/profile` | Quản lý hồ sơ và bảo mật của chính mình. |

Không hiển thị Orders, Inventory, Routing Rules, Shipments, Staff Accounts, Roles & Permissions, Workspace Settings và Platform Admin.

## 6. Ma trận route cấp cao

Ký hiệu: `X` là được truy cập, `R` là chỉ đọc, `-` là không được truy cập.

| Route/module | Super Admin | Tenant Admin | Dispatcher | Accountant |
| --- | :---: | :---: | :---: | :---: |
| `/dashboard` | - | X | X | X |
| `/orders` | - | X | X | - |
| `/inventory` | - | X | R | - |
| `/rules` | - | X | X | - |
| `/shipments` | - | R | X | - |
| `/reconciliation` | - | R | - | X |
| `/analytics` | - | X | X | X |
| `/billing` | - | R | - | - |
| `/iam/users` | - | X | - | - |
| `/roles-permissions/*` | - | X | - | - |
| `/settings/profile` | X | X | X | X |
| `/settings/general` | - | X | - | - |
| `/settings/integrations` | - | X | - | - |
| `/settings/webhooks` | - | X | - | - |
| `/audit` | - | R | - | - |
| `/integration-errors` | - | R | R | - |
| `/admin/*` | X | - | - | - |
| `/components/*` | - | - | - | - |

`/components/*` là catalog phát triển UI, không phải chức năng nghiệp vụ trong SRS. Nó chỉ nên bật ở môi trường development hoặc qua feature flag nội bộ, không xuất hiện theo role production.

## 7. Ma trận hành động chi tiết

### 7.1 User và RBAC

| Hành động | Super Admin | Tenant Admin | Dispatcher | Accountant |
| --- | :---: | :---: | :---: | :---: |
| Xem nhân viên trong workspace | - | X | - | - |
| Mời hoặc tạo nhân viên | - | X | - | - |
| Cập nhật nhân viên | - | X | - | - |
| Khóa hoặc mở khóa nhân viên | - | X | - | - |
| Gán role workspace | - | X | - | - |
| Gán `SUPER_ADMIN` cho nhân viên | - | - | - | - |
| Tạo, đổi tên hoặc xóa role nền tảng | - | - | - | - |

### 7.2 Kho, SKU và tồn kho

| Hành động | Tenant Admin | Dispatcher | Accountant |
| --- | :---: | :---: | :---: |
| Xem warehouse và SKU | X | X | - |
| Tạo/sửa/bật tắt warehouse | X | - | - |
| Tạo/sửa SKU | X | - | - |
| Xem tồn kho toàn cục và reservation | X | X | - |

### 7.3 Routing Rules

| Hành động | Tenant Admin | Dispatcher | Accountant |
| --- | :---: | :---: | :---: |
| Xem rule và lịch sử | X | X | - |
| Tạo rule | X | - | - |
| Xóa rule | X | - | - |
| Sắp thứ tự ưu tiên | - | X | - |
| Chỉnh condition/action | - | X | - |
| Bật/tắt rule | - | X | - |
| Rollback version | X | X | - |
| Simulate / dry-run | - | X | - |
| Cấu hình split, restricted zone và fallback | X | - | - |

### 7.4 Orders và Shipments

| Hành động | Tenant Admin | Dispatcher | Accountant |
| --- | :---: | :---: | :---: |
| Xem Control Tower và chi tiết đơn | X | X | - |
| Xem timeline và lý do chọn carrier | X | X | - |
| Nhập đơn hàng hàng loạt bằng Excel | - | X | - |
| Xử lý lỗi địa chỉ và exception | X | X | - |
| Re-dispatch thủ công | X | X | - |
| Hủy vận đơn trên 3PL | - | X | - |
| Xem cảnh báo SLA và hành trình | X | X | - |

### 7.5 Reconciliation và báo cáo

| Hành động | Tenant Admin | Dispatcher | Accountant |
| --- | :---: | :---: | :---: |
| Xem dashboard đối soát | X | - | X |
| Tải tệp đối soát CSV/XLSX | - | - | X |
| Theo dõi tiến độ batch | - | - | X |
| Xem danh sách và chi tiết sai lệch | X | - | X |
| Tạo dispute ticket | - | - | X |
| Xem và xuất reconciliation report | X | - | X |
| Xem fee discrepancy analytics | X | - | X |

### 7.6 Platform Admin

| Hành động | Super Admin |
| --- | :---: |
| Xem, lọc, suspend và unsuspend tenant | X |
| Xem chi tiết tenant và usage | X |
| Quản lý global 3PL catalog | X |
| Quản lý platform default rate card | X |
| Chạy carrier connectivity health check | X |
| Quản lý subscription plan và quota | X |
| Xem platform health, API traffic và DLQ | X |
| Retry hoặc purge DLQ job | X |
| Xem audit trail toàn nền tảng | X |

## 8. Capability đề xuất cho frontend

Các mã dưới đây là tên policy UI đề xuất. Đây chưa phải hợp đồng API chính thức và phải được đối chiếu với permission seed của backend trước khi code.

| Capability UI | Role mặc định |
| --- | --- |
| `workspace.dashboard.view` | Tenant Admin, Dispatcher, Accountant |
| `workspace.settings.manage` | Tenant Admin |
| `iam.users.manage` | Tenant Admin |
| `iam.roles.assign` | Tenant Admin |
| `carriers.credentials.manage` | Tenant Admin |
| `warehouses.view` | Tenant Admin, Dispatcher |
| `warehouses.manage` | Tenant Admin |
| `catalog.products.view` | Tenant Admin, Dispatcher |
| `catalog.products.manage` | Tenant Admin |
| `inventory.view` | Tenant Admin, Dispatcher |
| `rules.view` | Tenant Admin, Dispatcher |
| `rules.create_delete` | Tenant Admin |
| `rules.operate` | Dispatcher |
| `orders.view` | Tenant Admin, Dispatcher |
| `orders.operate` | Dispatcher |
| `shipments.view` | Tenant Admin, Dispatcher |
| `shipments.operate` | Dispatcher |
| `reconciliation.view` | Tenant Admin, Accountant |
| `reconciliation.operate` | Accountant |
| `analytics.operations.view` | Tenant Admin, Dispatcher |
| `analytics.finance.view` | Tenant Admin, Accountant |
| `platform.tenants.manage` | Super Admin |
| `platform.carriers.manage` | Super Admin |
| `platform.plans.manage` | Super Admin |
| `platform.observability.view` | Super Admin |
| `audit.tenant.view` | Tenant Admin |
| `audit.platform.view` | Super Admin |

## 9. Template component cần có khi triển khai

Phần này chỉ mô tả cấu trúc dự kiến, chưa yêu cầu tạo file trong giai đoạn đặc tả.

| Thành phần | Trách nhiệm |
| --- | --- |
| Access policy trung tâm | Khai báo role, capability, route và menu tại một nguồn duy nhất. |
| `ProtectedRoute` mở rộng | Kiểm tra role/capability, xử lý `403` và redirect mặc định. |
| `Can` component | Ẩn hoặc hiển thị nút, tab, cột và thao tác theo capability. |
| `useAccess` hook | Trả `can`, `canAny`, `canAll` từ profile hiện tại. |
| Sidebar builder | Chỉ tạo group/menu có ít nhất một route được phép. |
| Global search policy | Không trả về route mà người dùng không được truy cập. |
| Settings tab policy | Profile cho mọi role; workspace settings chỉ cho Tenant Admin. |
| Role-aware dashboard | Dùng cùng app shell nhưng thay KPI và quick action theo role. |
| Access Denied page | Hiển thị `403`, giải thích ngắn và nút về trang mặc định của role. |

## 10. Trạng thái UI bắt buộc

Mỗi template role phải xử lý các trạng thái sau:

- Đang khôi phục session: chưa render menu có quyền.
- Đã xác thực và có quyền: render trang bình thường.
- Đã xác thực nhưng thiếu quyền: trang `403`.
- Role hoặc permission vừa thay đổi: làm mới profile và cập nhật menu mà không cần đăng nhập lại.
- API trả `403`: giữ session, báo không đủ quyền và không retry refresh token.
- API trả `401`: dùng flow refresh session hiện có.
- Không có dữ liệu: empty state đúng với module, không dùng trang lỗi.
- Route bị ẩn khỏi sidebar vẫn phải được guard khi nhập URL trực tiếp.

## 11. Điểm cần sửa so với UI mẫu hiện tại khi bắt đầu code

1. UI Roles & Permissions mẫu SaaSable đang dùng 11 role giả lập. Phạm vi SmartChain chỉ có bốn role backend; màn hình tenant chỉ được gán ba role workspace.
2. Tenant không được tạo, đổi tên hoặc xóa role nền tảng. Các nút Add Role, Delete Role và chỉnh mã role phải được bỏ hoặc chỉ dành cho luồng quản trị nền tảng nếu có yêu cầu mới.
3. Permission mẫu như `account.*`, `invoice.*` và `pricing.*` chưa phản ánh domain SmartChain. Cần thay bằng permission cho IAM, warehouse, catalog, inventory, rules, orders, shipments, reconciliation, analytics và platform.
4. Sidebar hiện mới phân biệt `SUPER_ADMIN` và `TENANT_ADMIN`; cần thêm template rõ cho `DISPATCHER` và `ACCOUNTANT`.
5. Các route workspace hiện nằm dưới guard đăng nhập chung; cần guard theo capability ở cả route và action.
6. Global search hiện có thể hiển thị route ngoài quyền; cần dùng cùng access policy với sidebar.
7. `/components/*` chỉ là UI catalog phát triển và phải tách khỏi menu production.
8. Billing hiện là UI mẫu. Theo SRS, thanh toán thật nằm ngoài phạm vi; Tenant Admin chỉ xem plan/quota, còn quản lý plan thuộc Super Admin.

## 12. Ngoài phạm vi của đợt triển khai UI RBAC

- Tạo endpoint CRUD role/permission mới.
- Cho tenant tự tạo custom role.
- Cho tenant cấp hoặc thu hồi `SUPER_ADMIN`.
- Tích hợp cổng thanh toán Stripe, VNPay hoặc thanh toán subscription thực tế.
- Thay đổi Prisma schema, migration hoặc seed permission backend.
- Xây UI cho actor hệ thống, worker hoặc đối tác 3PL.
- Quyết định mã permission backend khi chưa có contract được nhóm chốt.
- Hoàn thiện nghiệp vụ/API của các module đang chỉ là placeholder; đợt RBAC chỉ quyết định khả năng nhìn thấy và thao tác UI.

## 13. Tiêu chí nghiệm thu trước khi bắt đầu code

- [x] Bốn role backend là role đăng nhập chính thức; Guest là actor public, không phải role gán cho nhân viên.
- [ ] Backend xác nhận danh sách permission code và mapping role-permission seed.
- [x] Tenant Admin chỉ được gán ba role workspace; không thể gán `SUPER_ADMIN`.
- [ ] Xác nhận quyền Tenant Admin đối với Reconciliation là chỉ đọc và xuất báo cáo.
- [ ] Xác nhận Tenant Admin có được re-dispatch/resolve exception hay chỉ Dispatcher thực hiện.
- [ ] Xác nhận `/billing` chỉ hiển thị plan/quota cho Tenant Admin.
- [x] `/components/*` chỉ xuất hiện trong development.
- [x] Người dùng nhiều role workspace nhận hợp capability của các role đó.
- [x] URL ngoài quyền dùng trang `403`; route mặc định theo mục 4.

## 14. Tiêu chí nghiệm thu sau khi triển khai

- [ ] Mỗi role chỉ thấy đúng group/sidebar theo ma trận này.
- [ ] Global search không hiển thị route ngoài quyền.
- [ ] Nhập trực tiếp URL ngoài quyền luôn vào trang `403`.
- [ ] Nút create/edit/delete/import/export/simulate chỉ xuất hiện đúng role.
- [ ] Người dùng nhiều role nhận hợp quyền và không nhận quyền ngoài tenant.
- [ ] `SUPER_ADMIN` không nhìn thấy dữ liệu workspace khi không có tenant context.
- [ ] Thay đổi quyền được phản ánh sau khi làm mới profile.
- [ ] `403` không đăng xuất; `401` vẫn theo flow refresh hiện tại.
- [ ] Sidebar thu gọn, mobile drawer, breadcrumb và topbar giữ đúng design system hiện có.
- [ ] Có test cho redirect sau login, route guard, menu visibility, global search và action visibility của cả bốn role.
- [ ] TypeScript, ESLint, format, unit test và production build đều đạt.

## 15. Quyết định kỹ thuật đã chốt trước khi triển khai

### 15.1 Nguồn policy UI

Chọn phương án **role kết hợp lớp capability nội bộ**.

- Trong giai đoạn backend chưa seed permission, role là dữ liệu đầu vào cho policy UI và được ánh xạ sang capability theo mục 5–8.
- Không tự động coi mảng `permissions` rỗng là lỗi, cũng không union permission server với capability fallback.
- Khi backend có permission seed và contract chính thức, việc chuyển nguồn phải qua feature flag hoặc contract version rõ ràng. Sau khi chuyển, permission server là nguồn policy duy nhất.
- Backend/API tiếp tục là nơi kiểm tra authorization cuối cùng ở mọi giai đoạn.

### 15.2 Trang Roles & Permissions

Chọn phương án **chỉ xem role/permission hệ thống và gán role**.

- Bỏ Add/Delete Role và CRUD Permission.
- Hiển thị ba role có thể gán trong workspace: Tenant Admin, Logistics Dispatcher và Finance Accountant.
- Không hiển thị hoặc cho phép gán Super Admin.
- Permission theo domain SmartChain được hiển thị chỉ đọc.
- Tab System Users cho phép Tenant Admin cập nhật role của thành viên trong phạm vi workspace.

### 15.3 Route chưa có nghiệp vụ

Chọn phương án **tạo placeholder dùng component `UnderConstruction`**.

- Tạo đủ route cần thiết để kiểm thử sidebar, breadcrumb, global search và route guard.
- Placeholder chỉ trình bày tên và trạng thái chưa triển khai; không giả lập API, dữ liệu hay nghiệp vụ.

### 15.4 UI component catalog

Chọn phương án **chỉ bật trong development**.

- Sidebar và route `/components/*` chỉ được đăng ký khi `import.meta.env.DEV` là `true`.
- Production build không hiển thị và không cho truy cập catalog này.

### 15.5 Kiểm thử

Chọn phương án **viết test hàm thuần cho policy và redirect trong cùng đợt triển khai**.

- Tách access policy khỏi React để Node test runner hiện tại có thể kiểm thử trực tiếp.
- Bao phủ bốn role, người dùng nhiều role, redirect sau login, route, menu, global search và action visibility.
- UI guard không thay thế test authorization ở backend.
