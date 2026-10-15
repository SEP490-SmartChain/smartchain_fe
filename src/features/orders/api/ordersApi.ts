import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

export const ORDER_STATUSES = [
  'RECEIVED',
  'MANUAL_REVIEW',
  'ALLOCATING',
  'ALLOCATED',
  'DISPATCHED',
  'IN_TRANSIT',
  'PARTIALLY_DELIVERED',
  'DELIVERED',
  'RETURNED',
  'CANCELLED',
  'FAILED',
  'VALIDATING',
  'VALIDATED',
  'ON_HOLD',
  'BACKORDER',
] as const;
const money = z.string().regex(/^(0|[1-9]\d{0,11})$/);
export const paymentBreakdownSchema = z
  .object({
    discountAmount: money,
    goodsPaidAmount: money,
    shippingChargeAmount: money,
    shippingPaidAmount: money,
  })
  .strict();
export function calculateOrderPayment(
  gross: string,
  payment: z.infer<typeof paymentBreakdownSchema>,
  payer: string,
  mode?: string,
) {
  const p = paymentBreakdownSchema.parse(payment);
  const goods = BigInt(gross);
  const discount = BigInt(p.discountAmount);
  const net = goods - discount;
  const paid = mode === 'PAID' ? net : mode === 'COD' ? BigInt('0') : BigInt(p.goodsPaidAmount);
  const shipping = payer === 'SENDER' ? BigInt('0') : BigInt(p.shippingChargeAmount);
  const shippingPaid = payer === 'SENDER' ? BigInt('0') : BigInt(p.shippingPaidAmount);
  if (
    goods > BigInt('999999999999') ||
    net < BigInt('0') ||
    paid < BigInt('0') ||
    paid > net ||
    shippingPaid > shipping ||
    net - paid + shipping - shippingPaid > BigInt('999999999999')
  ) {
    throw new RangeError('Invalid payment breakdown');
  }
  return {
    netGoodsAmount: net.toString(),
    codAmount: (net - paid).toString(),
    customerShippingFee: (shipping - shippingPaid).toString(),
    paymentBreakdown: {
      ...p,
      goodsPaidAmount: paid.toString(),
      shippingChargeAmount: shipping.toString(),
      shippingPaidAmount: shippingPaid.toString(),
    },
  };
}
/** Normalize human entry only; API money schemas remain strict decimal strings. */
export function normalizeOrderMoneyInput(value: string): string {
  const trimmed = value.trim();
  const digits = /^\d{1,3}([., \u00a0\u202f])\d{3}(?:\1\d{3})*$/.test(trimmed)
    ? trimmed.replace(/[., \u00a0\u202f]/g, '')
    : trimmed;
  return /^\d+$/.test(digits) ? digits.replace(/^0+(?=\d)/, '') : trimmed;
}
const boundedText = (max: number) => z.string().trim().min(1).max(max);
export const manualOrderSchema = z
  .object({
    paymentBreakdown: paymentBreakdownSchema.optional(),
    externalOrderCode: boundedText(100),
    sourceChannel: boundedText(100),
    recipientName: boundedText(150),
    recipientPhone: z.string().regex(/^0\d{9}$/),
    recipientAddress: boundedText(500),
    toProvinceCode: boundedText(20),
    toWardCode: boundedText(20),
    codAmount: money,
    declaredValue: money,
    customerShippingFee: money,
    shippingFeePayer: z.enum(['SENDER', 'RECIPIENT']),
    items: z
      .array(
        z.object({
          productId: z.uuid({ version: 'v4' }),
          qty: z.number().int().min(1).max(1000000),
          unitPrice: money,
        }),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .refine(
    (order) => new Set(order.items.map((item) => item.productId)).size === order.items.length,
    { path: ['items'] },
  )
  .refine(
    (order) =>
      !/^(0|[1-9]\d{0,11})$/.test(order.codAmount) ||
      !/^(0|[1-9]\d{0,11})$/.test(order.customerShippingFee) ||
      BigInt(orderCollectionTotal(order)) <= BigInt('999999999999'),
    { path: ['customerShippingFee'] },
  );
export type ManualOrder = z.infer<typeof manualOrderSchema>;
export function orderCollectionTotal(order: {
  codAmount: string;
  customerShippingFee: string;
  shippingFeePayer: string;
}): string {
  return (
    BigInt(order.codAmount) +
    (order.shippingFeePayer === 'RECIPIENT' ? BigInt(order.customerShippingFee) : BigInt(0))
  ).toString();
}
export const manualDraftSchema = manualOrderSchema.safeExtend({
  goodsPaymentMode: z.enum(['COD', 'PAID', 'PARTIAL']).optional(),
  externalOrderCode: z.string().trim().max(100),
  declaredValue: z.string().regex(/^(|0|[1-9]\d{0,11})$/),
  codAmount: z.string().regex(/^(|0|[1-9]\d{0,11})$/),
});
export type ManualDraft = z.infer<typeof manualDraftSchema>;
export function completeManualDraft(draft: ManualDraft, automaticCode: string): ManualOrder {
  const total = draft.items.reduce(
    (sum, item) => sum + BigInt(item.qty) * BigInt(item.unitPrice),
    BigInt(0),
  );
  const { goodsPaymentMode, ...base } = draft;
  const calculated = draft.paymentBreakdown
    ? calculateOrderPayment(
        total.toString(),
        draft.paymentBreakdown,
        draft.shippingFeePayer,
        goodsPaymentMode,
      )
    : null;
  return manualOrderSchema.parse({
    ...base,
    externalOrderCode: draft.externalOrderCode || automaticCode,
    declaredValue: draft.declaredValue || total.toString(),
    codAmount: draft.codAmount || total.toString(),
    customerShippingFee: draft.shippingFeePayer === 'SENDER' ? '0' : draft.customerShippingFee,
    ...(calculated
      ? {
          codAmount: calculated.codAmount,
          customerShippingFee: calculated.customerShippingFee,
          paymentBreakdown: calculated.paymentBreakdown,
        }
      : {}),
  });
}
const baseOrder = z.object({
  id: z.uuid(),
  externalOrderCode: z.string(),
  sourceChannel: z.string(),
  status: z.enum(ORDER_STATUSES),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  holdReason: z.string().nullable(),
  version: z.number().int(),
});
const financial = {
  paymentBreakdown: paymentBreakdownSchema.nullable().optional(),
  codAmount: money,
  totalAmount: money,
  declaredValue: money,
  customerShippingFee: money,
  shippingFeePayer: z.enum(['SENDER', 'RECIPIENT']),
};
const ownerOrder = baseOrder.extend(financial).strict();
const staffOrder = baseOrder.strict();
const item = z.object({
  identitySource: z.enum(['SNAPSHOT', 'CURRENT_CATALOG']).optional(),
  productId: z.uuid(),
  qty: z.number().int().positive(),
  sku: z.string().nullable().optional(),
  productName: z.string().nullable().optional(),
});
const shipment = z
  .object({
    id: z.uuid(),
    fulfillmentOrderId: z.uuid(),
    trackingNumber: z.string().nullable(),
    status: z.string(),
    bookingState: z.string(),
    active: z.boolean(),
    direction: z.string(),
  })
  .strict();
const child = z.object({
  id: z.uuid(),
  warehouseId: z.uuid(),
  warehouseName: z.string().nullable().optional(),
  sequenceNo: z.number().int(),
  status: z.string(),
  items: z.array(item.strict()),
  parcels: z.array(z.object({ id: z.uuid(), actualWeightG: z.number().int().nullable() }).strict()),
  shipments: z.array(shipment),
});
const detail = {
  statusHistory: z.array(
    z
      .object({
        fromStatus: z.string().nullable(),
        toStatus: z.string(),
        reason: z.string().nullable(),
        changedAt: z.iso.datetime(),
      })
      .strict(),
  ),
};
const ownerDetail = ownerOrder
  .extend({
    ...detail,
    recipientName: z.string(),
    recipientPhone: z.string(),
    recipientAddress: z.string(),
    toProvinceCode: z.string(),
    toWardCode: z.string(),
    provinceName: z.string().nullable().optional(),
    wardName: z.string().nullable().optional(),
    items: z.array(item.extend({ unitPrice: money }).strict()),
    fulfillmentOrders: z.array(child.extend({ codAmount: money }).strict()),
  })
  .strict();
const staffDetail = staffOrder
  .extend({ ...detail, items: z.array(item.strict()), fulfillmentOrders: z.array(child.strict()) })
  .strict();
export type SellerOrder = z.infer<typeof staffOrder> & Partial<z.infer<typeof ownerOrder>>;
export type SellerOrderDetail = Omit<z.infer<typeof staffDetail>, 'items' | 'fulfillmentOrders'> &
  Partial<Omit<z.infer<typeof ownerDetail>, 'items' | 'fulfillmentOrders'>> & {
    items: (z.infer<typeof item> & { unitPrice?: string })[];
    fulfillmentOrders: (z.infer<typeof child> & { codAmount?: string })[];
  };
export const paginationSchema = z.object({
  limit: z.number().int().positive(),
  hasNext: z.boolean(),
  nextCursor: z.uuid().nullable(),
});
export const importResultSchema = z
  .object({
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    ready: z.number().int().nonnegative().optional(),
    items: z.array(
      z
        .object({
          row: z.number().int().positive(),
          rowId: z.string(),
          status: z.enum(['ACCEPTED', 'REJECTED', 'READY']),
          externalOrderCode: z.string().optional(),
          excelRows: z.array(z.number().int().positive()).optional(),
          orderId: z.uuid().optional(),
          code: z.string().optional(),
          fields: z.array(z.string()).optional(),
          existing: z.boolean().optional(),
          issues: z
            .array(
              z
                .object({
                  field: z.string(),
                  reason: z.enum([
                    'QUANTITY',
                    'MISSING_PRICE',
                    'MONEY',
                    'MAX_AMOUNT',
                    'FREE_SHIPPING',
                    'INCONSISTENT',
                    'INVALID',
                  ]),
                  amount: money.optional(),
                  maximum: money.optional(),
                })
                .strict(),
            )
            .optional(),
        })
        .strict()
        .refine((result) =>
          result.status === 'ACCEPTED'
            ? Boolean(result.orderId) && !result.code
            : result.status === 'READY'
              ? !result.code && !result.orderId && !result.existing
              : Boolean(result.code) && !result.orderId && !result.existing,
        ),
    ),
  })
  .strict()
  .refine(
    (result) =>
      result.accepted === result.items.filter((item) => item.status === 'ACCEPTED').length &&
      result.rejected === result.items.filter((item) => item.status === 'REJECTED').length &&
      (result.ready ?? 0) === result.items.filter((item) => item.status === 'READY').length,
  );
export type ImportResult = z.infer<typeof importResultSchema>;
export function parseOrder(value: unknown, owner: boolean): SellerOrder {
  return (owner ? ownerOrder : staffOrder).parse(value);
}
export function parseOrderDetail(value: unknown, owner: boolean): SellerOrderDetail {
  return (owner ? ownerDetail : staffDetail).parse(value);
}
export interface OrderFilters {
  q?: string;
  status: string;
  channel: string;
  from: string;
  to: string;
}
export const sheetConnectionSchema = z
  .object({
    status: z.enum(['NOT_CONFIGURED', 'CONFIGURED']),
    spreadsheetUrl: z
      .string()
      .regex(
        /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{20,150}\/edit#gid=\d{1,12}$/,
      )
      .nullable(),
    name: z.string().min(1).max(150).nullable(),
    pollIntervalSeconds: z.literal(60).nullable(),
    lastOrderReceivedAt: z.string().datetime().nullable(),
    setupAvailable: z.boolean().optional(),
    setupState: z.enum(['NONE', 'PREPARING', 'FAILED']).optional(),
  })
  .strict()
  .refine((value) =>
    value.status === 'CONFIGURED'
      ? Boolean(value.spreadsheetUrl && value.name && value.pollIntervalSeconds)
      : [
          value.spreadsheetUrl,
          value.name,
          value.pollIntervalSeconds,
          value.lastOrderReceivedAt,
        ].every((field) => field === null),
  );
export type SheetConnection = z.infer<typeof sheetConnectionSchema>;
export const ordersApi = {
  async createSheet(signal?: AbortSignal) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      '/v1/orders/sheet-connection',
      {},
      { signal, silent: true },
    );
    return sheetConnectionSchema.parse(data);
  },
  async sheetConnection(signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>('/v1/orders/sheet-connection', {
      signal,
      silent: true,
    });
    return sheetConnectionSchema.parse(data);
  },
  async locations(signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>('/v1/orders/locations', {
      signal,
      silent: true,
    });
    return z
      .array(
        z
          .object({
            code: z.string(),
            name: z.string(),
            type: z.enum(['PROVINCE', 'WARD']),
            parentCode: z.string().nullable(),
          })
          .strict(),
      )
      .max(20000)
      .parse(data);
  },
  async list(filters: OrderFilters, owner: boolean, signal?: AbortSignal, cursor?: string) {
    const params: Record<string, string> = { limit: '50' };
    if (filters.q?.trim()) params.q = filters.q.trim();
    if (filters.status) params.status = filters.status;
    if (filters.channel.trim()) params.channel = filters.channel.trim();
    if (filters.from) params.from = new Date(`${filters.from}T00:00:00`).toISOString();
    if (filters.to) params.to = new Date(`${filters.to}T23:59:59.999`).toISOString();
    if (cursor) params.cursor = cursor;
    const response = await apiClient.get<ApiResponse<unknown>>('/v1/orders', {
      params,
      signal,
      silent: true,
    });
    return {
      items: z.array(owner ? ownerOrder : staffOrder).parse(response.data),
      pagination: paginationSchema.parse(response.meta.pagination),
    };
  },
  async detail(id: string, owner: boolean, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `/v1/orders/${encodeURIComponent(id)}`,
      { signal, silent: true },
    );
    return parseOrderDetail(data, owner);
  },
  async create(input: ManualOrder, key: string, signal?: AbortSignal) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      '/v1/orders',
      manualOrderSchema.parse(input),
      { headers: { 'X-Idempotency-Key': key }, signal, silent: true },
    );
    return z
      .object({
        orderId: z.uuid(),
        status: z.literal('RECEIVED'),
        replayed: z.boolean().optional(),
      })
      .strict()
      .parse(data);
  },
  async import(file: File, signal?: AbortSignal, preview = false) {
    const body = new FormData();
    body.set('file', file);
    const { data } = await apiClient.postForm<ApiResponse<unknown>>(
      preview ? '/v1/orders/import-preview' : '/v1/orders/import',
      body,
      {
        signal,
        silent: true,
      },
    );
    return importResultSchema.parse(data);
  },
  async template(signal?: AbortSignal, sheet = false) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      sheet ? '/v1/orders/sheet-template' : '/v1/orders/import-template',
      {
        signal,
        silent: true,
      },
    );
    return z
      .object({
        fileName: z.literal(sheet ? 'orca-google-sheet.xlsx' : 'orca-orders.xlsx'),
        contentBase64: z.string().max(2 * 1024 * 1024),
      })
      .strict()
      .parse(data);
  },
};
