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

export type InventoryNotificationOverrideInput = Pick<
  InventoryNotificationSettingInput,
  | 'tenantId'
  | 'warehouseId'
  | 'expectedVersion'
  | 'expiryEnabled'
  | 'lowStockEnabled'
  | 'warningDays'
  | 'transitDays'
  | 'bufferDays'
>;
export const inventoryNotificationSettingsApi = {
  async sellers(warehouseId: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      '/v1/inventory/notification-settings/sellers',
      { params: { warehouseId }, signal, silent: true },
    );
    return z.array(z.object({ id: z.uuid(), name: z.string() })).parse(data);
  },
  async get(scope?: { tenantId: string; warehouseId: string }) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(
      '/v1/inventory/notification-settings',
      { silent: true, params: scope },
    );
    return settingSchema.parse(data);
  },
  async create(input: InventoryNotificationSettingInput | InventoryNotificationOverrideInput) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      '/v1/inventory/notification-settings',
      input,
      { silent: true },
    );
    return settingSchema.parse(data);
  },
  async update(input: InventoryNotificationSettingInput | InventoryNotificationOverrideInput) {
    const { data } = await apiClient.put<ApiResponse<unknown>>(
      '/v1/inventory/notification-settings',
      input,
      { silent: true },
    );
    return settingSchema.parse(data);
  },
};
