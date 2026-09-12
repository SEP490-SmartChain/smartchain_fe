import { getDefaultPath, getEffectiveRoles, isRouteAllowed } from '@/lib/accessPolicy';
import type { AuthUser } from '@/stores/authStore';

/**
 * Xác định đường dẫn sau đăng nhập (mục 4.8). Chỉ chấp nhận đích nội bộ an toàn
 * và nằm trong route mà vai trò được truy cập; ngoài ra trả về route mặc định.
 */
export function getPostLoginPath(user: AuthUser, state: unknown): string {
  const roles = getEffectiveRoles(user.roles);
  const fallback = getDefaultPath(roles);
  if (!state || typeof state !== 'object' || !('from' in state)) return fallback;

  const path = state.from;
  if (
    typeof path !== 'string' ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    /[\\\s]/.test(path)
  ) {
    return fallback;
  }

  const pathname = path.split(/[?#]/)[0];
  if (!isRouteAllowed(roles, pathname)) return fallback;
  return path;
}
