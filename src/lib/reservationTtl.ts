/** SRS Report 3 §3.10.2 — màu badge TTL: xanh > 10 phút, vàng 5–10 phút, đỏ < 5 phút. */
export const TTL_WARNING_THRESHOLD_SECONDS = 10 * 60;
export const TTL_CRITICAL_THRESHOLD_SECONDS = 5 * 60;

const MS_PER_SECOND = 1000;

export type ReservationTtlTone = 'success' | 'warning' | 'error' | 'expired';

export function getTtlTone(remainingSeconds: number): ReservationTtlTone {
  if (remainingSeconds <= 0) return 'expired';
  if (remainingSeconds < TTL_CRITICAL_THRESHOLD_SECONDS) return 'error';
  if (remainingSeconds <= TTL_WARNING_THRESHOLD_SECONDS) return 'warning';
  return 'success';
}

export function formatTtl(remainingSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(remainingSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Mốc hết hạn theo đồng hồ máy người dùng, dựng từ số giây server trả — không phụ thuộc giờ máy
 * có lệch so với server hay không.
 */
export function toClientDeadlineMs(ttlRemainingSeconds: number, receivedAtMs: number): number {
  return receivedAtMs + ttlRemainingSeconds * MS_PER_SECOND;
}

export function secondsUntil(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / MS_PER_SECOND));
}
