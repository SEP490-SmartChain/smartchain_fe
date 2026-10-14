import { apiClient, type ApiResponse } from '@/services/apiClient';

import {
  servicePayload,
  type CarrierFormValues,
  type CarrierServiceFormValues,
} from '../schemas/carrierManagementSchema';

import type { CarrierService, CarrierSummary } from '../types/carrierCatalog.types';

const base = '/v1/platform/carriers';
export const carrierManagementApi = {
  async saveCarrier(values: CarrierFormValues, current?: CarrierSummary): Promise<void> {
    if (current) {
      await apiClient.patch<ApiResponse<unknown>>(
        `${base}/${encodeURIComponent(current.id)}`,
        {
          name: values.name,
          isActive: values.isActive,
          expectedUpdatedAt: current.updatedAt,
        },
        { silent: true },
      );
    } else {
      await apiClient.post<ApiResponse<unknown>>(base, values, { silent: true });
    }
  },
  async saveService(
    carrierId: string,
    values: CarrierServiceFormValues,
    current?: CarrierService,
  ): Promise<void> {
    const path = `${base}/${encodeURIComponent(carrierId)}/services`;
    if (current) {
      const { code: _code, ...changes } = servicePayload(values);
      await apiClient.patch<ApiResponse<unknown>>(
        `${path}/${encodeURIComponent(current.id)}`,
        {
          ...changes,
          expectedUpdatedAt: current.updatedAt,
        },
        { silent: true },
      );
    } else {
      await apiClient.post<ApiResponse<unknown>>(path, servicePayload(values), { silent: true });
    }
  },
};
