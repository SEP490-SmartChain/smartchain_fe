import React, { Suspense } from 'react';

import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';

import { NextIntlClientProvider } from 'next-intl';
import ReactDOM from 'react-dom/client';

import ErrorBoundary from '@/components/common/ErrorBoundary';
import AdminLayout from '@/components/layout/AdminLayout';
import LoginLayout from '@/components/layout/LoginLayout';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import RootLayout from '@/components/layout/RootLayout';
import { useAppStore } from '@/hooks/useAppStore';
import HomePage from '@/pages/HomePage';
import LoginPage from '@/pages/LoginPage';
import NotFoundPage from '@/pages/NotFoundPage';

import enMessages from '../messages/en.json';
import viMessages from '../messages/vi.json';

// Lazy loaded admin pages
const DashboardPage = React.lazy(() => import('@/pages/admin/DashboardPage'));
const CustomersPage = React.lazy(() => import('@/pages/admin/CustomersPage'));
const MessagesPage = React.lazy(() => import('@/pages/admin/MessagesPage'));
const SettingsPage = React.lazy(() => import('@/pages/admin/SettingsPage'));
const HelpPage = React.lazy(() => import('@/pages/admin/HelpPage'));
const AnalyticsPage = React.lazy(() => import('@/pages/admin/AnalyticsPage'));

// Layouts
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

function App() {
  const { locale } = useAppStore();
  const messages = locale === 'vi' ? viMessages : enMessages;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <BrowserRouter>
        <ErrorBoundary>
          <RootLayout>
            <Suspense fallback={<PageLoader />}>
              <Routes>
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

                <Route element={<ProtectedRoute />}>
                  <Route
                    element={
                      <AdminLayout>
                        <RouteOutlet />
                      </AdminLayout>
                    }
                  >
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/customers" element={<CustomersPage />} />
                    <Route path="/messages" element={<MessagesPage />} />
                    <Route path="/setting" element={<SettingsPage />} />
                    <Route path="/help" element={<HelpPage />} />
                    <Route path="/analytics" element={<AnalyticsPage />} />
                  </Route>
                </Route>

                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </RootLayout>
        </ErrorBoundary>
      </BrowserRouter>
    </NextIntlClientProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
