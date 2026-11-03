import { z } from 'zod';

import { asnSchema } from './asnApi';

/** Warehouse ASN directory allowlist; declared quantities belong to the receipt workspace. */
export const warehouseAsnSchema = z
  .object({
    id: z.string().uuid(),
    warehouseId: z.string().uuid(),
    asnCode: z.string().min(1),
    status: asnSchema.shape.status.exclude(['DRAFT']),
    reinspectionRequired: z.boolean().optional(),
    arrivedAt: z.string().datetime().nullable(),
    expectedArrivalAt: z.string().datetime().nullable().optional(),
    receiptIds: z.array(z.string().uuid()),
    version: z.number().int().positive(),
    lines: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            lineNo: z.number().int().positive(),
            sku: z.string(),
            productName: z.string(),
            receivedQty: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

export type WarehouseAsn = z.infer<typeof warehouseAsnSchema>;
