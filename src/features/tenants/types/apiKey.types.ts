/** Quyền của API key, đồng bộ với `API_KEY_SCOPES` phía BE. */
export const API_KEY_SCOPES = ['catalog:write'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/** `never` = không hết hạn; số còn lại là số ngày, đồng bộ `API_KEY_EXPIRY_DAYS` phía BE. */
export const API_KEY_EXPIRY_OPTIONS = ['never', '30', '90', '365'] as const;
export type ApiKeyExpiryOption = (typeof API_KEY_EXPIRY_OPTIONS)[number];

export type ApiKeyStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  status: ApiKeyStatus;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ApiKeyPage {
  items: ApiKey[];
  pagination: { limit: number; hasNext: boolean; nextCursor: string | null };
}

export interface CreatedApiKey {
  apiKey: ApiKey;
  /** Key đầy đủ, chỉ có trong response tạo key; không lưu vào store/localStorage. */
  rawKey: string;
}

export interface CreateApiKeyFormValues {
  name: string;
  scopes: ApiKeyScope[];
  expiry: ApiKeyExpiryOption;
}
