import { z } from 'zod';

export const DAY_MS = 86_400_000;

export const calendarDateSchema = z.iso.date().refine((value) => !value.startsWith('0000'));

const vietnamDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function vietnamToday(now = new Date()): string {
  return vietnamDateFormatter.format(now);
}

export function localDateTimeInput(date: Date, precision: 'minute' | 'second' = 'minute'): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${day}T${time}${precision === 'second' ? `:${pad(date.getSeconds())}` : ''}`;
}

const localDateTimePattern =
  /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/;

export function parseLocalDateTime(
  value: string,
  zone: 'local' | 'vietnam' = 'local',
): Date | null {
  const match = localDateTimePattern.exec(value);
  if (!match || !calendarDateSchema.safeParse(match[1]).success) return null;

  const instant = new Date(zone === 'vietnam' ? `${value}+07:00` : value);
  if (!Number.isFinite(instant.getTime())) return null;
  if (zone === 'local' && localDateTimeInput(instant) !== value.slice(0, 16)) return null;
  return instant;
}

export const localDateTimeSchema = z.string().refine((value) => parseLocalDateTime(value) !== null);
export const optionalLocalDateTimeSchema = z.union([z.literal(''), localDateTimeSchema]);

export function isRecordedLocalDateTime(value: string, now = new Date()): boolean {
  const instant = parseLocalDateTime(value);
  return instant !== null && instant <= now;
}

export const recordedLocalDateTimeSchema = z
  .string()
  .refine((value) => isRecordedLocalDateTime(value));

export function calendarRangeIssue(from: string, to: string) {
  if (from && !calendarDateSchema.safeParse(from).success) {
    return { field: 'from', message: 'invalidDate' } as const;
  }
  if (to && !calendarDateSchema.safeParse(to).success) {
    return { field: 'to', message: 'invalidDate' } as const;
  }
  if (from && to && from > to) return { field: 'to', message: 'dateOrder' } as const;
  return null;
}

export function reportIncompleteDateInput(form: HTMLFormElement): boolean {
  for (const input of form.querySelectorAll<HTMLInputElement>(
    'input[type="date"], input[type="datetime-local"]',
  )) {
    if (!input.willValidate || !input.validity.badInput) continue;
    input.reportValidity();
    return true;
  }
  return false;
}
