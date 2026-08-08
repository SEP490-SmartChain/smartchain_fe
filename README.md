# React SPA Base

This project provides a clean, production-ready, and highly scalable foundation for our Vite React SPA Web Admin application, applying the Feature-Sliced Design (FSD) model to ensure the source code is easy to read, maintain, and scale.

## 📂 Directory Structure

The project applies **Feature-Sliced Design (FSD)**. New features MUST NOT be crammed into `src/components`. They must be separated by Domain/Feature.

```text
src/
├── components/           # Shared UI Components
│   ├── common/           # Complex & basic components (DataTable, Modal, Button)
│   └── layout/           # Layout components (Sidebar, Topbar)
├── features/             # Core Domain logic
│   └── [feature_name]/   # E.g., customers, orders, products...
│       ├── api/          # API calls for this feature
│       ├── components/   # UI Components specific to this feature
│       └── schemas/      # TypeScript Interfaces & Zod Schemas
├── hooks/                # Global custom hooks (useAppStore, useAuth...)
├── pages/                # Page Components loaded by React Router
│   ├── admin/            # Internal pages (auth required)
│   └── LoginPage.tsx     # Public pages
├── services/             # Global services (apiClient.ts)
├── styles/               # Global CSS (Tailwind)
└── main.tsx              # Entry point and Routing configuration
```

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
- **Hook Files:** camelCase, starting with "use" (e.g., `useAppStore.ts`).
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
4. **Step 4:** Create the Page Component `src/pages/admin/ProductsPage.tsx` to fetch data from the API and pass it into `<ProductsTable />`.
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
