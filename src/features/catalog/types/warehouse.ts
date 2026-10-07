export type WarehouseStatus = 'ACTIVE' | 'INACTIVE';

export interface Warehouse {
  id: string;
  version: number;
  region: 'NORTH' | 'CENTRAL' | 'SOUTH';
  timeZone: string;
  cutoffMinute: number;
  operatingStartMinute: number;
  operatingEndMinute: number;

  tenantId: string | null;
  code: string;
  name: string;
  address: string;
  provinceCode: string;
  districtCode: string | null;
  wardCode: string;
  latitude: number;
  longitude: number;
  dailyCapacity: number;
  priority: number;
  status: WarehouseStatus;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseFilters {
  search: string;
  status: WarehouseStatus | '';
}

export interface WarehousePage {
  items: Warehouse[];
  pagination: {
    limit: number;
    hasNext: boolean;
    nextCursor: string | null;
  };
}

export interface CreateWarehousePayload {
  region: 'NORTH' | 'CENTRAL' | 'SOUTH';
  timeZone: string;
  cutoffMinute: number;
  operatingStartMinute: number;
  operatingEndMinute: number;

  code: string;
  name: string;
  address: string;
  provinceCode: string;
  districtCode?: string;
  wardCode: string;
  latitude: number;
  longitude: number;
  dailyCapacity: number;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
}
