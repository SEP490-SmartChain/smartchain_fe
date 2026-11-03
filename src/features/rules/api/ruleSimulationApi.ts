import { apiClient, type ApiResponse } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import {
  simulationRequestSchema,
  simulationResponseSchema,
  type SimulationRequest,
  type SimulationResult,
} from '../schemas/ruleSimulationSchema';

export const ruleSimulationApi = {
  async simulate(input: SimulationRequest, signal?: AbortSignal): Promise<SimulationResult> {
    const request = simulationRequestSchema.parse(input);
    const principal = useAuthStore.getState().user;
    const { data } = await apiClient.post<ApiResponse<unknown>>('/v1/rules/simulate', request, {
      silent: true,
      signal,
    });
    if (signal?.aborted || principal !== useAuthStore.getState().user) {
      throw new Error('Simulation scope changed');
    }
    const result = simulationResponseSchema.parse(data);
    if (
      result.kind !== request.kind ||
      result.mode !== (request.candidate ? 'SAVED_VERSION' : 'PUBLISHED') ||
      (request.candidate &&
        !result.trace.some(
          (row) =>
            row.ruleId === request.candidate?.ruleId &&
            row.ruleVersion === request.candidate.version,
        ))
    ) {
      throw new Error('Simulation response does not match request');
    }
    if (result.allocation) {
      if (!request.projection || !('items' in request.projection)) {
        throw new Error('Unrequested allocation projection');
      }
      const snapshot = request.projection;
      const lines = result.allocation.parcels.flatMap((parcel) => parcel.lines);
      if (
        result.allocation.candidates.some(
          (row) => !snapshot.warehouses.some((warehouse) => warehouse.id === row.warehouseId),
        ) ||
        result.allocation.lots.some(
          (row) =>
            !snapshot.stock.some(
              (stock) =>
                stock.id === row.stockId &&
                stock.lotId === row.lotId &&
                stock.warehouseId === row.warehouseId,
            ),
        ) ||
        (result.allocation.status === 'PLANNED' &&
          (snapshot.items.some(
            (item) =>
              lines
                .filter((line) => line.productId === item.productId)
                .reduce((sum, line) => sum + line.qty, 0) !== item.qty,
          ) ||
            result.allocation.parcels.reduce(
              (sum, parcel) => sum + BigInt(parcel.codVnd),
              BigInt(0),
            ) !== BigInt(snapshot.codVnd))) ||
        lines.some(
          (line) =>
            !snapshot.items.some((item) => item.productId === line.productId) ||
            line.lots.some(
              (lot) =>
                !snapshot.stock.some(
                  (stock) =>
                    stock.id === lot.stockId &&
                    stock.productId === line.productId &&
                    stock.binId === lot.binId &&
                    lot.qty <= stock.availableQty,
                ),
            ),
        )
      ) {
        throw new Error('Allocation projection does not match supplied snapshot');
      }
    }
    if (result.carrierQuote) {
      const snapshot = request.projection;
      if (
        !snapshot ||
        !('tariffs' in snapshot) ||
        result.carrierQuote.candidates.some(
          (candidate) =>
            candidate.status === 'QUOTED' &&
            !snapshot.tariffs.some(
              (tariff) =>
                tariff.serviceId === candidate.serviceId &&
                tariff.version === candidate.tariffVersion,
            ),
        )
      ) {
        throw new Error('Carrier projection does not match supplied snapshot');
      }
    }
    return result;
  },
};
