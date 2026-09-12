import { create } from 'zustand';

interface TenantState {
  /** Tenant đang làm việc. Super Admin có thể đổi qua lại. */
  activeTenantId: string | null;
  setActiveTenantId: (tenantId: string | null) => void;

  /** Quyền RBAC từ profile do API xác thực. */
  permissions: string[];
  setPermissions: (permissions: string[]) => void;
  can: (permission: string) => boolean;
}

export const useTenantStore = create<TenantState>((set, get) => ({
  activeTenantId: null,
  setActiveTenantId: (activeTenantId) => set({ activeTenantId }),

  permissions: [],
  setPermissions: (permissions) => set({ permissions }),
  can: (permission) => get().permissions.includes(permission),
}));
