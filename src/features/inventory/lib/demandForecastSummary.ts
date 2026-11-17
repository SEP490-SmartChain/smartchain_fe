import type { ForecastRun } from '../api/demandForecastApi';

export interface ForecastPoint {
  date: string;
  units: number;
}

export interface DemandForecastSummary {
  /** Sum of the formula forecast built from ORCA sales only, or null without history. */
  baselineTotal: number | null;
  /** Sum of the AI forecast (market-adjusted or model output), or null when absent. */
  aiTotal: number | null;
  /** Units actually sold in the last 30 history days. */
  recentTotal: number | null;
  periodStart: string | null;
  periodEnd: string | null;
}

export const FORECAST_DAILY_LIMIT = 20;
const RECENT_DAYS = 30;

export const sumUnits = (points: readonly ForecastPoint[]) =>
  points.reduce((total, point) => total + point.units, 0);

export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Rounded percentage change, or null when there is nothing to compare with. */
export function percentChange(value: number, reference: number | null): number | null {
  return reference ? Math.round(((value - reference) / reference) * 100) : null;
}

/** ISO weekdays (1 = Monday) clearly above the weekly mean, busiest first, at most two. */
export function peakWeekdays(points: readonly ForecastPoint[]): number[] {
  const byDay = new Map<number, { total: number; count: number }>();
  for (const point of points) {
    const day = isoWeekday(point.date);
    const entry = byDay.get(day) ?? { total: 0, count: 0 };
    byDay.set(day, { total: entry.total + point.units, count: entry.count + 1 });
  }
  const averages = [...byDay.entries()].map(([day, { total, count }]) => ({
    day,
    average: total / count,
  }));
  if (averages.length < 7) return [];
  const overall = averages.reduce((total, entry) => total + entry.average, 0) / averages.length;
  return averages
    .filter((entry) => entry.average >= overall * 1.15)
    .sort((left, right) => right.average - left.average || left.day - right.day)
    .slice(0, 2)
    .map((entry) => entry.day);
}

export function summarizeForecast(run: ForecastRun): DemandForecastSummary {
  const forecast = run.result?.forecast ?? [];
  const baseline = run.result?.baseline ?? [];
  const recent = (run.result?.history ?? []).slice(-RECENT_DAYS);
  const period = baseline.length ? baseline : forecast;
  return {
    baselineTotal: baseline.length ? sumUnits(baseline) : null,
    aiTotal: run.status === 'PREDICTED' && forecast.length ? sumUnits(forecast) : null,
    recentTotal: recent.length === RECENT_DAYS ? sumUnits(recent) : null,
    periodStart: period[0]?.date ?? null,
    periodEnd: period.at(-1)?.date ?? null,
  };
}

/** Runs created on the given Vietnam business date count toward the daily quota. */
export function forecastsLeftToday(runs: readonly ForecastRun[], today: string): number {
  const used = runs.filter((run) => run.forecastStartDate === today).length;
  return Math.max(0, FORECAST_DAILY_LIMIT - used);
}

export function vietnamToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const field = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${field('year')}-${field('month')}-${field('day')}`;
}
