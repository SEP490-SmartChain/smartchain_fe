# SmartChain — Frontend

React 19 + Vite SPA cho SmartChain — Automated Logistics Orchestration System.
Cấu trúc thư mục ánh xạ 1-1 với **FE Package Diagram (Figure 2)**, Report 4 – SDD mục 1.2.1.
Chi tiết quy ước xem `convention.md`.

## 📂 Directory Structure

Feature-Sliced Design. Mỗi thư mục dưới đây là một package trong Package Diagram.

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

## 📐 Best Practices & Conventions

### 1. Rendering Rules & Routing (React SPA)
- **Client-Side Rendering (CSR):** The entire application is a React SPA powered by Vite. Avoid synchronous data fetching that blocks UI rendering.
- **Lazy Loading:** Use `React.lazy()` and `Suspense` for all pages in `src/pages/` to optimize code splitting and load times.

### 2. Routing & Authentication
- **React Router:** All routes are centrally configured in `src/main.tsx`.
- **Auth Guards:** Route protection and redirects are handled purely on the client side via the `<ProtectedRoute>` component.
- **Internationalization (i18n):** Uses the `next-intl` library (which provides a robust client-side API fully compatible with Vite SPA) initialized via `NextIntlClientProvider`. Translations are stored in the `messages/` directory.

### 3. State & Form Management
- **Validation:** ANY Form must have its Schema defined using **Zod** before building the UI. Store Schema files at `src/features/[name]/schemas/`.
- **Form Management:** Always use `useForm` (from `react-hook-form`) combined with `@hookform/resolvers/zod`. DO NOT manually create state (`useState`) for individual form inputs.

### 3. Naming Conventions
- **Feature Folders:** lowercase, plural (e.g., `customers`, `orders`, `products`).
- **Component Files:** PascalCase (e.g., `CustomersTable.tsx`, `CustomerForm.tsx`).
- **Hook Files:** camelCase, starting with "use" (e.g., `usePagination.ts`).
- **Variables/Functions:** camelCase (e.g., `fetchCustomers`, `handleSubmit`).
- **Interfaces/Types:** PascalCase (e.g., `Customer`, `UserRole`).

### 4. Code UI & CSS
- **Tailwind CSS:** Default to Tailwind v4 for all styling. Avoid writing raw CSS unless necessary for complex animations or global variables.
- **UI Reusability:** If a piece of UI (like a button, badge, or search bar) appears in 2 or more places, it MUST be extracted into a reusable Component within `src/components/common/`.
- **Global CSS Variables:** Manage themes (light/dark, primary colors) using CSS variables in `src/styles/globals.css`. Use the `cn()` utility function (clsx + tailwind-merge) to safely merge Tailwind classes.

### 5. Workflow for Developing a New Feature
When assigned to build a new page (e.g., **Products List**), follow this exact sequence:

1. **Step 1:** Create the domain directory `src/features/products/`.
2. **Step 2:** Define data structures in `src/features/products/schemas/productSchema.ts` (Zod schema, interfaces).
3. **Step 3:** Create the UI Component `src/features/products/components/ProductsTable.tsx` to render the table.
4. **Step 4:** Create the Page Component `src/pages/workspace/ProductsPage.tsx` to fetch data from the API and pass it into `<ProductsTable />`.
5. **Step 5:** Add the new route with `React.lazy()` inside `src/main.tsx`.
6. **Step 6:** (Optional) Write API functions inside `src/features/products/api/`.

## 🚀 Getting Started

```bash
# Install dependencies
yarn install

# Run development server
yarn dev

# Build for production & start
yarn build && yarn start
```

## 🛠️ Built With
- Vite & React (SPA)
- Tailwind CSS v4
- TypeScript
- React Router DOM
- Zustand (State Management)
- Zod & React Hook Form
- i18n Support (via next-intl client API)
