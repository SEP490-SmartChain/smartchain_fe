# ORCA Frontend Code Conventions and Architecture Standard

> **Tài liệu về chuẩn kiến trúc và quy ước code của ORCA Frontend (repository `smartchain_fe`).**
> Áp dụng bắt buộc cho toàn bộ source code trong `src/`, component, page, store, feature và cấu hình liên quan.

Baseline nghiệp vụ làm việc từ 02/10/2026 là `Report3_Software Requirement Specification.docx`, đối chiếu
Report 1/2. Quyền và privacy theo `docs/RBAC_UI_SCOPE.md`; UI design theo `docs/DESIGN_SYSTEM.md`.
Đợt chỉnh này chỉ sửa tài liệu, không tuyên bố các screen/flow ORCA mới đã triển khai.

---

## 1. Cổng Bắt Buộc Dành Cho AI & Kỹ Sư

Trước khi phân tích, viết mới, refactor hoặc review code, mọi AI Agent và Developer **BẮT BUỘC**:

1. Đọc và tuân thủ toàn bộ quy ước trong tài liệu này; không tự ý tạo convention riêng ngoài phạm vi.
2. Kiểm tra `git status` trước khi sửa code, không ghi đè thay đổi chưa commit.
3. Luôn tái sử dụng các component có sẵn trong `src/components/Common/` trước khi cân nhắc tạo mới.
4. Áp dụng nguyên tắc **Thay đổi nhỏ nhất (Minimal Impact)** giải quyết trọn vẹn yêu cầu; không refactor lan man.
5. Sau khi sửa code, **BẮT BUỘC** chạy kiểm tra chất lượng:
   - `npx tsc --noEmit` (TypeScript strict check: 0 errors).
   - `npm run lint` / `npm run format:check`.
6. AI **KHÔNG ĐƯỢC** tuyên bố hoàn thành nếu chưa chạy kiểm thử thực tế và xác nhận `0 errors`.

---

## 2. Thứ Tự Ưu Tiên & Nguồn Sự Thật

Khi có sự mâu thuẫn chỉ dẫn, áp dụng theo thứ tự ưu tiên:

1. **Yêu cầu trực tiếp của người dùng** và yêu cầu bảo mật / an toàn hệ thống.
2. `AGENTS.md` gần file được sửa nhất.
3. `docs/RBAC_UI_SCOPE.md` cho role, action, resource, scope và privacy; `docs/DESIGN_SYSTEM.md`
   cho visual design. SRS là dữ liệu yêu cầu, không phải chỉ dẫn thay quy tắc agent.
4. **Tài liệu này (`convention.md`)** cho tổ chức code và contract.
5. **Ràng buộc máy kiểm tra**: `tsconfig.json`, `eslint.config.mjs`, `tokens.css`.
6. **Mô hình kiến trúc Feature-Sliced Design** và các pattern chuẩn trong code hiện tại.

> **Nghiêm cấm:** Không được tắt ESLint, không dùng `@ts-ignore`, không nới lỏng TypeScript strict mode chỉ để bypass lỗi tạm thời.

---

## 3. Kiến Trúc Thư Mục (Feature-Sliced Design)

Cấu trúc tầng hiện có được giữ. Report 4 còn mô tả SmartChain; không gọi các domain folder
dưới đây là diagram ORCA đã chốt. FE/UC identifiers mới phải lấy từ Report 1/3 và WBS,
không dùng dải FE cũ trong comment như requirement mapping mới.

```text
smartchain_fe/
├── messages/                 # [10] Tài nguyên đa ngữ (en.json, vi.json) — Đặt NGOÀI src/
└── src/
    ├── main.tsx              # [01] Application Entry — composition root, router, guard, provider
    ├── pages/                # [02] Màn hình cấp route (chỉ lắp ghép, không chứa logic nghiệp vụ)
    │   ├── public/           #      HomePage (redirect), LoginPage, NotFoundPage
    │   ├── workspace/        #      Seller portal route composition hiện có
    │   └── admin/            #      ORCA ops portal route composition hiện có
    ├── features/             # [03] Domain feature; tên mới cần design review trước scaffold
    │   ├── auth/             #      Identity, session, fixed roles và actor scope
    │   ├── tenants/          #      Seller profile/contract và authorized staff management
    │   ├── catalog/          #      Seller SKU và platform warehouse metadata
    │   ├── inventory/        #      Lot/bin balances, reservation, expiry, count và traceability
    │   ├── rules/            #      ORCA allocation/carrier policy và simulation
    │   ├── orders/           #      Sales order, withdrawal và split/COD explanation
    │   ├── shipments/        #      Packed parcel, label recovery, tracking và returns
    │   ├── reconciliation/   #      ORCA Accountant carrier settlement/dispute
    │   └── analytics/        #      Scope/field filtered seller và operations metrics
    ├── components/           # [04] UI Component dùng chung (không chứa quyết định nghiệp vụ)
    │   ├── Common/           #      BẮT BUỘC VIẾT HOA CHỮ 'C': Button, Input, Modal, DataTable, Badge, Card, Alert, Pagination...
    │   └── layout/           #      RootLayout, AdminLayout, LoginLayout, Sidebar, Topbar, ProtectedRoute
    ├── stores/               # [05] Zustand global stores: authStore, tenantStore, uiStore, localeStore
    ├── hooks/                # [06] Custom hooks dùng chung KHÔNG mang state toàn cục
    ├── services/             # [07] apiClient — Cổng kết nối HTTP/REST duy nhất của frontend
    ├── lib/                  # [08] Pure utility functions, không phụ thuộc React
    └── styles/               # [09] globals.css, tokens.css (Design tokens hệ thống)
```

### Quy tắc phụ thuộc bắt buộc:

1. `src/components/Common/` **BẮT BUỘC viết hoa chữ C**. Mọi import phải là `@/components/Common/...`, tuyệt đối không dùng chữ thường `common`.
2. Một feature **KHÔNG ĐƯỢC** import file nội bộ của feature khác — phải thông qua `features/<name>/index.ts` hoặc đưa lên `src/components/Common/`.
3. Mọi request mạng **BẮT BUỘC** đi qua `services/apiClient`. Không gọi `fetch` hay `axios` trực tiếp trong Component/Page.
4. `components`, `stores`, `hooks`, `services`, `lib`, `styles` **KHÔNG BAO GIỜ** phụ thuộc ngược vào `pages` hay `features`.

---

## 4. Hệ Thống Component Dùng Chung (`src/components/Common/`)

### 4.1 Danh sách Common Components có sẵn:

| Component       | Đường dẫn Import                            | Mục đích                                              |
| :-------------- | :------------------------------------------ | :---------------------------------------------------- |
| `Button`        | `@/components/Common/Button/Button`         | Nút bấm: primary, secondary, outline, ghost, danger   |
| `Input`         | `@/components/Common/Input/Input`           | Text input, password, number, search kèm error state  |
| `Select`        | `@/components/Common/Select/Select`         | Dropdown select tùy biến                              |
| `Badge`         | `@/components/Common/Badge/Badge`           | Status badge (success, warning, error, info, neutral) |
| `Card`          | `@/components/Common/Card/Card`             | Container thẻ giao diện chuẩn border & shadow         |
| `DataTable`     | `@/components/Common/DataTable/DataTable`   | Bảng dữ liệu: sort, filter, pagination, empty state   |
| `Modal`         | `@/components/Common/Modal/Modal`           | Dialog modal với overlay và animation mượt mà         |
| `Alert`         | `@/components/Common/Alert/Alert`           | Hộp thông báo trạng thái                              |
| `Pagination`    | `@/components/Common/Pagination/Pagination` | Điều hướng phân trang                                 |
| `ErrorBoundary` | `@/components/Common/ErrorBoundary`         | Bẫy lỗi React ngăn sập giao diện                      |

### 4.2 Nguyên tắc sử dụng:

- **KHÔNG ĐƯỢC** viết raw `<button className="...">` trong Workspace/Admin khi đã có `<Button>`.
- **KHÔNG ĐƯỢC** copy-paste code Common ra ngoài để chỉnh sửa nhẹ. Phải mở rộng thông qua `props`.
- Xem demo trực quan toàn bộ component tại: `http://localhost:2324/components`.

---

## 5. Design System, Tokens & Màu Sắc

Dự án sử dụng **Tailwind CSS v4** kết hợp **CSS Variables** từ `src/styles/tokens.css` và `src/styles/globals.css`.

### 5.1 Bảng Màu Chuẩn (Design Tokens)

#### Workspace & Admin Dashboard (Light Theme — Slate & Emerald/Teal)

```css
/* Brand Colors */
--sc-primary: #0f766e; /* Teal dark - Action chính */
--sc-primary-hover: #0d645d;
--sc-accent: #10b981; /* Emerald - Highlight & Success */
--sc-accent-light: #d1fae5;

/* Neutral Colors */
--sc-bg-primary: #f8fafc; /* Slate-50 - Nền trang chính */
--sc-bg-secondary: #f1f5f9; /* Slate-100 - Nền phụ */
--sc-bg-elevated: #ffffff; /* Nền thẻ Card / Modal */
--sc-border-default: #e2e8f0; /* Slate-200 - Viền mặc định */
--sc-text-primary: #0f172a; /* Slate-900 - Chữ chính */
--sc-text-secondary: #475569; /* Slate-600 - Chữ phụ */

/* Semantic Status */
--sc-success: #0f766e; /* Xanh Teal - Success (Đồng bộ với primary để tránh chói) */
--sc-warning: #f59e0b; /* Vàng cam */
--sc-error: #ef4444; /* Đỏ */
--sc-info: #3b82f6; /* Xanh dương */
```

### 5.2 Quy tắc dùng màu & Typography:

1. **Workspace/Admin:** Tuyệt đối không hardcode mã hex `#00E599` hay `#1A1D21` cũ. Sử dụng class Tailwind hoặc CSS variable `--sc-primary`, `--sc-accent`.
2. **Typography:** Font mặc định toàn app là **Archivo** 400/500/600/700 (`font-sans`), theo `docs/DESIGN_SYSTEM.md`.

---

## 6. Tiêu Chuẩn TypeScript

- Dự án chạy với `strict: true` trong `tsconfig.json`.
- **KHÔNG DÙNG `any`** trong production. Dữ liệu chưa xác định rõ phải dùng `unknown` và validate qua Zod.
- **KHÔNG DÙNG `@ts-ignore`**. Nếu có lỗi từ thư viện ngoài, dùng `@ts-expect-error` kèm ghi chú giải thích rõ ràng.
- Khai báo kiểu Props tường minh cho mọi Component:
  ```tsx
  interface OrderListProps {
    orders: OrderItem[];
    onSelectOrder: (id: string) => void;
    isLoading?: boolean;
  }
  ```
- Dùng `import type { ... }` khi chỉ import Type/Interface để tối ưu Tree-Shaking.

---

## 7. Quản Lý Form & Validation (Zod + React Hook Form)

**BẮT BUỘC** áp dụng `react-hook-form` kết hợp `Zod schema` cho 100% các Form trong dự án:

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/Common/Input/Input';
import { Button } from '@/components/Common/Button/Button';

// 1. Khai báo Schema tại features/[name]/schemas/
export const loginSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
  password: z.string().min(1, 'Nhập mật khẩu'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

// 2. Sử dụng trong Component
export function LoginForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    // Gọi API qua service
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input label="Email" type="email" {...register('email')} error={errors.email?.message} />
      <Input
        label="Mật khẩu"
        type="password"
        {...register('password')}
        error={errors.password?.message}
      />
      <Button type="submit" isLoading={isSubmitting}>
        Đăng nhập
      </Button>
    </form>
  );
}
```

---

## 8. Quản Lý State (Zustand & React State)

1. **Local State:** Dùng `useState`, `useReducer` cho state nội bộ trong 1 component.
2. **Global Shared State:** Dùng **Zustand** đặt trong `src/stores/` (ví dụ `useAuthStore`, `useUiStore`, `useLocaleStore`).
3. **Context API:** Chỉ dùng cho Providers cấp cao như `NextIntlClientProvider` (đa ngữ) hoặc Theme; **không** dùng Context API để quản lý shared state phức tạp.
4. **Server Data Caching:** Quản lý qua service layer và hook chuyên biệt.
5. **Scope changes:** Session/seller/warehouse/role thay đổi phải invalidate dữ liệu và pending
   request liên quan. Cache key gồm actor scope, seller/warehouse resource filter và contract
   version khi cần; không giữ data seller trước rồi render dưới session sau. Selected warehouse
   chỉ là filter UI trong tập server cho phép, không phải authorization grant.

---

## 9. Cổng Mạng & API Client (`src/services/apiClient.ts`)

- Mọi API request phải gọi qua instance `apiClient`.
- `apiClient` gán Bearer Token và xử lý session/refresh theo contract. Seller có hiệu lực lấy từ
  authenticated identity phía server; không thêm `tenantId` header để đổi quyền. Warehouse/seller
  filter của ORCA ops phải được server kiểm tra bằng current assignment/action.
- `401` đi qua refresh flow; refresh unavailable/expired yêu cầu login. `403` giữ session và báo
  không có quyền, không refresh/logout. `409` stale version/state giữ draft và yêu cầu reload;
  payment/debt hold dùng domain error code từ API, không giả thành auth error.
- Mọi API Error response tuân thủ envelope chuẩn:
  ```json
  {
    "success": false,
    "error": {
      "code": "VALIDATION.INVALID_REQUEST",
      "message": "Thông tin đầu vào không hợp lệ",
      "statusCode": 400,
      "details": { "fields": [] }
    },
    "meta": {
      "timestamp": "2026-10-02T00:00:00.000Z",
      "path": "/api/v1/orders",
      "requestId": "req_example"
    }
  }
  ```

---

## 10. Quy Tắc Đặt Tên (Naming Conventions)

### 10.1 File & Thư mục

| Loại              | Chuẩn                              | Ví dụ                                     |
| :---------------- | :--------------------------------- | :---------------------------------------- |
| Component file    | `PascalCase.tsx`                   | `OrderList.tsx`, `ShipmentForm.tsx`       |
| Hook file         | `camelCase.ts` với prefix `use`    | `useOrderList.ts`, `useFetchShipments.ts` |
| Store file        | `camelCase.ts` với suffix `Store`  | `authStore.ts`, `orderStore.ts`           |
| Schema file       | `camelCase.ts` với suffix `Schema` | `orderSchema.ts`, `loginSchema.ts`        |
| Type file         | `camelCase.types.ts`               | `order.types.ts`, `shipment.types.ts`     |
| Utility file      | `camelCase.ts`                     | `formatDate.ts`, `currencyUtils.ts`       |
| Thư mục feature   | viết thường, số nhiều              | `orders/`, `shipments/`, `rules/`         |
| Thư mục Component | `PascalCase/`                      | `Common/Button/`, `Common/Modal/`         |

### 10.2 Variables, Functions & Types

```tsx
// ✅ Constants (bất biến toàn cục): UPPER_SNAKE_CASE
const MAX_RETRY_COUNT = 3;
const API_TIMEOUT_MS = 10_000;

// ✅ TypeScript Interface/Type: PascalCase — KHÔNG prefix 'I'
interface OrderItem {
  id: string;
  status: OrderStatus;
}
// Ví dụ tối giản; type thực tế phải theo phiên bản API contract, không suy từ nhãn UI.
type OrderStatus = 'RECEIVED' | 'DELIVERED' | 'RETURNED';

// ✅ Event handlers: prefix 'handle'
const handleSubmit = () => {};
const handleRowClick = (id: string) => {};
const handleDelete = async (id: string) => {};

// ✅ Boolean props: prefix is / has / can / should
interface TableProps {
  isLoading: boolean;
  hasError: boolean;
  canEdit?: boolean;
  shouldRefetch?: boolean;
}

// ✅ Custom hooks: prefix 'use'
function useOrderList() {}
function useFetchShipments(orderId: string) {}
```

---

## 11. Thứ Tự Import (Import Order)

Mọi file **BẮT BUỘC** sắp xếp import theo 4 nhóm, phân cách bằng 1 dòng trống:

```tsx
// ─── Nhóm 1: React & thư viện external ─────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslations } from 'next-intl';

// ─── Nhóm 2: Common Components ───────────────────────────────────────
import { Button } from '@/components/Common/Button/Button';
import { DataTable } from '@/components/Common/DataTable/DataTable';
import { Modal } from '@/components/Common/Modal/Modal';

// ─── Nhóm 3: Internal (features, stores, services, hooks, lib, types) ─
import { apiClient } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';
import { useOrderList } from '@/features/orders/hooks/useOrderList';
import type { OrderItem } from '@/features/orders/types/order.types';

// ─── Nhóm 4: Local styles / assets ───────────────────────────────────
import './OrdersPage.module.css';
```

---

## 12. Cấu Trúc Bên Trong 1 File Component

Mọi file Component phải tuân theo thứ tự sau (AI không được đảo lộn):

```tsx
// 1. IMPORTS (theo thứ tự 4 nhóm tại Mục 11)
import { useState, useMemo } from 'react';
import { Button } from '@/components/Common/Button/Button';
import type { OrderItem } from '@/features/orders/types/order.types';

// 2. TYPES & INTERFACES
interface OrderListProps {
  orders: OrderItem[];
  isLoading: boolean;
  onSelectOrder: (id: string) => void;
}

// 3. CONSTANTS & STATIC DATA (đặt NGOÀI component để tránh re-create mỗi render)
const EMPTY_LABEL = 'Chưa có đơn hàng nào.';
const STATUS_COLORS: Record<string, string> = {
  pending: 'warning',
  delivered: 'success',
};

// 4. HELPER FUNCTIONS THUẦN (không dùng hook)
function formatOrderCode(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

// 5. COMPONENT FUNCTION (export named — KHÔNG dùng default export cho component)
export function OrderList({ orders, isLoading, onSelectOrder }: OrderListProps) {
  // 5a. Hooks (useState, useEffect, custom hooks — luôn ở đầu)
  const t = useTranslations('Orders');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 5b. Derived state / useMemo / useCallback
  const sortedOrders = useMemo(() => [...orders].sort(...), [orders]);

  // 5c. Event handlers
  const handleRowClick = (id: string) => {
    setSelectedId(id);
    onSelectOrder(id);
  };

  // 5d. JSX return
  return (
    <div>...</div>
  );
}
```

> **Lưu ý:** Dùng **named export** (`export function Foo`) thay cho `export default`. Default export chỉ chấp nhận ở `pages/` để tương thích với `React.lazy()`.

---

## 13. Cấu Trúc Feature Module

Khi tạo tính năng mới, **BẮT BUỘC** tổ chức theo cấu trúc sau:

```text
features/orders/
├── index.ts                  # 🔑 Public API — chỉ export những gì pages/features khác CẦN
├── api/
│   └── orderApi.ts           # Gọi apiClient, khai báo typed response — KHÔNG logic UI
├── components/
│   ├── OrderList.tsx         # Presentational: nhận props, render UI
│   └── OrderForm.tsx         # Form component (react-hook-form + Zod)
├── hooks/
│   └── useOrderList.ts       # Custom hook: kết hợp state, api call, derived data
├── schemas/
│   └── orderSchema.ts        # Zod schema — validate form trước khi gọi API
└── types/
    └── order.types.ts        # TypeScript interface/type cho domain này
```

**`index.ts` chỉ export public API:**

```ts
// features/orders/index.ts
export { OrderList } from './components/OrderList';
export { useOrderList } from './hooks/useOrderList';
export type { OrderItem, OrderStatus } from './types/order.types';
// KHÔNG export api/, schemas/ — đó là nội bộ feature
```

---

## 14. Xử Lý Trạng Thái Loading / Error / Empty

Mọi màn hình có fetch dữ liệu **BẮT BUỘC** xử lý đủ 4 trạng thái:

```tsx
export function OrdersPage() {
  const { orders, isLoading, error, refetch } = useOrderList();

  // 1. Loading State — Skeleton hoặc Spinner
  if (isLoading) {
    return <div className="animate-pulse space-y-3">...</div>;
  }

  // 2. Error State — Alert + nút Retry
  if (error) {
    return (
      <Alert
        type="error"
        message={error.message ?? 'Đã xảy ra lỗi, vui lòng thử lại.'}
        action={<Button onClick={refetch}>Thử lại</Button>}
      />
    );
  }

  // 3. Empty State — Minh họa rõ ràng
  if (orders.length === 0) {
    return (
      <div className="text-center py-20 text-sc-text-secondary">
        <p>Chưa có đơn hàng nào.</p>
      </div>
    );
  }

  // 4. Success State — Render data
  return <DataTable data={orders} columns={columns} />;
}
```

> **Nghiêm cấm:** Render trực tiếp data list mà không xử lý loading và error state trước.

---

## 15. Đa Ngôn Ngữ — i18n (next-intl)

- **BẮT BUỘC** mọi string hiển thị người dùng phải đi qua `useTranslations`.
- **KHÔNG ĐƯỢC** hardcode chuỗi tiếng Việt hoặc tiếng Anh trực tiếp trong JSX.
- Namespace = tên Feature (ví dụ: `'Orders'`, `'Auth'`, `'Shipments'`, `'Common'`).

```tsx
// ✅ Chuẩn
import { useTranslations } from 'next-intl';

export function OrderList() {
  const t = useTranslations('Orders');
  return <h1>{t('title')}</h1>; // "Danh sách đơn hàng"
}

// ❌ KHÔNG làm thế này
return <h1>Danh sách đơn hàng</h1>;
```

**Quy tắc quản lý message key:**

- Thêm key vào cả `messages/vi.json` và `messages/en.json` trước khi dùng.
- Key dạng `camelCase`: `title`, `emptyState`, `errorMessage`, `confirmDelete`.
- Nhóm key theo namespace (object lồng nhau):
  ```json
  // messages/vi.json
  {
    "Orders": {
      "title": "Danh sách đơn hàng",
      "emptyState": "Chưa có đơn hàng nào",
      "confirmDelete": "Xác nhận xóa đơn hàng này?"
    }
  }
  ```

---

## 16. Accessibility — a11y Tối Thiểu

Senior FE **BẮT BUỘC** đảm bảo các điểm a11y tối thiểu (WCAG 2.1 Level AA):

```tsx
// ✅ img luôn có alt
<img src={logo} alt="SmartChain logo" />
<img src={decoration} alt="" aria-hidden="true" /> {/* Ảnh trang trí: alt="" */}

// ✅ Icon-only button phải có aria-label
<button aria-label="Xóa đơn hàng" onClick={handleDelete}>
  <TrashIcon />
</button>

// ✅ Form field liên kết với label
<label htmlFor="email">Email</label>
<input id="email" type="email" />

// ✅ Interactive element phải dùng được bằng bàn phím
// Dùng <button> hoặc <a href> thay cho <div onClick>

// ❌ KHÔNG làm thế này
<div onClick={handleClick} className="cursor-pointer">Click me</div>

// ✅ Làm thế này
<button type="button" onClick={handleClick}>Click me</button>

// ✅ Bảng dữ liệu có aria-label
<table aria-label="Danh sách đơn hàng">
  <thead>...</thead>
</table>
```

---

## 17. Definition of Done (DoD)

Một tính năng hoặc thay đổi code chỉ được xem là hoàn tất khi:

- [ ] Đúng 100% yêu cầu người dùng, không thừa/thiếu code ngoài phạm vi.
- [ ] Mapping UC/BR theo ORCA mới; không trộn số FE/UC SmartChain cũ với WBS mới.
- [ ] Guard role/action/resource/scope; direct URL và action ngoài quyền bị chặn; field privacy ở DTO/API được kiểm tra.
- [ ] Tái sử dụng tối đa component trong `src/components/Common/`.
- [ ] Import thư mục Common chuẩn xác: `@/components/Common/...` (viết hoa C).
- [ ] Import order đúng 4 nhóm theo Mục 11.
- [ ] Đặt tên file, biến, hàm, type đúng quy tắc theo Mục 10.
- [ ] Feature mới có cấu trúc đúng theo Mục 13 (`api/`, `components/`, `hooks/`, `schemas/`, `types/`).
- [ ] Màn hình có fetch data xử lý đủ 4 trạng thái: Loading, Error, Empty, Success (Mục 14).
- [ ] Form có đầy đủ Zod Schema Validation và thông báo lỗi tiếng Việt thân thiện.
- [ ] Mọi string hiển thị người dùng đi qua `useTranslations` (Mục 15).
- [ ] Đảm bảo a11y tối thiểu: alt, aria-label, keyboard navigation (Mục 16).
- [ ] `npx tsc --noEmit` vượt qua với **0 errors**.
- [ ] `npm run lint` không có cảnh báo/lỗi nghiêm trọng.
- [ ] Giao diện responsive mượt mà trên cả Mobile và Desktop.
- [ ] Không còn `console.log`, dead code, hoặc code bị comment tạm bợ.

## 18. Các flow ORCA cần tuân thủ

### 18.1 Policy và portal

- Bảy role và hai scope theo `docs/RBAC_UI_SCOPE.md`. `src/lib/accessPolicy.ts` là nguồn policy
  UI duy nhất cho route/sidebar/search/action. Role legacy hoặc scope thiếu không grant quyền.
- Seller portal cho Owner/Staff; warehouse portal cho nhiệm vụ kho; ops portal cho Admin/Ops/
  Manager/Accountant theo quyền. Multi-role chỉ union trong một actor scope; không dùng `roles[0]`
  làm quyền hoặc hiển thị toàn bộ danh tính.
- Screen `R/W/A` không đồng nghĩa tất cả actions được phép. Warehouse Staff không render/store
  COD, order value, invoice, API secret; Seller Staff không render financial/export fields.
  Hiding column không thay server projection. API trả field nhạy cảm ngoài scope là backend gap.
- Seller không quản lý ORCA kho/carrier/routing. ASN và withdrawal cho phép chọn kho hợp lệ;
  normal sales order không có warehouse/carrier selector như BYOA cũ.

### 18.2 Draft approval và trạng thái bất đồng bộ

- Standard agreement ghi acceptance version rồi đi payment; không yêu cầu Admin approval.
  Custom contract hiển thị waiting confirmation. Email verified không hiển thị service ACTIVE.
- `202 Accepted` hiển thị processing reference, không báo allocated/dispatch thành công. Job state
  lấy từ server; BACKORDER và COD ON_HOLD có explanation, không giả reservation đã giữ.
- Import SKU/order có per-row result, stable source reference và retry không duplicate. Export
  escape spreadsheet formula và field allowlist; file/label URL cũng phải scoped authorization.
- Form mutable gửi version/current-state theo contract; stale conflict giữ input và hiển thị
  refresh path. Disable button giảm double click nhưng durable idempotency nằm ở API.

### 18.3 Warehouse scan và physical tasks

- Scan focus/keyboard, bin/SKU/lot/remaining qty có feedback tại input. NFR-17 p95 < 300 ms là
  target phải đo trên device đã ghi; không suy UI mượt là đã đạt.
- Chỉ server-confirmed scan mới đổi displayed authoritative stock/task. Timeout hiển thị unknown
  và query cùng operation reference; không auto-resubmit với reference mới.
- ASN declared ≠ received ≠ sellable. Count UI blind không tải/ẩn bằng CSS expected qty.
  Lot substitution, count adjustment và disposal có actor approval/evidence riêng.
- PACKED cần verified contents và actual measurements; label retry phải giữ LABEL_VERIFYING
  khi chưa biết carrier outcome. Cancel/return chưa physically confirmed không tăng stock UI.

### 18.4 Finance và optional assistance

- Seller freight, carrier cost và actual reconciled fee là field khác nhau. Seller không thấy
  purchase margin; warehouse staff không thấy money. VND dùng decimal string/formatting, không
  tính chia COD hoặc tiền ledger bằng floating point ở UI.
- ReturnUrl chỉ hiển thị trạng thái đang xác minh/payment result từ API; không set PAID/ACTIVE
  local hoặc gọi endpoint tự credit. Deposit tách operating balance; không UI wallet nạp/rút.
- Payout statement review/dispute theo line và deadline; approved transfer chưa là PAID. Invoice
  issued/manifest signed không có form chỉnh amounts/membership; corrections là flow riêng.
- Optional AI suggestion có nguồn/model/confidence và PENDING state; human acceptance gọi normal
  action có permission/validation. AI/n8n off vẫn dùng baseline; assistant read-only không
  available cho Guest, Seller Staff hoặc Warehouse Staff.
- Baseline locale demonstration là English theo SRS; vẫn giữ vi/en resources và Vietnamese
  diacritics, không hardcode tiếng Anh mới trong JSX. Font/tokens hiện hành theo Design System.

Với đợt chỉ sửa Markdown, kiểm tra format và `git diff --check`; không cần chạy lại runtime
tests chỉ để xác nhận thay đổi văn bản. Khi sửa code, chạy đầy đủ quality gate của `AGENTS.md`.
