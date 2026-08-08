# Hướng dẫn Code Convention (Dự án React SPA Base)

Tài liệu này quy định các chuẩn mực về cấu trúc thư mục, quy tắc viết code và quản lý luồng dữ liệu (Data Flow) trong dự án, đảm bảo source code dễ đọc, dễ bảo trì và dễ scale.

---

## 1. Cấu trúc Thư mục (Feature-Sliced Design)

Dự án áp dụng mô hình Feature-Sliced Design (FSD). Mọi tính năng mới KHÔNG ĐƯỢC nhét tất cả vào `src/components`. Bạn phải chia theo Domain/Nghiệp vụ.

```text
src/
├── components/           # UI Components dùng chung
│   ├── common/           # Component cơ bản và phức tạp (Button, DataTable, Modal...)
│   └── layout/           # Các Layout components (Sidebar, Topbar...)
├── features/             # Nơi chứa toàn bộ logic theo Domain (Core)
│   └── [feature_name]/   # Ví dụ: customers, orders, products...
│       ├── api/          # Hàm gọi API liên quan đến feature này
│       ├── components/   # Các UI Component đặc thù của feature này
│       └── schemas/      # Định nghĩa TypeScript Interface & Zod Schema
├── hooks/                # Global custom hooks (useAppStore, useAuth...)
├── pages/                # Page Components được load bởi React Router
│   ├── admin/            # Các trang nội bộ (cần đăng nhập)
│   └── LoginPage.tsx     # Các trang public
├── services/             # Global services (apiClient.ts)
├── styles/               # Global CSS (Tailwind)
└── main.tsx              # Entry point và cấu hình Routing
```

---

## 2. Quy tắc Rendering & Routing (React SPA)

Dự án sử dụng **Vite** làm build tool và **React Router** cho luồng điều hướng (SPA).

### 2.1. Client-Side Rendering (CSR)
- Toàn bộ ứng dụng là CSR (Client-Side Rendering).
- Tránh fetch dữ liệu đồng bộ chặn render UI; sử dụng các trạng thái `isLoading` phù hợp.
- Nên dùng `React.lazy()` và `Suspense` cho các trang (`pages/`) để tối ưu Code Splitting.

### 2.2. Routing & Authentication
- Cấu hình route tập trung tại `src/main.tsx`.
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

- **Thư mục Feature:** Viết thường, số nhiều (Ví dụ: `customers`, `orders`, `products`).
- **Tên File Component:** PascalCase (Ví dụ: `CustomersTable.tsx`, `CustomerForm.tsx`).
- **Tên File Hook:** camelCase, bắt đầu bằng chữ "use" (Ví dụ: `useAppStore.ts`).
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

1. **Bước 1:** Tạo thư mục domain `src/features/products/`.
2. **Bước 2:** Định nghĩa dữ liệu `src/features/products/schemas/productSchema.ts` (Khai báo Zod schema, interface).
3. **Bước 3:** Tạo UI Component `src/features/products/components/ProductsTable.tsx` để render bảng dữ liệu.
4. **Bước 4:** Tạo trang `src/pages/admin/ProductsPage.tsx` để fetch data từ API và truyền vào `<ProductsTable />`.
5. **Bước 5:** Thêm route mới với `React.lazy()` vào file `src/main.tsx`.
6. **Bước 6:** (Tùy chọn) Viết các hàm gọi API trong `src/features/products/api/`.
