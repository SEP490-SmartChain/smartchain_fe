export type DeploymentEnvironment = 'SANDBOX' | 'STAGING' | 'PRODUCTION';

export type TransportMode = 'ROAD' | 'AIR' | 'SEA' | 'RAIL';

export interface CarrierEndpoint {
  id: string;
  carrierId: string;
  environment: DeploymentEnvironment;
  baseUrl: string;
  apiVersion: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CarrierService {
  id: string;
  carrierId: string;
  code: string;
  name: string;
  transportMode: TransportMode;
  volumetricDivisor: number;
  maxWeightG: number | null;
  maxLengthCm: number | null;
  maxWidthCm: number | null;
  maxHeightCm: number | null;
  maxDimensionSumCm: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CarrierSummary {
  id: string;
  code: string;
  name: string;
  logoUrl: string | null;
  isActive: boolean;
  endpointsCount: number;
  servicesCount: number;
  connectedTenantsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CarrierDetail extends CarrierSummary {
  endpoints: CarrierEndpoint[];
  services: CarrierService[];
}

export interface CarrierListQuery {
  search?: string;
  isActive?: boolean;
  cursor?: string;
  limit?: number;
}

export interface CarrierPagination {
  limit: number;
  hasNext: boolean;
  nextCursor: string | null;
}

export interface CarrierListPage {
  items: CarrierSummary[];
  pagination: CarrierPagination;
}
