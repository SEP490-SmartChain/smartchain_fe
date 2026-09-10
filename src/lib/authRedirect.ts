import type { AuthUser } from '@/stores/authStore';

export function getPostLoginPath(user: AuthUser, state: unknown): string {
  const isAdmin = user.roles.includes('SUPER_ADMIN');
  const fallback = isAdmin ? '/admin/tenants' : '/dashboard';
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
  const allowedPaths = [
    '/dashboard',
    '/orders',
    '/inventory',
    '/rules',
    '/shipments',
    '/reconciliation',
    '/analytics',
    '/settings',
  ];
  if (isAdmin) allowedPaths.push('/admin/tenants', '/admin/carriers');
  return allowedPaths.includes(pathname) ? path : fallback;
}
