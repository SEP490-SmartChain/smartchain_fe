import { create } from 'zustand';

import type { ActorScope } from '@/lib/accessPolicy';
import { getAuthScopeKey } from '@/lib/authScope';

import { useTenantStore } from './tenantStore';

export interface AuthUser {
  userId: string;
  tenantId: string | null;
  email: string;
  fullName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  /**
   * Phạm vi actor ORCA do server trả (bắt buộc theo contract §1/§5). Thiếu giá
   * trị này ⇒ policy fail-closed (không role hiệu lực). Do client KHÔNG tự suy.
   */
  actorScope?: ActorScope | null;
  roles: string[];
  permissions: string[];
  /** Current assignments from the server profile; selected filters never grant access. */
  warehouseIds?: readonly string[];
  /** Server-owned service state, refreshed independently of role permissions. */
  serviceStatus?: 'PENDING_ACTIVATION' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED' | null;
}

export interface AuthSession {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  expiresAt: number;
  revision: number;
  status: 'initializing' | 'authenticated' | 'anonymous';
  setSession: (session: AuthSession) => void;
  setUser: (user: AuthUser) => void;
  clear: () => void;
}

function syncTenant(user: AuthUser | null) {
  useTenantStore.getState().setActiveTenantId(user?.tenantId ?? null);
  useTenantStore.getState().setPermissions(user?.permissions ?? []);
}

/** Access tokens stay in memory; the server owns the HttpOnly refresh cookie. */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  expiresAt: 0,
  revision: 0,
  status: 'initializing',
  setSession: ({ user, accessToken, expiresIn }) => {
    syncTenant(user);
    set((state) => ({
      user,
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
      status: 'authenticated',
      revision: state.revision + (getAuthScopeKey(state.user) === getAuthScopeKey(user) ? 0 : 1),
    }));
  },
  setUser: (user) => {
    syncTenant(user);
    set((state) => ({
      user,
      revision: state.revision + (getAuthScopeKey(state.user) === getAuthScopeKey(user) ? 0 : 1),
    }));
  },
  clear: () => {
    syncTenant(null);
    set((state) => ({
      user: null,
      accessToken: null,
      expiresAt: 0,
      status: 'anonymous',
      revision: state.revision + 1,
    }));
  },
}));
