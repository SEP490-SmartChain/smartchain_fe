export type StaffAccountStatus = 'ACTIVE' | 'LOCKED' | 'PENDING';
export type StaffRole = 'SELLER_OWNER' | 'SELLER_STAFF';

export interface StaffAccount {
  userId: string;
  fullName: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
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
