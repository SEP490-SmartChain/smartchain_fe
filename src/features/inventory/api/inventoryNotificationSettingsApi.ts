import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

const settingSchema = z
  .object({
    tenantId: z.guid().nullable(),
    warehouseId: z.guid().nullable(),
    version: z.number().int().nonnegative(),
    expiryEnabled: z.boolean(),
    lowStockEnabled: z.boolean(),
    lowStockAvailable: z.boolean(),
    warningDays: z.number().int().nonnegative().nullable(),
    transitDays: z.number().int().nonnegative(),
    bufferDays: z.number().int().nonnegative(),
    emailRecipient: z.email().nullable(),
    zaloRecipient: z
      .string()
      .regex(/^\+?[0-9]{8,15}$/)
      .nullable(),
    channels: z.array(z.enum(['EMAIL', 'ZALO'])),
    updatedAt: z.iso.datetime().nullable(),
  })
  .strict();

export type InventoryNotificationSetting = z.infer<typeof settingSchema>;
export type InventoryNotificationSettingInput = Omit<
  InventoryNotificationSetting,
  'updatedAt' | 'version' | 'lowStockAvailable'
> & { expectedVersion: number };

export const inventoryNotificationSettingsApi = {
  async get() {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      '/v1/inventory/notification-settings',
      { silent: true },
    );
    return settingSchema.parse(data);
  },
  async create(input: InventoryNotificationSettingInput) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      '/v1/inventory/notification-settings',
      input,
      { silent: true },
    );
    return settingSchema.parse(data);
  },
  async update(input: InventoryNotificationSettingInput) {
    const { data } = await apiClient.put<ApiResponse<unknown>>(
      '/v1/inventory/notification-settings',
      input,
      { silent: true },
    );
    return settingSchema.parse(data);
  },
};
