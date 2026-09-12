/**
 * Public API của feature `tenants`.
 *
 * Feature khác CHỈ được import qua file này — không với tay vào file nội bộ.
 * (FE dependency rule #2, SDD mục 1.2.1)
 */
export { StaffAccountDirectory } from './components/StaffAccountDirectory';
export { useStaffAccounts } from './hooks/useStaffAccounts';
export type {
  StaffAccount,
  StaffAccountFilters,
  StaffAccountStatus,
  StaffRole,
} from './types/staffAccount.types';
