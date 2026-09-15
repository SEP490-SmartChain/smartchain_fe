export type StaffAccountStatus = 'ACTIVE' | 'LOCKED';
export type StaffRole = 'TENANT_ADMIN' | 'DISPATCHER' | 'ACCOUNTANT';

export interface StaffAccount {
  userId: string;
  fullName: string;
  email: string;
  roles: StaffRole[];
  lastSessionAt: string | null;
  status: StaffAccountStatus;
}

export interface StaffAccountFilters {
  search: string;
  role: '' | StaffRole;
  status: '' | StaffAccountStatus;
}

export interface StaffAccountPage {
  items: StaffAccount[];
  pagination: {
    limit: number;
    hasNext: boolean;
    nextCursor: string | null;
  };
}
