import { z } from 'zod';

export const carrierSummarySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
});

export const carrierSummaryListSchema = z.array(carrierSummarySchema);

export const carrierCredentialSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  carrierId: z.string().uuid(),
  carrier: carrierSummarySchema,
  name: z.string(),
  environment: z.enum(['SANDBOX', 'PRODUCTION']),
  authType: z.enum(['API_TOKEN', 'BASIC', 'OAUTH2']),
  maskedPreview: z.string(),
  status: z.enum(['UNVERIFIED', 'CONNECTED', 'FAILED']),
  lastPingAt: z.string().nullable(),
  lastPingMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const carrierCredentialListSchema = z.array(carrierCredentialSchema);

export const pingTestResultSchema = z.object({
  credentialId: z.string().uuid(),
  status: z.enum(['UNVERIFIED', 'CONNECTED', 'FAILED']),
  latencyMs: z.number(),
  message: z.string(),
  testedAt: z.string(),
});

export const createCarrierCredentialFormSchema = z
  .object({
    carrierId: z.string().uuid({ message: 'carrierRequired' }),
    name: z.string().min(2, { message: 'nameMinLength' }).max(100),
    environment: z.enum(['SANDBOX', 'PRODUCTION']),
    authType: z.enum(['API_TOKEN', 'BASIC', 'OAUTH2']).default('API_TOKEN'),
    apiToken: z.string().min(4, { message: 'tokenMinLength' }),
    shopId: z.string().optional(),
  });

export type CreateCarrierCredentialFormValues = z.infer<
  typeof createCarrierCredentialFormSchema
>;

export const updateCarrierCredentialFormSchema = z.object({
  name: z.string().min(2, { message: 'nameMinLength' }).max(100).optional(),
  environment: z.enum(['SANDBOX', 'PRODUCTION']).optional(),
  apiToken: z.string().optional(),
  shopId: z.string().optional(),
});

export type UpdateCarrierCredentialFormValues = z.infer<
  typeof updateCarrierCredentialFormSchema
>;
