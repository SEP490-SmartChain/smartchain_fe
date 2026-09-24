import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import { apiKeySchema, createdApiKeySchema } from '../schemas/apiKey.schemas';

import type {
  ApiKey,
  ApiKeyPage,
  CreateApiKeyFormValues,
  CreatedApiKey,
} from '../types/apiKey.types';

const PAGE_SIZE = '50';
const BASE_PATH = '/v1/iam/api-keys';

const paginationSchema = z.object({
  limit: z.number().int().positive(),
  hasNext: z.boolean(),
  nextCursor: z.string().nullable(),
});

/** Form dùng `never` cho "không hết hạn"; BE nhận việc bỏ trống `expiresInDays`. */
function toCreateRequest(values: CreateApiKeyFormValues) {
  return {
    name: values.name.trim(),
    scopes: values.scopes,
    ...(values.expiry === 'never' ? {} : { expiresInDays: Number(values.expiry) }),
  };
}

export const apiKeyApi = {
  async list(cursor?: string): Promise<ApiKeyPage> {
    const params: Record<string, string> = { limit: PAGE_SIZE };
    if (cursor) params.cursor = cursor;
    const { data, meta } = await apiClient.get<ApiResponse<unknown>>(BASE_PATH, {
      params,
      silent: true,
    });
    return {
      items: z.array(apiKeySchema).parse(data),
      pagination: paginationSchema.parse(meta.pagination),
    };
  },

  async create(values: CreateApiKeyFormValues): Promise<CreatedApiKey> {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      BASE_PATH,
      toCreateRequest(values),
      { silent: true },
    );
    return createdApiKeySchema.parse(data);
  },

  async revoke(id: string): Promise<ApiKey> {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      `${BASE_PATH}/${encodeURIComponent(id)}/revoke`,
      {},
      { silent: true },
    );
    return apiKeySchema.parse(data);
  },
};
