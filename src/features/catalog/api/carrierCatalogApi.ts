import { apiClient, type ApiResponse } from '@/services/apiClient';

import type {
  CarrierDetail,
  CarrierListPage,
  CarrierListQuery,
} from '../types/carrierCatalog.types';

export const carrierCatalogApi = {
  async list(query: CarrierListQuery): Promise<CarrierListPage> {
    const params: Record<string, string> = {};
    if (query.search?.trim()) params.search = query.search.trim();
    if (typeof query.isActive === 'boolean') params.isActive = String(query.isActive);
    if (query.cursor) params.cursor = query.cursor;
    if (query.limit) params.limit = String(query.limit);

    const { data } = await apiClient.get<ApiResponse<CarrierListPage>>('/v1/platform/carriers', {
      params,
      silent: true,
    });
    return data;
  },

  async getDetail(id: string): Promise<CarrierDetail> {
    const { data } = await apiClient.get<ApiResponse<CarrierDetail>>(
      `/v1/platform/carriers/${encodeURIComponent(id)}`,
      { silent: true },
    );
    return data;
  },
};
