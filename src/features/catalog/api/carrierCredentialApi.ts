import { apiClient, type ApiResponse } from '@/services/apiClient';

import {
  carrierCredentialListSchema,
  carrierCredentialSchema,
  carrierSummaryListSchema,
  pingTestResultSchema,
} from '../schemas/carrierCredential.schema';
import type {
  CarrierCredential,
  CarrierCredentialFilters,
  CarrierSummary,
  CreateCarrierCredentialInput,
  PingTestResult,
  UpdateCarrierCredentialInput,
} from '../types/carrierCredential.types';

export const FALLBACK_CARRIERS: readonly CarrierSummary[] = [
  {
    id: 'c5d4f418-6dd6-46fa-808a-81ad8c97ebbf',
    code: 'GHTK',
    name: 'Giao Hàng Tiết Kiệm',
    logoUrl: 'https://smartchain-assets.s3.amazonaws.com/carriers/ghtk.svg',
  },
  {
    id: '576fb687-d3d7-4a60-bc99-a9cd23293677',
    code: 'GHN',
    name: 'Giao Hàng Nhanh',
    logoUrl: 'https://smartchain-assets.s3.amazonaws.com/carriers/ghn.svg',
  },
  {
    id: '693d50d6-9ae6-4209-bf54-2ce38bec35c3',
    code: 'VIETTEL_POST',
    name: 'Viettel Post',
    logoUrl: 'https://smartchain-assets.s3.amazonaws.com/carriers/viettelpost.svg',
  },
  {
    id: 'd778e3e2-9e0f-4aa1-8441-c2cce0f87c46',
    code: 'JT_EXPRESS',
    name: 'J&T Express',
    logoUrl: 'https://smartchain-assets.s3.amazonaws.com/carriers/jtexpress.svg',
  },
];

export const carrierCredentialApi = {
  async list(filters?: CarrierCredentialFilters): Promise<CarrierCredential[]> {
    const params: Record<string, string> = {};
    if (filters?.carrierId) params.carrierId = filters.carrierId;
    if (filters?.environment) params.environment = filters.environment;
    if (filters?.status) params.status = filters.status;

    const { data } = await apiClient.get<ApiResponse<unknown>>(
      '/v1/carrier-credentials',
      { params, silent: true },
    );
    return carrierCredentialListSchema.parse(data);
  },

  async getById(id: string): Promise<CarrierCredential> {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/carrier-credentials/${encodeURIComponent(id)}`,
    );
    return carrierCredentialSchema.parse(data);
  },

  async create(
    payload: CreateCarrierCredentialInput,
  ): Promise<CarrierCredential> {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      '/v1/carrier-credentials',
      payload,
    );
    return carrierCredentialSchema.parse(data);
  },

  async update(
    id: string,
    payload: UpdateCarrierCredentialInput,
  ): Promise<CarrierCredential> {
    const { data } = await apiClient.patch<ApiResponse<unknown>>(
      `/v1/carrier-credentials/${encodeURIComponent(id)}`,
      payload,
    );
    return carrierCredentialSchema.parse(data);
  },

  async delete(id: string): Promise<{ message: string }> {
    const { data } = await apiClient.delete<ApiResponse<{ message: string }>>(
      `/v1/carrier-credentials/${encodeURIComponent(id)}`,
    );
    return data;
  },

  async pingTest(id: string): Promise<PingTestResult> {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `/v1/carrier-credentials/${encodeURIComponent(id)}/test`,
      {},
    );
    return pingTestResultSchema.parse(data);
  },

  async getAvailableCarriers(): Promise<CarrierSummary[]> {
    try {
      const { data } = await apiClient.get<ApiResponse<unknown>>(
        '/v1/carrier-credentials/carriers',
        { silent: true },
      );
      return carrierSummaryListSchema.parse(data);
    } catch {
      // Fallback khi API chưa sẵn sàng hoặc offline
      return [...FALLBACK_CARRIERS];
    }
  },
};
