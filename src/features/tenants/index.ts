/**
 * Public API của feature `tenants`.
 *
 * Feature khác CHỈ được import qua file này — không với tay vào file nội bộ.
 * (FE dependency rule #2, SDD mục 1.2.1)
 */
export { StaffAccountDirectory } from './components/StaffAccountDirectory';
export { TenantDirectory } from './components/TenantDirectory';
export { PlatformDashboardOverview } from './components/PlatformDashboardOverview';
export { PlatformHealthView } from './components/PlatformHealthView';
export { PlatformMonitoringDashboard } from './components/PlatformMonitoringDashboard';
export { useStaffAccounts } from './hooks/useStaffAccounts';
export { useTenantManagement } from './hooks/useTenantManagement';
export type {
  StaffAccount,
  StaffAccountFilters,
  StaffAccountStatus,
  StaffRole,
} from './types/staffAccount.types';
export type {
  TenantSummary,
  TenantDetail,
  TenantStatus,
  TenantListQuery,
  SystemDashboardOverview,
} from './types/tenant.types';

