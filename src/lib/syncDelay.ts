/**
 * SRS Report 3 §3.10.1 — "Sync delayed": dòng tồn kho không thay đổi quá 24 giờ
 * được coi là đồng bộ chậm (ngưỡng đã chốt cho SS-442).
 */
export const SYNC_DELAY_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function isSyncDelayed(lastSyncedAt: string, now: Date = new Date()): boolean {
  const syncedAtMs = Date.parse(lastSyncedAt);
  if (Number.isNaN(syncedAtMs)) return false;
  return now.getTime() - syncedAtMs > SYNC_DELAY_THRESHOLD_MS;
}
