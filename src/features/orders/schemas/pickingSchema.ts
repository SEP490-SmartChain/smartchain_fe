import { z } from 'zod';

import { DAY_MS, parseLocalDateTime } from '@/lib/dateValidation';
export const pickScanSchema = z.object({
  binScan: z.string().min(1).max(128),
  skuScan: z.string().min(1).max(128),
  // Optional: the server accepts a blank lot only when the bin holds a single non-expiry lot.
  lotScan: z.string().trim().max(128),
  qty: z.number().int().min(1).max(1000000),
});
export function pickWaveFormSchemaFor(now = () => new Date()) {
  return z.object({
    cutoffAt: z.string().refine((value) => {
      const instant = parseLocalDateTime(value);
      const current = now().getTime();
      return (
        instant !== null &&
        instant.getTime() >= current - 7 * DAY_MS &&
        instant.getTime() <= current
      );
    }),
    assigneeId: z.uuid(),
    maxParcels: z.number().int().min(1).max(50),
  });
}
export const pickWaveFormSchema = pickWaveFormSchemaFor();
export const pickShortFormSchema = z.object({
  observedQty: z.number().int().min(0).max(1000000),
  reason: z.string().trim().min(1).max(1000),
  evidenceKey: z.string().trim().min(1).max(500),
});
export const pickApprovalSchema = z.object({ reason: z.string().trim().min(1).max(1000) });
export type PickScan = z.infer<typeof pickScanSchema>;
