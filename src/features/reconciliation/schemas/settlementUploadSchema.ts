import { z } from 'zod';

export const SETTLEMENT_CARRIERS = ['GHN', 'GHTK', 'VIETTEL_POST'] as const;
export const MAX_SETTLEMENT_FILE_BYTES = 10 * 1024 * 1024;

/** The server validates the CSV schema row by row; the browser only checks the obvious limits. */
export const settlementUploadSchema = z.object({
  carrierCode: z.enum(SETTLEMENT_CARRIERS),
  file: z.custom<FileList>(
    (value) =>
      typeof FileList !== 'undefined' &&
      value instanceof FileList &&
      value.length === 1 &&
      (value[0]?.name.toLowerCase().endsWith('.csv') ?? false) &&
      (value[0]?.size ?? 0) > 0 &&
      (value[0]?.size ?? 0) <= MAX_SETTLEMENT_FILE_BYTES,
  ),
});

export type SettlementUploadValues = z.infer<typeof settlementUploadSchema>;
