import { ApiError } from '@/services/apiClient';

/** Only an explicit rejection allows a new command; an uncertain result keeps its reference. */
export function isRejectedOperation(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    !error.code.endsWith('.CONTENTION') &&
    !error.code.endsWith('IDEMPOTENCY_CONFLICT')
  );
}
