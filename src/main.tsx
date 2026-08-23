import React, { Suspense } from 'react';

import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';

import ReactDOM from 'react-dom/client';

import ErrorBoundary from '@/components/common/ErrorBoundary';
import AdminLayout from '@/components/layout/AdminLayout';
import LoginLayout from '@/components/layout/LoginLayout';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import RootLayout from '@/components/layout/RootLayout';

import HomePage from '@/pages/public/HomePage';
import LoginPage from '@/pages/public/LoginPage';
import NotFoundPage from '@/pages/public/NotFoundPage';

// Tenant workspace — lazy load để tách bundle theo route.
const DashboardPage = React.lazy(() => import('@/pages/workspace/DashboardPage'));
const OrdersPage = React.lazy(() => import('@/pages/workspace/OrdersPage'));
const InventoryPage = React.lazy(() => import('@/pages/workspace/InventoryPage'));
const RulesPage = React.lazy(() => import('@/pages/workspace/RulesPage'));
const ShipmentsPage = React.lazy(() => import('@/pages/workspace/ShipmentsPage'));
const ReconciliationPage = React.lazy(
  () => import('@/pages/workspace/ReconciliationPage'),
);
const AnalyticsPage = React.lazy(() => import('@/pages/workspace/AnalyticsPage'));
const SettingsPage = React.lazy(() => import('@/pages/workspace/SettingsPage'));

// Super Admin console
const TenantsPage = React.lazy(() => import('@/pages/admin/TenantsPage'));
const CarrierCatalogPage = React.lazy(() => import('@/pages/admin/CarrierCatalogPage'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-gray-400 text-sm">Đang tải...</div>
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
      <ErrorBoundary>
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
              </Route>

              {/* --- tenant workspace + super admin (cần đăng nhập) --- */}
              <Route element={<ProtectedRoute />}>
                <Route
                  element={
                    <AdminLayout>
                      <RouteOutlet />
                    </AdminLayout>
                  }
                >
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/orders" element={<OrdersPage />} />
                  <Route path="/inventory" element={<InventoryPage />} />
                  <Route path="/rules" element={<RulesPage />} />
                  <Route path="/shipments" element={<ShipmentsPage />} />
                  <Route path="/reconciliation" element={<ReconciliationPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />

                  <Route path="/admin/tenants" element={<TenantsPage />} />
                  <Route path="/admin/carriers" element={<CarrierCatalogPage />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </RootLayout>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
