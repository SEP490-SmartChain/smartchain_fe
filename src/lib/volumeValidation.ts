import { z } from 'zod';

const decimalVolume = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/;

export const storageVolumeSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(',', '.'))
  .pipe(z.string().regex(decimalVolume, 'invalid'));

export const positiveStorageVolumeSchema = storageVolumeSchema.refine(
  (value) => /[1-9]/.test(value),
  'positive',
);

export function formatCapacityDecimal(value: string, locale: string): string {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return value;

  const [whole, fraction] = value.split('.');
  const formatter = new Intl.NumberFormat(locale);
  const integer = formatter.format(BigInt(whole));
  const significantFraction = fraction?.replace(/0+$/, '');
  if (!significantFraction) return integer;

  const separator = formatter.formatToParts(1.1).find((part) => part.type === 'decimal');
  return `${integer}${separator?.value ?? '.'}${significantFraction}`;
}
