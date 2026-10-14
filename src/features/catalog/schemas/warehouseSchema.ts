import { z } from 'zod';

export function getCreateWarehouseSchema(t: (key: string) => string) {
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
      // Two-level addresses have no district; legacy warehouses keep theirs until the address changes.
      districtCode: z.string().max(20).optional().or(z.literal('')),
      wardCode: z.string().min(1, t('requiredError')),
      // No sample coordinates: empty input must fail instead of defaulting to a city centre.
      latitude: z
        .number({ error: t('locationRequired') })
        .min(-90)
        .max(90),
      longitude: z
        .number({ error: t('locationRequired') })
        .min(-180)
        .max(180),
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

interface AddressSnapshot {
  provinceCode: string;
  wardCode: string;
  districtCode: string | null;
}

/**
 * Explicit allowlist preserves immutable warehouse code and server ownership. The address is
 * sent only when it really changed, so an hours/contact edit never rewrites a legacy address;
 * when it changed, districtCode is sent as null to clear the old district (two-level model).
 */
export function toWarehouseChanges(values: CreateWarehouseFormValues, original?: AddressSnapshot) {
  const addressChanged =
    !original ||
    original.provinceCode !== values.provinceCode ||
    original.wardCode !== values.wardCode;
  return {
    timeZone: values.timeZone,
    cutoffMinute: values.cutoffMinute,
    operatingStartMinute: values.operatingStartMinute,
    operatingEndMinute: values.operatingEndMinute,
    name: values.name,
    address: values.address,
    ...(addressChanged
      ? { provinceCode: values.provinceCode, wardCode: values.wardCode, districtCode: null }
      : {}),
    latitude: values.latitude,
    longitude: values.longitude,
    dailyCapacity: values.dailyCapacity,
    contactName: values.contactName || null,
    contactPhone: values.contactPhone || null,
    contactEmail: values.contactEmail || null,
  };
}
