export type TenantStatus = 'ACTIVE' | 'SUSPENDED';

export type SuspensionReason = 'PAYMENT_DEFAULT' | 'CONTRACT_VIOLATION' | 'ADMIN_REQUEST';

export interface TenantSubscriptionSummary {
  planCode: string | null;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface TenantQuota {
  ordersUsed: number;
  ordersTotal: number;
  apiCallsUsed: number;
  apiCallsTotal: number;
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  adminEmail: string | null;
  subscription: TenantSubscriptionSummary;
  quota: TenantQuota;
  createdAt: string;
  updatedAt: string;
}

export interface TenantSuspensionInfo {
  suspendedAt: string;
  suspendedBy: string;
  reason: string;
  internalNote: string | null;
}

export interface TenantRestorationInfo {
  unsuspendedAt: string;
  unsuspendedBy: string;
  reason: string;
}

export interface TenantAggregates {
  activeWarehouseCount: number;
  currentMonthOrderCount: number;
  connectedCarrierCount: number;
}

export interface TenantDetail extends TenantSummary {
  phone: string | null;
  taxId: string | null;
  suspension: TenantSuspensionInfo | null;
  restoration: TenantRestorationInfo | null;
  aggregates: TenantAggregates;
}

export interface TenantListQuery {
  search?: string;
  status?: TenantStatus | '';
  cursor?: string;
  limit?: number;
  registeredFrom?: string;
  registeredTo?: string;
}

export interface TenantPagination {
  limit: number;
  hasNext: boolean;
  nextCursor: string | null;
}

export interface TenantListPage {
  items: TenantSummary[];
  pagination: TenantPagination;
}

export interface UpdateTenantStatusPayload {
  status: TenantStatus;
  reason: string;
  internalNote?: string;
}

export interface SystemHealthComponent {
  status: 'UP' | 'DOWN';
  latencyMs: number;
}

export interface SystemHealthStats {
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  database: SystemHealthComponent;
  uptimeSeconds: number;
  checkedAt: string;
}

export interface TenantStats {
  total: number;
  active: number;
  suspended: number;
  newLast7Days: number;
  newLast30Days: number;
}

export interface UserStats {
  totalUsers: number | null;
  status?: 'AVAILABLE' | 'UNAVAILABLE';
}

export interface CarrierStats {
  totalCarriers: number;
  activeCarriers: number;
  activeEndpointsCount: number;
  activeServicesCount: number;
  totalConnectedTenants: number | null;
  status?: 'AVAILABLE' | 'UNAVAILABLE';
  errorRatePercentage?: number;
}

export interface RecentTenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
}

export interface SystemDashboardOverview {
  tenants: TenantStats;
  users: UserStats;
  carriers: CarrierStats;
  health: SystemHealthStats;
  recentTenants: RecentTenant[];
}
