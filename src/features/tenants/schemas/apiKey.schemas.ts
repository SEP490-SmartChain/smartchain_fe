import { z } from 'zod';

import { API_KEY_EXPIRY_OPTIONS, API_KEY_SCOPES } from '../types/apiKey.types';

/** Đồng bộ với `CreateApiKeyDto` phía BE. */
export const API_KEY_NAME_MIN_LENGTH = 3;
export const API_KEY_NAME_MAX_LENGTH = 100;

/** Message là key trong namespace `ApiKeys.validation`, component dịch khi hiển thị. */
export const createApiKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(API_KEY_NAME_MIN_LENGTH, { message: 'nameLength' })
    .max(API_KEY_NAME_MAX_LENGTH, { message: 'nameLength' }),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1, { message: 'scopesRequired' }),
  expiry: z.enum(API_KEY_EXPIRY_OPTIONS),
});

export type CreateApiKeySchemaValues = z.infer<typeof createApiKeySchema>;

export const apiKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  scopes: z.array(z.enum(API_KEY_SCOPES)),
  status: z.enum(['ACTIVE', 'REVOKED', 'EXPIRED']),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  lastUsedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
});

export const createdApiKeySchema = z.object({
  apiKey: apiKeySchema,
  rawKey: z.string().min(1),
});
