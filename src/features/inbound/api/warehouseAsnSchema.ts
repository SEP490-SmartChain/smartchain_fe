import { z } from 'zod';

import { asnSchema } from './asnApi';

/** UC-37/38 blind receiving contract: no seller declarations or financial fields. */
export const warehouseAsnSchema = z
  .object({
    id: z.string().uuid(),
    warehouseId: z.string().uuid(),
    asnCode: z.string().min(1),
    status: asnSchema.shape.status.exclude(['DRAFT']),
    arrivedAt: z.string().datetime().nullable(),
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
