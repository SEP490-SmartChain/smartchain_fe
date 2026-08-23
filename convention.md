# Hướng dẫn Code Convention — SmartChain Frontend

Tài liệu này quy định các chuẩn mực về cấu trúc thư mục, quy tắc viết code và quản lý luồng dữ liệu (Data Flow) trong dự án, đảm bảo source code dễ đọc, dễ bảo trì và dễ scale.

---

## 1. Cấu trúc Thư mục (Feature-Sliced Design)

Cấu trúc thư mục dưới đây **ánh xạ 1-1 với FE Package Diagram (Figure 2)** trong
Report 4 – Software Design Document, mục 1.2.1. Số trong ngoặc vuông là số thứ tự
package trong bảng Package Descriptions.

```text
smartchain_fe/
├── messages/                 # [10] Tài nguyên đa ngữ (en.json, vi.json) — NGOÀI src/
└── src/
    ├── main.tsx              # [01] Application Entry — composition root, router, guard, provider
    ├── pages/                # [02] Màn hình cấp route (chỉ lắp ghép, không chứa logic tái sử dụng)
    │   ├── public/           #      landing, login, register, verify email, 404
    │   ├── workspace/        #      orders, inventory, rules, shipments, reconciliation, dashboard, analytics, settings
    │   └── admin/            #      Super Admin console: tenants, carrier catalog
    ├── features/             # [03] 9 package nghiệp vụ, mỗi feature tự chứa api/components/hooks/schemas/types
    │   ├── auth/             #      BE: iam                          — FE-01
    │   ├── tenants/          #      BE: iam                          — FE-02 → FE-07
    │   ├── catalog/          #      BE: catalog                      — FE-08 → FE-11
    │   ├── inventory/        #      BE: inventory                    — FE-12 → FE-15
    │   ├── rules/            #      BE: rules                        — FE-16 → FE-21
    │   ├── orders/           #      BE: orders, allocation, rating   — FE-22 → FE-31
    │   ├── shipments/        #      BE: dispatch, tracking           — FE-32 → FE-40
    │   ├── reconciliation/   #      BE: reconciliation               — FE-41 → FE-46
    │   └── analytics/        #      BE: platform                     — FE-47 → FE-52
    ├── components/           # [04] UI dùng chung, không chứa quyết định nghiệp vụ
    │   ├── common/           #      DataTable, Modal, Form, Pagination, Badge, Button, pdf-viewer
    │   └── layout/           #      RootLayout, AppLayout, AdminLayout, LoginLayout, Sidebar, Topbar, ProtectedRoute
    ├── stores/               # [05] Store toàn cục Zustand: auth, tenant, ui, locale
    ├── hooks/                # [06] Hook dùng chung KHÔNG mang state toàn cục
    ├── services/             # [07] apiClient — đường ra mạng duy nhất của frontend
    ├── lib/                  # [08] Hàm tiện ích thuần, không phụ thuộc React
    └── styles/               # [09] Tailwind config, theme variable, global style
```

### Quy tắc phụ thuộc (FE dependency rules — SDD 1.2.1)

1. `main.tsx` import trang route và toàn bộ package hỗ trợ cấp ứng dụng.
2. Một feature **không được** import file nội bộ của feature khác — phải qua
   `features/<name>/index.ts`, hoặc nâng phần dùng chung lên package chung.
3. Mọi request HTTP đi qua `services/apiClient`. Trang và component UI không gọi
   hệ thống ngoài trực tiếp.
4. `components`, `stores`, `hooks`, `services`, `lib`, `styles`, `messages`
   **không bao giờ** phụ thuộc ngược vào `pages` hay `features`.
5. `stores` chỉ chứa state **dùng chung giữa nhiều feature**. State chỉ một
   feature dùng phải nằm trong store cục bộ của feature đó.

---

## 2. Quy tắc Rendering & Routing (React SPA)

Dự án sử dụng **Vite** làm build tool và **React Router** cho luồng điều hướng (SPA).

### 2.1. Client-Side Rendering (CSR)
- Toàn bộ ứng dụng là CSR (Client-Side Rendering).
- Tránh fetch dữ liệu đồng bộ chặn render UI; sử dụng các trạng thái `isLoading` phù hợp.
- Nên dùng `React.lazy()` và `Suspense` cho các trang (`pages/`) để tối ưu Code Splitting.

### 2.2. Routing & Authentication
- Cấu hình route tập trung tại `src/main.tsx`.
- State toàn cục nằm ở `src/stores` (Zustand), **không** đặt trong `src/hooks`.
- Điều hướng và kiểm tra quyền (Auth Guard) được quản lý qua component `<ProtectedRoute>`. Không có khái niệm Server Middleware.
- **Đa ngôn ngữ (i18n):** Mặc dù mang tên `next-intl`, dự án sử dụng API thuần client-side của thư viện này thông qua `<NextIntlClientProvider>` (hoàn toàn tương thích với React SPA / Vite). Tệp ngôn ngữ nằm trong thư mục `messages/`.

---

## 3. Quy tắc Quản lý State & Form

### 3.1. Xác thực dữ liệu (Validation)
- BẤT KỲ Form nào cũng phải được định nghĩa Schema bằng **Zod** trước khi làm UI.
- Lưu file Schema tại `src/features/[name]/schemas/`.

```typescript
// Ví dụ: schemas/customerSchema.ts
import { z } from "zod";
export const customerSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
});
export type CustomerFormValues = z.infer<typeof customerSchema>;
```

### 3.2. Quản lý Form (react-hook-form)
- Luôn sử dụng `useForm` kết hợp với `@hookform/resolvers/zod`.
- KHÔNG tạo state thủ công (`useState`) cho từng trường input trong Form.

---

## 4. Quy tắc Naming (Đặt tên)

- **Thư mục Feature:** Viết thường, số nhiều (Ví dụ: `orders`, `shipments`, `rules`).
- **Tên File Component:** PascalCase (Ví dụ: `CustomersTable.tsx`, `CustomerForm.tsx`).
- **Tên File Hook:** camelCase, bắt đầu bằng chữ "use" (Ví dụ: `usePagination.ts`).
- **Tên Biến/Hàm:** camelCase (Ví dụ: `fetchCustomers`, `handleSubmit`).
- **Tên Interface/Type:** PascalCase (Ví dụ: `Customer`, `UserRole`).

---

## 5. Quy tắc Code UI & CSS

- **Tailwind CSS:** Mặc định sử dụng Tailwind v4. Không viết CSS thuần trừ khi bắt buộc (ví dụ: animation phức tạp, cấu hình biến CSS toàn cục).
- **Tái sử dụng UI:** Nếu một đoạn UI (như nút bấm, thẻ badge, thanh tìm kiếm) xuất hiện ở 2 nơi trở lên -> Bắt buộc phải extract nó ra thành Component bỏ vào `src/components/common/`.
- **Biến CSS Toàn cục:** Quản lý theme (light/dark, primary colors) bằng các biến CSS trong `src/styles/globals.css`. Dùng utility function `cn()` (clsx + tailwind-merge) để nối chuỗi Tailwind classes.

---

## 6. Luồng phát triển một Tính năng mới (Workflow)

Khi bạn được giao làm một trang mới (VD: **Danh sách Sản phẩm**), hãy làm đúng theo thứ tự sau:

1. **Bước 1:** Dùng một trong 9 feature đã có trong `src/features/` (không tự thêm feature mới nếu chưa sửa Package Diagram).
2. **Bước 2:** Định nghĩa dữ liệu `src/features/products/schemas/productSchema.ts` (Khai báo Zod schema, interface).
3. **Bước 3:** Tạo UI Component `src/features/products/components/ProductsTable.tsx` để render bảng dữ liệu.
4. **Bước 4:** Tạo trang `src/pages/workspace/ProductsPage.tsx` để fetch data từ API và truyền vào `<ProductsTable />`.
5. **Bước 5:** Thêm route mới với `React.lazy()` vào file `src/main.tsx`.
6. **Bước 6:** (Tùy chọn) Viết các hàm gọi API trong `src/features/products/api/`.
