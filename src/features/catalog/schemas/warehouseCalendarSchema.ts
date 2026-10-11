import { z } from 'zod';

export function closedDateList(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((date) => date.trim())
    .filter(Boolean);
}

export function warehouseCalendarSchema(message: string) {
  return z.object({
    workingDays: z
      .array(z.number().int().min(1).max(7))
      .min(1, message)
      .max(7, message)
      .refine((days) => new Set(days).size === days.length, message),
    closedDatesText: z.string().refine((text) => {
      const dates = closedDateList(text);
      return (
        dates.length <= 366 &&
        new Set(dates).size === dates.length &&
        dates.every(
          (date) =>
            /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(date) &&
            Number.isFinite(Date.parse(date)) &&
            new Date(date).toISOString().slice(0, 10) === date,
        )
      );
    }, message),
  });
}
export type WarehouseCalendarForm = z.infer<ReturnType<typeof warehouseCalendarSchema>>;
