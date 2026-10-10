import { z } from 'zod';

export function getCreateWarehouseSchema(t: (key: string) => string, isEditing = false) {
  return z
    .object({
      region: z.enum(['NORTH', 'CENTRAL', 'SOUTH']),
      timeZone: z.literal('Asia/Ho_Chi_Minh'),
      cutoffMinute: z.number().int().min(0).max(1439),
      operatingStartMinute: z.number().int().min(0).max(1439),
      operatingEndMinute: z.number().int().min(1).max(1440),
      code: z.string().min(1, t('requiredError')),
      name: z.string().min(3, t('nameError')).max(150, t('nameError')),
      address: z.string().min(5, t('addressError')).max(255, t('addressError')),
      provinceCode: z.string().min(1, t('requiredError')),
      districtCode: z
        .string()
        .min(isEditing ? 0 : 1, t('requiredError'))
        .max(20),
      wardCode: z.string().min(1, t('requiredError')),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      dailyCapacity: z.number().int().min(1).max(1000000),
      contactName: z.string().max(200).optional().or(z.literal('')),
      contactPhone: z.string().max(20).optional().or(z.literal('')),
      contactEmail: z.string().email(t('emailError')).optional().or(z.literal('')),
    })
    .refine(
      (v) =>
        v.operatingEndMinute > v.operatingStartMinute &&
        v.cutoffMinute >= v.operatingStartMinute &&
        v.cutoffMinute < v.operatingEndMinute,
      { path: ['cutoffMinute'], message: t('hoursError') },
    );
}

export type CreateWarehouseFormValues = z.infer<ReturnType<typeof getCreateWarehouseSchema>>;

/** Explicit allowlist preserves immutable warehouse code and server ownership. */
export function toWarehouseChanges(values: CreateWarehouseFormValues) {
  return {
    timeZone: values.timeZone,
    cutoffMinute: values.cutoffMinute,
    operatingStartMinute: values.operatingStartMinute,
    operatingEndMinute: values.operatingEndMinute,
    name: values.name,
    address: values.address,
    provinceCode: values.provinceCode,
    ...(values.districtCode ? { districtCode: values.districtCode } : {}),
    wardCode: values.wardCode,
    latitude: values.latitude,
    longitude: values.longitude,
    dailyCapacity: values.dailyCapacity,
    contactName: values.contactName || null,
    contactPhone: values.contactPhone || null,
    contactEmail: values.contactEmail || null,
  };
}
