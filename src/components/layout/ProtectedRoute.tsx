import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '@/stores/authStore';

export default function ProtectedRoute({ requiredRole }: { requiredRole?: string }) {
  const { user, status } = useAuthStore();
  const location = useLocation();
  if (status === 'initializing' || status === 'error') return null;
  if (!user) {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search + location.hash }}
        replace
      />
    );
  }
  if (requiredRole && !user.roles.includes(requiredRole)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
