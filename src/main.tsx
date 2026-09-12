import React, { Suspense } from 'react';

import { BrowserRouter, Navigate, Routes, Route, Outlet } from 'react-router-dom';

import ReactDOM from 'react-dom/client';

import '@fontsource/archivo/400.css';
import '@fontsource/archivo/500.css';
import '@fontsource/archivo/600.css';
import '@fontsource/archivo/700.css';

import AdminLayout from '@/components/layout/AdminLayout';
import LoginLayout from '@/components/layout/LoginLayout';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import RootLayout from '@/components/layout/RootLayout';
import HomePage from '@/pages/public/HomePage';
import LoginPage from '@/pages/public/LoginPage';
import NotFoundPage from '@/pages/public/NotFoundPage';
import RegisterPage from '@/pages/public/RegisterPage';

const ForgotPasswordPage = React.lazy(() => import('@/pages/public/ForgotPasswordPage'));
const OtpPage = React.lazy(() => import('@/pages/public/OtpPage'));
const ForbiddenPage = React.lazy(() => import('@/pages/public/ForbiddenPage'));

// Tenant workspace — lazy load để tách bundle theo route.
const DashboardPage = React.lazy(() => import('@/pages/workspace/DashboardPage'));
const OrdersPage = React.lazy(() => import('@/pages/workspace/OrdersPage'));
const InventoryPage = React.lazy(() => import('@/pages/workspace/InventoryPage'));
const RulesPage = React.lazy(() => import('@/pages/workspace/RulesPage'));
const ShipmentsPage = React.lazy(() => import('@/pages/workspace/ShipmentsPage'));
const ReconciliationPage = React.lazy(() => import('@/pages/workspace/ReconciliationPage'));
const AnalyticsPage = React.lazy(() => import('@/pages/workspace/AnalyticsPage'));
const SettingsPage = React.lazy(() => import('@/pages/workspace/SettingsPage'));
const BillingPage = React.lazy(() => import('@/pages/workspace/BillingPage'));
const StaffAccountsPage = React.lazy(() => import('@/pages/workspace/StaffAccountsPage'));
const RolesPermissionsPage = React.lazy(() => import('@/pages/workspace/RolesPermissionsPage'));
const WorkspaceAuditPage = React.lazy(() => import('@/pages/workspace/AuditPage'));
const IntegrationErrorsPage = React.lazy(() => import('@/pages/workspace/IntegrationErrorsPage'));
const ButtonsPage = React.lazy(() => import('@/pages/components/ButtonsPage'));
const DataDisplayPage = React.lazy(() => import('@/pages/components/DataDisplayPage'));
const DataTablePage = React.lazy(() => import('@/pages/components/DataTablePage'));
const DropzonePage = React.lazy(() => import('@/pages/components/DropzonePage'));

// Super Admin console
const TenantsPage = React.lazy(() => import('@/pages/admin/TenantsPage'));
const CarrierCatalogPage = React.lazy(() => import('@/pages/admin/CarrierCatalogPage'));
const PlansPage = React.lazy(() => import('@/pages/admin/PlansPage'));
const HealthPage = React.lazy(() => import('@/pages/admin/HealthPage'));
const AdminAuditPage = React.lazy(() => import('@/pages/admin/AuditPage'));
const ApiTrafficPage = React.lazy(() => import('@/pages/admin/ApiTrafficPage'));
const ObservabilityPage = React.lazy(() => import('@/pages/admin/ObservabilityPage'));
const AdminWebhooksPage = React.lazy(() => import('@/pages/admin/WebhooksPage'));
const QuotasPage = React.lazy(() => import('@/pages/admin/QuotasPage'));

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="text-sm text-[var(--sc-text-tertiary)]">Đang tải...</div>
    </div>
  );
}

function RouteOutlet() {
  return <Outlet />;
}

/**
 * Composition root của SPA (FE package diagram — "Application Entry").
 * Lắp ráp router, guard, layout gốc và error boundary. Provider đa ngữ nằm
 * trong RootLayout. Không chứa logic nghiệp vụ.
 */
function App() {
  return (
    <BrowserRouter>
      <RootLayout>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* --- public --- */}
            <Route path="/" element={<HomePage />} />
            <Route
              element={
                <LoginLayout>
                  <RouteOutlet />
                </LoginLayout>
              }
            >
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/otp" element={<OtpPage />} />
            </Route>

            {/* --- đã đăng nhập (chung app shell) --- */}
            <Route element={<ProtectedRoute />}>
              <Route
                element={
                  <AdminLayout>
                    <RouteOutlet />
                  </AdminLayout>
                }
              >
                {/* Trang 403 + redirect helper nằm ngoài route matrix. */}
                <Route path="/403" element={<ForbiddenPage />} />
                <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
                <Route
                  path="/roles-permissions"
                  element={<Navigate to="/roles-permissions/roles" replace />}
                />
                {import.meta.env.DEV && (
                  <Route
                    path="/components"
                    element={<Navigate to="/components/data-table" replace />}
                  />
                )}

                {/* Route matrix guard (mục 6). */}
                <Route element={<ProtectedRoute enforceRoutePolicy />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/billing" element={<BillingPage />} />
                  <Route path="/orders" element={<OrdersPage />} />
                  <Route path="/inventory" element={<InventoryPage />} />
                  <Route path="/rules" element={<RulesPage />} />
                  <Route path="/shipments" element={<ShipmentsPage />} />
                  <Route path="/reconciliation" element={<ReconciliationPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/settings/:tab" element={<SettingsPage />} />
                  <Route path="/iam/users" element={<StaffAccountsPage />} />
                  <Route path="/roles-permissions/:tab" element={<RolesPermissionsPage />} />
                  <Route path="/audit" element={<WorkspaceAuditPage />} />
                  <Route path="/integration-errors" element={<IntegrationErrorsPage />} />

                  {import.meta.env.DEV && (
                    <>
                      <Route path="/components/data-table" element={<DataTablePage />} />
                      <Route path="/components/buttons" element={<ButtonsPage />} />
                      <Route path="/components/dropzone" element={<DropzonePage />} />
                      <Route path="/components/data-display" element={<DataDisplayPage />} />
                    </>
                  )}

                  <Route path="/admin/tenants" element={<TenantsPage />} />
                  <Route path="/admin/carriers" element={<CarrierCatalogPage />} />
                  <Route path="/admin/plans" element={<PlansPage />} />
                  <Route path="/admin/health" element={<HealthPage />} />
                  <Route path="/admin/audit" element={<AdminAuditPage />} />
                  <Route path="/admin/api-traffic" element={<ApiTrafficPage />} />
                  <Route path="/admin/observability" element={<ObservabilityPage />} />
                  <Route path="/admin/webhooks" element={<AdminWebhooksPage />} />
                  <Route path="/admin/quotas" element={<QuotasPage />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </RootLayout>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
