export const END_OF_DAY_MINUTE = 1440;

/** 480 → "08:00". 1440 (end of day) has no HH:mm form and is handled by the caller. */
export function minuteToTime(minute: number): string {
  if (!Number.isInteger(minute) || minute < 0 || minute > 1439) return '';
  const hours = Math.floor(minute / 60);
  return `${String(hours).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/** "14:00" → 840; null for anything that is not a valid HH:mm. */
export function timeToMinute(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
