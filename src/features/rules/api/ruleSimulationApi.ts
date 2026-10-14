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
    return result;
  },
};
