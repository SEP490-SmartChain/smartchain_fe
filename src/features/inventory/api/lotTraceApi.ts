import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

const trace = z
  .object({
    id: z.uuid(),
    lotId: z.uuid(),
    lotCode: z.string(),
    lotStatus: z.string(),
    lotVersion: z.number().int(),
    sku: z.string(),
    binCode: z.string(),
    allocatedQty: z.number().int(),
    pickedQty: z.number().int(),
    returnedQty: z.number().int(),
    fulfillmentOrderId: z.uuid(),
    orderId: z.uuid(),
    status: z.string(),
    picks: z.array(
      z
        .object({
          id: z.uuid(),
          qty: z.number().int(),
          pickedAt: z.iso.datetime(),
          pickerId: z.uuid(),
        })
        .strict(),
    ),
    shipments: z.array(
      z
        .object({
          id: z.uuid(),
          trackingNumber: z.string().nullable(),
          deliveredAt: z.iso.datetime().nullable(),
          status: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
const affected = z
  .object({
    id: z.uuid(),
    orderId: z.uuid(),
    parcelId: z.uuid(),
    name: z.string(),
    phone: z.string(),
    qty: z.number().int(),
  })
  .strict();
const base = (wh: string) => `/v1/warehouses/${z.uuid().parse(wh)}/trace`;
export type LotTraceRecord = z.infer<typeof trace>;
export type AffectedRecipient = z.infer<typeof affected>;
/** Spreadsheet cells from external/customer input must never become executable formulae. */
export function recallCsv(rows: readonly AffectedRecipient[]): string {
  const cell = (v: string | number) =>
    `"${String(v)
      .replace(/^[\s]*[=+@-]/, (s) => `'${s}`)
      .replaceAll('"', '""')}"`;
  return [
    'orderId,parcelId,name,phone,qty',
    ...rows.map((r) => [r.orderId, r.parcelId, r.name, r.phone, r.qty].map(cell).join(',')),
  ].join('\r\n');
}
export const lotTraceApi = {
  async trace(
    wh: string,
    kind: 'lots' | 'parcels',
    id: string,
    cursor?: string,
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${base(wh)}/${kind}/${z.uuid().parse(id)}`,
      { params: cursor ? { cursor } : undefined, signal, silent: true },
    );
    return z
      .object({ items: z.array(trace), nextCursor: z.uuid().nullable() })
      .strict()
      .parse(data);
  },
  async affected(wh: string, id: string, cursor?: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${base(wh)}/lots/${z.uuid().parse(id)}/affected`,
      { params: cursor ? { cursor } : undefined, signal, silent: true },
    );
    return z
      .object({ items: z.array(affected), nextCursor: z.uuid().nullable() })
      .strict()
      .parse(data);
  },
  async notify(
    wh: string,
    id: string,
    input: { operationId: string; expectedVersion: number; cursor?: string },
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${base(wh)}/lots/${z.uuid().parse(id)}/notifications`,
      input,
      { silent: true },
    );
    return z
      .object({
        queued: z.number().int().nonnegative(),
        examined: z.number().int().nonnegative(),
        nextCursor: z.uuid().nullable(),
      })
      .strict()
      .parse(data);
  },
  async recall(
    wh: string,
    id: string,
    input: { operationId: string; expectedVersion: number; reason: string },
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${base(wh)}/lots/${z.uuid().parse(id)}/recall`,
      input,
      { silent: true },
    );
    return z
      .object({
        id: z.uuid(),
        version: z.number().int(),
        status: z.literal('RECALLED'),
        releasedQty: z.number().int(),
        reallocatedQty: z.number().int(),
        recoveryCount: z.number().int(),
      })
      .strict()
      .parse(data);
  },
};
