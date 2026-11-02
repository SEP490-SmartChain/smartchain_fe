import { z } from 'zod';
export const returnRequestSchema = z.object({
  sourceId: z.uuid(),
  qty: z.number().int().min(1).max(1000000),
  reason: z.string().trim().min(3).max(1000),
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(8).max(30),
  address: z.string().trim().min(5).max(500),
  provinceCode: z.string().trim().min(1).max(20),
  wardCode: z.string().trim().min(1).max(20),
});
export const reverseParcelSchema = z.object({
  weightG: z.number().int().min(1).max(50000),
  lengthCm: z.number().int().min(1).max(200),
  widthCm: z.number().int().min(1).max(200),
  heightCm: z.number().int().min(1).max(200),
});
export const returnActionSchema = z.object({
  parcelScan: z.string().max(200),
  weightG: z.number().optional(),
  lengthCm: z.number().optional(),
  widthCm: z.number().optional(),
  heightCm: z.number().optional(),
  qty: z.number().int().min(1).max(1000000),
  classification: z.enum(['ACCEPTED', 'DAMAGED', 'UNKNOWN']),
  decision: z.enum(['APPROVE', 'CORRECT']),
  reason: z.string().max(1000),
  toBinId: z.string(),
  destination: z.enum(['SELLABLE', 'QUARANTINE']),
  binScan: z.string().max(160),
  skuScan: z.string().max(160),
  lotScan: z.string().max(160),
});
export type ReturnRequestForm = z.infer<typeof returnRequestSchema>;
export type ReturnActionForm = z.infer<typeof returnActionSchema>;
