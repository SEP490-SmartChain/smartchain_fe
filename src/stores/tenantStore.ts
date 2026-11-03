import { create } from 'zustand';

interface TenantState {
  /** Tenant đang làm việc. Super Admin có thể đổi qua lại. */
  activeTenantId: string | null;
  setActiveTenantId: (tenantId: string | null) => void;

  /**
   * Quyền RBAC thô từ profile do API xác thực. CHỈ là dữ liệu phiên.
   *
   * KHÔNG dùng để cấp quyền UI: nguồn quyết định duy nhất là
   * `src/lib/accessPolicy.ts` (`can`/`isRouteAllowed`/`getVisibleNavGroups`).
   * Hàm `can(permission)` trước đây đã bị xoá để không thể union ngầm hai nguồn.
   */
  permissions: string[];
  setPermissions: (permissions: string[]) => void;
}

export const useTenantStore = create<TenantState>((set) => ({
  activeTenantId: null,
  setActiveTenantId: (activeTenantId) => set({ activeTenantId }),

  permissions: [],
  setPermissions: (permissions) => set({ permissions }),
}));
