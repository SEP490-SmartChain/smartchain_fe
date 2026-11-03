import { z } from 'zod';
export const pickScanSchema = z.object({
  binScan: z.string().min(1).max(128),
  skuScan: z.string().min(1).max(128),
  lotScan: z.string().min(1).max(128),
  qty: z.number().int().min(1).max(1000000),
});
export const pickWaveFormSchema = z.object({ cutoffAt: z.string().min(1), assigneeId: z.uuid() });
export const pickShortFormSchema = z.object({
  observedQty: z.number().int().min(0).max(1000000),
  reason: z.string().trim().min(1).max(1000),
  evidenceKey: z.string().trim().min(1).max(500),
});
export const pickApprovalSchema = z.object({ reason: z.string().trim().min(1).max(1000) });
export type PickScan = z.infer<typeof pickScanSchema>;
