import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { can, getEffectiveRoles, isRouteAllowed, type OrcaRole } from '@/lib/accessPolicy';
import { useAuthStore } from '@/stores/authStore';

export interface ProtectedRouteProps {
  /** Yêu cầu role ORCA cụ thể (ngoài route matrix). */
  requiredRole?: OrcaRole;
  /** Yêu cầu capability cụ thể (ngoài route matrix). */
  requiredCapability?: string;
  /** Bật kiểm tra route matrix cho URL hiện tại. */
  enforceRoutePolicy?: boolean;
}

/**
 * Guard đăng nhập + guard theo role/capability (mục 9).
 * - Chưa xác thực → `/login` (giữ đích `from`).
 * - Đã xác thực nhưng thiếu quyền → `/403` (KHÔNG đăng xuất, không vòng redirect).
 */
export default function ProtectedRoute({
  requiredRole,
  requiredCapability,
  enforceRoutePolicy,
}: ProtectedRouteProps) {
  const { user, status } = useAuthStore();
  const location = useLocation();

  if (status === 'initializing') return null;

  if (!user) {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search + location.hash }}
        replace
      />
    );
  }

  const roles = getEffectiveRoles(user.roles, user.actorScope);
  const denied =
    (requiredRole !== undefined && !roles.includes(requiredRole)) ||
    (requiredCapability !== undefined && !can(roles, requiredCapability)) ||
    (enforceRoutePolicy === true && !isRouteAllowed(roles, location.pathname, import.meta.env.DEV));

  if (denied) {
    return <Navigate to="/403" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
