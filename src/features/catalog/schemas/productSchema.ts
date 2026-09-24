import { z } from 'zod';

import type { Product, UpdateProductInput } from '../types/product.types';

/** Ràng buộc theo SRS Report 3 §3.9.1, đồng bộ với `UpdateProductDto` phía BE. */
export const PRODUCT_MAX_WEIGHT_KG = 100;
export const PRODUCT_MAX_DIMENSION_CM = 200;
export const PRODUCT_MAX_NAME_LENGTH = 255;
/** Giới hạn phần nguyên của cột `declared_value` DECIMAL(14, 2). */
export const PRODUCT_MAX_DECLARED_VALUE = 999_999_999_999;

const GRAMS_PER_KG = 1000;
/** BE lưu cân nặng bằng gram nguyên, nên kg chỉ nhận tối đa 3 chữ số thập phân. */
const WEIGHT_KG_DECIMAL_PLACES = 3;
/** Cột kích thước là DECIMAL(8, 2). */
const DIMENSION_DECIMAL_PLACES = 2;

function hasAtMostDecimalPlaces(value: number, places: number): boolean {
  const scaled = value * 10 ** places;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/** Message là key trong namespace `ProductCatalog.validation`, component dịch khi hiển thị. */
const dimensionCmSchema = z
  .number({ error: 'numberRequired' })
  .gt(0, { message: 'mustBePositive' })
  .max(PRODUCT_MAX_DIMENSION_CM, { message: 'dimensionTooLarge' })
  .refine((value) => hasAtMostDecimalPlaces(value, DIMENSION_DECIMAL_PLACES), {
    message: 'dimensionDecimals',
  });

export const productEditFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'nameRequired' })
    .max(PRODUCT_MAX_NAME_LENGTH, { message: 'nameTooLong' }),
  weightKg: z
    .number({ error: 'numberRequired' })
    .gt(0, { message: 'mustBePositive' })
    .max(PRODUCT_MAX_WEIGHT_KG, { message: 'weightTooLarge' })
    .refine((value) => hasAtMostDecimalPlaces(value, WEIGHT_KG_DECIMAL_PLACES), {
      message: 'weightDecimals',
    }),
  lengthCm: dimensionCmSchema,
  widthCm: dimensionCmSchema,
  heightCm: dimensionCmSchema,
  declaredValue: z
    .number({ error: 'numberRequired' })
    .int({ message: 'declaredValueInteger' })
    .min(0, { message: 'declaredValueNegative' })
    .max(PRODUCT_MAX_DECLARED_VALUE, { message: 'declaredValueTooLarge' }),
  isActive: z.enum(['true', 'false'], { error: 'statusRequired' }),
});

export type ProductEditFormValues = z.infer<typeof productEditFormSchema>;

export function toProductEditFormValues(product: Product): ProductEditFormValues {
  return {
    name: product.name,
    weightKg: product.weightG / GRAMS_PER_KG,
    lengthCm: Number(product.lengthCm),
    widthCm: Number(product.widthCm),
    heightCm: Number(product.heightCm),
    declaredValue: Number(product.declaredValue),
    isActive: product.isActive ? 'true' : 'false',
  };
}

/** `expectedUpdatedAt` là token chống ghi đè: BE trả 409 nếu SKU đã đổi sau lần đọc này. */
export function toUpdateProductInput(
  values: ProductEditFormValues,
  expectedUpdatedAt: string,
): UpdateProductInput {
  return {
    name: values.name,
    weightG: Math.round(values.weightKg * GRAMS_PER_KG),
    lengthCm: values.lengthCm,
    widthCm: values.widthCm,
    heightCm: values.heightCm,
    declaredValue: values.declaredValue,
    isActive: values.isActive === 'true',
    expectedUpdatedAt,
  };
}
