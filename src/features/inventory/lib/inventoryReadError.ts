import { ZodError } from 'zod';

import { ApiError } from '@/services/apiClient';

export function inventoryReadErrorKind(
  error: Error,
): 'forbidden' | 'network' | 'response' | 'unavailable' {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'forbidden';
    if (error.status === 0) return 'network';
    if (error.code === 'API.INVALID_RESPONSE') return 'response';
  }
  return error instanceof ZodError ? 'response' : 'unavailable';
}
