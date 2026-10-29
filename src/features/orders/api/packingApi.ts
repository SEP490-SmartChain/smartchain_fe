import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

const parcel = z
  .object({
    id: z.uuid(),
    status: z.string(),
    version: z.number().int(),
    sequenceNo: z.number().int(),
    orderCode: z.string(),
  })
  .strict();
const detail = parcel
  .extend({
    recipientName: z.string(),
    recipientPhone: z.string(),
    recipientAddress: z.string(),
    items: z.array(
      z
        .object({
          id: z.uuid(),
          qty: z.number().int(),
          pickedQty: z.number().int(),
          sku: z.string().nullable(),
          name: z.string().nullable(),
        })
        .strict(),
    ),
    packing: z.array(
      z
        .object({
          id: z.uuid(),
          actualWeightG: z.number().int(),
          actualLengthCm: z.string(),
          actualWidthCm: z.string(),
          actualHeightCm: z.string(),
        })
        .strict(),
    ),
    shipments: z.array(
      z
        .object({
          id: z.uuid(),
          trackingNumber: z.string().nullable(),
          bookingState: z.string(),
          carrierAccountId: z.uuid().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
const list = z.object({ items: z.array(parcel), nextCursor: z.uuid().nullable() }).strict();
const operation = z.object({ id: z.uuid(), status: z.string() }).strict();
const options = z
  .object({
    shipments: z.array(
      z
        .object({
          id: z.uuid(),
          trackingNumber: z.string().nullable(),
          carrierAccountId: z.uuid().nullable(),
          fulfillmentOrderId: z.uuid(),
        })
        .strict(),
    ),
    manifests: z.array(
      z
        .object({
          id: z.uuid(),
          manifestCode: z.string(),
          status: z.string(),
          parcelCount: z.number().int(),
          carrierAccountId: z.uuid(),
          carrierAckRef: z.string().nullable(),
          signedAt: z.string().nullable(),
          hasHandoverPhoto: z.boolean(),
          shipments: z.array(
            z
              .object({
                id: z.uuid(),
                trackingNumber: z.string().nullable(),
                status: z.string(),
                pickedUpAt: z.string().nullable(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    nextShipmentCursor: z.uuid().nullable(),
    nextManifestCursor: z.uuid().nullable(),
  })
  .strict();
export type PackingDetail = z.infer<typeof detail>;
export type PackingQueue = z.infer<typeof list>;
export type HandoverOptions = z.infer<typeof options>;
export interface PackCommand {
  operationId: string;
  expectedVersion: number;
  actualWeightG: number;
  actualLengthCm: string;
  actualWidthCm: string;
  actualHeightCm: string;
  contents: { itemId: string; qty: number }[];
  materials: { materialCode: string; qty: string; unit: string }[];
}
const base = '/v1/warehouse/fulfillment';
export const packingApi = {
  async list(warehouseId: string, signal?: AbortSignal, cursor?: string) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(`${base}/parcels`, {
      params: { warehouseId, ...(cursor ? { cursor } : {}) },
      signal,
      silent: true,
    });
    return list.parse(data);
  },
  async detail(warehouseId: string, id: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(`${base}/parcels/${id}`, {
      params: { warehouseId },
      signal,
      silent: true,
    });
    return detail.parse(data);
  },
  async pack(warehouseId: string, id: string, input: PackCommand, signal?: AbortSignal) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${base}/parcels/${id}/pack?warehouseId=${encodeURIComponent(warehouseId)}`,
      input,
      { signal, silent: true },
    );
    return operation.parse(data);
  },
  async options(
    warehouseId: string,
    signal?: AbortSignal,
    shipmentCursor?: string,
    manifestCursor?: string,
  ) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(`${base}/handover`, {
      params: {
        warehouseId,
        ...(shipmentCursor ? { shipmentCursor } : {}),
        ...(manifestCursor ? { manifestCursor } : {}),
      },
      signal,
      silent: true,
    });
    return options.parse(data);
  },
  async manifest(
    warehouseId: string,
    input: { operationId: string; shipmentIds: string[] },
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${base}/manifests?warehouseId=${encodeURIComponent(warehouseId)}`,
      input,
      { signal, silent: true },
    );
    return operation.parse(data);
  },
  async sign(
    warehouseId: string,
    id: string,
    input: {
      operationId: string;
      confirmedParcelCount: number;
      carrierAckRef?: string;
      carrierSignerName: string;
      evidenceKey: string;
    },
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${base}/manifests/${id}/sign?warehouseId=${encodeURIComponent(warehouseId)}`,
      input,
      { signal, silent: true },
    );
    return operation.parse(data);
  },
  async removeDraftParcel(
    warehouseId: string,
    id: string,
    input: { operationId: string; shipmentId: string },
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${base}/manifests/${id}/remove-parcel`,
      input,
      { params: { warehouseId }, signal, silent: true },
    );
    return operation.parse(data);
  },
};
