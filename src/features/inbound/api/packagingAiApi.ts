import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

const date = z.iso.date();
const lot = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(
    (value) =>
      !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127),
  );
export const packagingAcceptanceSchema = z
  .object({
    confirmed: z.literal(true),
    lotCode: lot.optional(),
    manufacturedOn: date.optional(),
    expiresOn: date.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.lotCode || value.expiresOn));
export type PackagingAcceptance = z.infer<typeof packagingAcceptanceSchema>;
export const packagingRequestSchema = z
  .object({
    operationKey: z.uuidv4(),
    expectedVersion: z.number().int().min(1).max(2147483646),
    inboundLineId: z.uuidv4(),
    evidenceId: z.uuidv4(),
  })
  .strict();
export type PackagingRequest = z.infer<typeof packagingRequestSchema>;
const accepted = z
  .object({
    lotCode: lot.nullable(),
    manufacturedOn: date.nullable(),
    expiresOn: date.nullable(),
    requiresQuarantine: z.boolean(),
  })
  .strict();
export const packagingSuggestionSchema = z
  .object({
    id: z.uuidv4(),
    receiptId: z.uuidv4(),
    inboundLineId: z.uuidv4(),
    evidenceId: z.uuidv4(),
    receiptVersion: z.number().int().positive(),
    receivingRound: z.number().int().positive(),
    state: z.enum(['RUNNING', 'READY', 'FALLBACK', 'ACCEPTED']),
    model: z.string().min(1).max(200).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    lotText: z.string().max(100).nullable(),
    expiryText: z.string().max(100).nullable(),
    reason: z.enum(['DISABLED', 'QUOTA_EXCEEDED', 'UNAVAILABLE']).nullable(),
    accepted: accepted.nullable(),
  })
  .strict()
  .refine((value) => {
    const ready = value.state === 'READY' || value.state === 'ACCEPTED';
    return (
      (ready
        ? value.model !== null && value.confidence !== null && value.reason === null
        : value.model === null &&
          value.confidence === null &&
          value.lotText === null &&
          value.expiryText === null) &&
      (value.state === 'ACCEPTED') === (value.accepted !== null) &&
      (value.state === 'FALLBACK') === (value.reason !== null)
    );
  });
export type PackagingSuggestion = z.infer<typeof packagingSuggestionSchema>;
export const packagingAvailabilitySchema = z
  .object({
    enabled: z.boolean(),
    images: z
      .array(
        z
          .object({
            id: z.uuidv4(),
            createdAt: z.iso.datetime(),
            note: z.string().max(1000).nullable(),
          })
          .strict(),
      )
      .max(10),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.images.map((image) => image.id)).size === value.images.length &&
      (value.enabled || value.images.length === 0),
  );
export interface PackagingScope {
  receiptId: string;
  inboundLineId: string;
  receiptVersion: number;
  receivingRound: number;
}
export function assertPackagingScope(
  value: PackagingSuggestion,
  scope: PackagingScope,
  request: PackagingRequest,
) {
  if (
    value.id !== request.operationKey ||
    value.evidenceId !== request.evidenceId ||
    value.receiptId !== scope.receiptId ||
    value.inboundLineId !== scope.inboundLineId ||
    value.receiptVersion !== scope.receiptVersion ||
    value.receivingRound !== scope.receivingRound
  ) {
    throw new Error('Packaging suggestion scope changed');
  }
  return value;
}
const path = (warehouse: string, asn: string) =>
  `/v1/warehouses/${encodeURIComponent(warehouse)}/asns/${encodeURIComponent(asn)}/receiving/packaging-suggestions`;
export const packagingAiApi = {
  async availability(warehouse: string, asn: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${path(warehouse, asn)}/availability`,
      { signal, silent: true },
    );
    return packagingAvailabilitySchema.parse(data);
  },
  async request(
    warehouse: string,
    asn: string,
    input: PackagingRequest,
    scope: PackagingScope,
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      path(warehouse, asn),
      packagingRequestSchema.parse(input),
      { signal, silent: true },
    );
    const result = z
      .discriminatedUnion('outcome', [
        z
          .object({ outcome: z.literal('DISABLED'), manualEntryAvailable: z.literal(true) })
          .strict(),
        z
          .object({ outcome: z.literal('SUGGESTION'), suggestion: packagingSuggestionSchema })
          .strict(),
      ])
      .parse(data);
    if (result.outcome === 'SUGGESTION') assertPackagingScope(result.suggestion, scope, input);
    return result;
  },
  async get(
    warehouse: string,
    asn: string,
    input: PackagingRequest,
    scope: PackagingScope,
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      `${path(warehouse, asn)}/${encodeURIComponent(input.operationKey)}`,
      { signal, silent: true },
    );
    return assertPackagingScope(packagingSuggestionSchema.parse(data), scope, input);
  },
  async accept(
    warehouse: string,
    asn: string,
    input: PackagingRequest,
    scope: PackagingScope,
    values: PackagingAcceptance,
    signal?: AbortSignal,
  ) {
    const command = packagingAcceptanceSchema.parse(values);
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${path(warehouse, asn)}/${encodeURIComponent(input.operationKey)}/accept`,
      command,
      { signal, silent: true },
    );
    const result = assertPackagingScope(packagingSuggestionSchema.parse(data), scope, input);
    assertAcceptedPackaging(result, command);
    return result;
  },
};
export function assertAcceptedPackaging(value: PackagingSuggestion, command: PackagingAcceptance) {
  if (
    value.state !== 'ACCEPTED' ||
    !value.accepted ||
    value.accepted.lotCode !== (command.lotCode ?? null) ||
    value.accepted.manufacturedOn !== (command.manufacturedOn ?? null) ||
    value.accepted.expiresOn !== (command.expiresOn ?? null)
  ) {
    throw new Error('Packaging acceptance does not match confirmed input');
  }
}
