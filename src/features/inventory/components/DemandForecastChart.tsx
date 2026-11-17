import { useMemo } from 'react';

import { useTranslations } from 'next-intl';

import { sumUnits, type ForecastPoint } from '../lib/demandForecastSummary';

interface DemandForecastChartProps {
  /** Daily sales, oldest first; the last 30 days are shown. */
  history: readonly ForecastPoint[];
  /** AI forecast for the next 30 days; empty when there is none. */
  forecast: readonly ForecastPoint[];
  formatNumber: (value: number) => string;
  formatDate: (date: string) => string;
}

interface Block {
  from: string;
  to: string;
  total: number;
}

/** 30 days split into 5 blocks of 6 days, so the blocks add up to the 30-day totals. */
const DAYS = 30;
const BLOCK_DAYS = 6;
const WIDTH = 760;
const HEIGHT = 250;
const TOP = 28;
const BOTTOM = 40;
const BAR = 54;
const GAP = 14;
const SIDE = 36;
const MIDDLE = 56;

function toBlocks(points: readonly ForecastPoint[]): Block[] {
  const blocks: Block[] = [];
  for (let start = 0; start + BLOCK_DAYS <= points.length; start += BLOCK_DAYS) {
    const slice = points.slice(start, start + BLOCK_DAYS);
    blocks.push({
      from: slice[0].date,
      to: slice.at(-1)?.date ?? slice[0].date,
      total: sumUnits(slice),
    });
  }
  return blocks;
}

/**
 * Plain comparison for non-technical readers: the last 30 days sold next to the next 30 days
 * forecast, in matching blocks of 6 days, with the number written on every bar.
 */
export function DemandForecastChart({
  history,
  forecast,
  formatNumber,
  formatDate,
}: DemandForecastChartProps) {
  const t = useTranslations('DemandForecast');
  const past = useMemo(() => toBlocks(history.slice(-DAYS)), [history]);
  const future = useMemo(() => toBlocks(forecast.slice(0, DAYS)), [forecast]);
  const max = Math.max(1, ...past.map((b) => b.total), ...future.map((b) => b.total)) * 1.15;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const barHeight = (total: number) => Math.max(2, (total / max) * plotHeight);
  const groupWidth = (count: number) => count * BAR + Math.max(0, count - 1) * GAP;
  const futureStart = SIDE + groupWidth(past.length) + (future.length ? MIDDLE : 0);
  const width = future.length
    ? Math.max(WIDTH, futureStart + groupWidth(future.length) + SIDE)
    : Math.max(WIDTH / 2, SIDE * 2 + groupWidth(past.length));
  const pastTotal = past.reduce((total, block) => total + block.total, 0);
  const futureTotal = future.reduce((total, block) => total + block.total, 0);

  const bars = (blocks: Block[], startX: number, fill: string) =>
    blocks.map((block, index) => {
      const left = startX + index * (BAR + GAP);
      const height = barHeight(block.total);
      return (
        <g key={block.from}>
          <rect
            x={left}
            y={TOP + plotHeight - height}
            width={BAR}
            height={height}
            rx="6"
            fill={fill}
          />
          <text
            x={left + BAR / 2}
            y={TOP + plotHeight - height - 7}
            textAnchor="middle"
            fontSize="13"
            fontWeight="600"
            fill="var(--sc-text-primary)"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatNumber(Math.round(block.total))}
          </text>
          <text
            x={left + BAR / 2}
            y={HEIGHT - 20}
            textAnchor="middle"
            fontSize="10"
            fill="var(--sc-text-tertiary)"
          >
            {formatDate(block.from)}
          </text>
          <text
            x={left + BAR / 2}
            y={HEIGHT - 8}
            textAnchor="middle"
            fontSize="10"
            fill="var(--sc-text-tertiary)"
          >
            {`– ${formatDate(block.to)}`}
          </text>
        </g>
      );
    });

  if (past.length === 0 && future.length === 0) return null;

  return (
    <figure className="space-y-3">
      <figcaption className="space-y-2">
        <span className="block font-medium text-[var(--sc-text-primary)]">{t('chartTitle')}</span>
        <span className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-[var(--sc-text-secondary)] tabular-nums">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="size-3 rounded bg-[var(--sc-info)]" />
            {t('chartPast', { total: formatNumber(Math.round(pastTotal)) })}
          </span>
          {future.length > 0 && (
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="size-3 rounded bg-[var(--sc-primary)]" />
              {t('chartFuture', { total: formatNumber(Math.round(futureTotal)) })}
            </span>
          )}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={t('chartLabel')}
      >
        <title>{t('chartLabel')}</title>
        <line
          x1={SIDE / 2}
          x2={width - SIDE / 2}
          y1={TOP + plotHeight}
          y2={TOP + plotHeight}
          stroke="var(--sc-border-default)"
        />
        {bars(past, SIDE, 'var(--sc-info)')}
        {future.length > 0 && (
          <>
            <line
              x1={futureStart - MIDDLE / 2}
              x2={futureStart - MIDDLE / 2}
              y1={TOP - 8}
              y2={TOP + plotHeight}
              stroke="var(--sc-border-strong)"
              strokeDasharray="4 4"
            />
            <text
              x={futureStart - MIDDLE / 2}
              y={TOP - 14}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="var(--sc-text-secondary)"
            >
              {t('today')}
            </text>
            {bars(future, futureStart, 'var(--sc-primary)')}
          </>
        )}
      </svg>
      <p className="text-xs text-[var(--sc-text-tertiary)]">{t('chartHint')}</p>
    </figure>
  );
}
