import { useMemo } from 'react';

import { useNavigate } from 'react-router-dom';

import { useLocale, useTranslations } from 'next-intl';

import { Alert, Badge, Button, Card } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';

import { DemandForecastChart } from './DemandForecastChart';
import { DemandHistoryDialog } from './DemandHistoryDialog';
import { DemandMarketInsight } from './DemandMarketInsight';
import {
  canRetryForecast,
  FORECAST_MAX_ATTEMPTS,
  isForecastPending,
  type ForecastRun,
} from '../api/demandForecastApi';
import {
  peakWeekdays,
  percentChange,
  summarizeForecast,
  sumUnits,
} from '../lib/demandForecastSummary';

interface DemandForecastResultProps {
  run: ForecastRun;
  productLabel: string;
  isBusy: boolean;
  onRetry: (jobId: string) => void;
}

/** Same window the sales-based formula uses for its level. */
const RECENT_AVERAGE_DAYS = 28;

/** Why no AI suggestion is shown next to the sales-based forecast. */
const AI_STATUS_VARIANT = {
  DISABLED: 'info',
  PROVIDER_UNAVAILABLE: 'warning',
  FAILED: 'error',
} as const;
type AiStatus = keyof typeof AI_STATUS_VARIANT;

function aiStatusOf(run: ForecastRun): AiStatus | null {
  if (run.status === 'PREDICTED') return run.result?.forecast?.length ? null : 'FAILED';
  return run.status in AI_STATUS_VARIANT ? (run.status as AiStatus) : null;
}

export function DemandForecastResult({
  run,
  productLabel,
  isBusy,
  onRetry,
}: DemandForecastResultProps) {
  const t = useTranslations('DemandForecast');
  const locale = useLocale();
  const { can } = useAccess();
  const navigate = useNavigate();
  const summary = useMemo(() => summarizeForecast(run), [run]);
  const number = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
    [locale],
  );
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', timeZone: 'UTC' }),
    [locale],
  );
  const weekdayFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }),
    [locale],
  );
  const formatDate = (date: string) => dateFormat.format(new Date(`${date}T00:00:00Z`));
  // 2024-01-01 is a Monday, so day N maps to an ISO weekday.
  const weekdayName = (isoDay: number) => weekdayFormat.format(new Date(Date.UTC(2024, 0, isoDay)));
  const history = run.result?.history ?? [];
  const baseline = run.result?.baseline ?? [];
  const recentHistory = history.slice(-RECENT_AVERAGE_DAYS);
  const aiForecast = summary.aiTotal === null ? [] : (run.result?.forecast ?? []);
  const market = run.result?.market;
  const displayed = aiForecast;
  const displayedTotal = sumUnits(displayed);
  const change = percentChange(displayedTotal, summary.recentTotal);
  const peaks = peakWeekdays(displayed);
  const attemptsLeft = FORECAST_MAX_ATTEMPTS - run.attempts;
  const aiStatus = aiStatusOf(run);

  if (isForecastPending(run)) {
    return (
      <Card className="space-y-4" aria-busy="true">
        <ResultHeading productLabel={productLabel} region={t(run.region)} />
        <div role="status" className="space-y-3">
          <p className="font-medium">{t('pendingTitle')}</p>
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('pendingBody')}</p>
          <div className="h-40 animate-pulse rounded-xl bg-[var(--sc-bg-secondary)] motion-reduce:animate-none" />
        </div>
      </Card>
    );
  }

  if (!baseline.length) {
    return (
      <Card className="space-y-4">
        <ResultHeading productLabel={productLabel} region={t(run.region)} />
        <Alert variant="info" title={t('INSUFFICIENT_DATA_title')}>
          {t('INSUFFICIENT_DATA_body')}
        </Alert>
      </Card>
    );
  }

  // This screen shows the AI result. Without it the sales-based number lives on the inventory screen.
  if (aiForecast.length === 0) {
    const status = aiStatus ?? 'FAILED';
    return (
      <Card className="space-y-5">
        <ResultHeading productLabel={productLabel} region={t(run.region)} />
        <Alert variant={AI_STATUS_VARIANT[status]} title={t(`${status}_title`)}>
          <p>{t(`${status}_body`)}</p>
          <p className="mt-1">{t('noAiResult')}</p>
          {canRetryForecast(run) && (
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              isLoading={isBusy}
              onClick={() => onRetry(run.jobId)}
            >
              {t('retryRun', { left: attemptsLeft })}
            </Button>
          )}
        </Alert>
        <div className="flex justify-end">
          <DemandHistoryDialog history={history} />
        </div>
        <DemandForecastChart
          history={history}
          forecast={[]}
          formatNumber={(value) => number.format(value)}
          formatDate={formatDate}
        />
      </Card>
    );
  }

  return (
    <Card className="space-y-6">
      <ResultHeading productLabel={productLabel} region={t(run.region)} />

      <section aria-labelledby="forecast-headline" className="space-y-4">
        <div>
          {summary.periodStart && summary.periodEnd && (
            <p className="text-sm text-[var(--sc-text-secondary)]">
              {t('period', {
                from: formatDate(summary.periodStart),
                to: formatDate(summary.periodEnd),
              })}
            </p>
          )}
          <h3
            id="forecast-headline"
            className="mt-1 text-3xl font-semibold tracking-tight tabular-nums"
          >
            {t('headline', { total: number.format(Math.round(displayedTotal)) })}
          </h3>
          <p className="mt-1 text-sm text-[var(--sc-text-secondary)] tabular-nums">
            {t('dailyAverage', { value: number.format(displayedTotal / 30) })} ·{' '}
            {t('sourceApplied')}
          </p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {summary.recentTotal !== null && change !== null && (
            <div className="rounded-xl bg-[var(--sc-bg-secondary)] p-4">
              <dt className="text-sm text-[var(--sc-text-secondary)]">{t('compareLabel')}</dt>
              <dd className="mt-1 font-medium tabular-nums">
                {change === 0
                  ? t('compareFlat', { recent: number.format(summary.recentTotal) })
                  : t(change > 0 ? 'compareUp' : 'compareDown', {
                      pct: Math.abs(change),
                      recent: number.format(summary.recentTotal),
                    })}
              </dd>
            </div>
          )}
          {peaks.length > 0 && (
            <div className="rounded-xl bg-[var(--sc-bg-secondary)] p-4">
              <dt className="text-sm text-[var(--sc-text-secondary)]">{t('peakLabel')}</dt>
              <dd className="mt-1 font-medium">{peaks.map(weekdayName).join(', ')}</dd>
            </div>
          )}
        </dl>
      </section>

      {market && summary.aiTotal !== null ? (
        <DemandMarketInsight
          insight={market}
          aiTotal={number.format(Math.round(summary.aiTotal))}
          calculation={{
            recentAverage:
              recentHistory.length === RECENT_AVERAGE_DAYS
                ? number.format(sumUnits(recentHistory) / RECENT_AVERAGE_DAYS)
                : null,
            baselineTotal: number.format(Math.round(sumUnits(baseline))),
            trend:
              summary.recentTotal !== null &&
              Math.round(sumUnits(baseline)) !== Math.round(summary.recentTotal)
                ? {
                    recent: number.format(summary.recentTotal),
                    direction: sumUnits(baseline) < summary.recentTotal ? 'DOWN' : 'UP',
                  }
                : null,
            factor: number.format(1 + market.adjustmentPct / 100),
          }}
        />
      ) : summary.aiTotal !== null ? (
        <Alert variant="info" title={t('modelTitle')}>
          <p className="tabular-nums">
            {t('modelSuggestion', { total: number.format(Math.round(summary.aiTotal)) })}
          </p>
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <DemandHistoryDialog history={history} />
      </div>

      <DemandForecastChart
        history={history}
        forecast={aiForecast}
        formatNumber={(value) => number.format(value)}
        formatDate={formatDate}
      />

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-[var(--sc-primary)]">
          {t('tableToggle')}
        </summary>
        <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-[var(--sc-border-default)]">
          <table className="w-full text-left text-sm tabular-nums" aria-label={t('tableLabel')}>
            <thead className="sticky top-0 bg-[var(--sc-bg-secondary)]">
              <tr>
                <th className="px-4 py-2 font-medium">{t('tableDate')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('tableBaseline')}</th>
                {aiForecast.length > 0 && (
                  <th className="px-4 py-2 text-right font-medium">{t('tableAi')}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {baseline.map((point, index) => (
                <tr key={point.date} className="border-t border-[var(--sc-border-default)]">
                  <td className="px-4 py-2">
                    {weekdayName(new Date(`${point.date}T00:00:00Z`).getUTCDay() || 7)},{' '}
                    {formatDate(point.date)}
                  </td>
                  <td className="px-4 py-2 text-right">{number.format(point.units)}</td>
                  {aiForecast.length > 0 && (
                    <td className="px-4 py-2 text-right">
                      {aiForecast[index] ? number.format(aiForecast[index].units) : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <section
        aria-labelledby="forecast-next"
        className="flex flex-col gap-3 border-t border-[var(--sc-border-default)] pt-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h3 id="forecast-next" className="text-base leading-6 font-medium">
            {t('nextTitle')}
          </h3>
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('nextBody')}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {can('inventory.view') && (
            <Button variant="outline" onClick={() => navigate('/inventory')}>
              {t('goInventory')}
            </Button>
          )}
          {can('asns.view') && <Button onClick={() => navigate('/asns')}>{t('goAsn')}</Button>}
        </div>
      </section>
    </Card>
  );
}

function ResultHeading({ productLabel, region }: { productLabel: string; region: string }) {
  return (
    <header className="flex flex-wrap items-center gap-2">
      <h2 className="text-lg leading-7 font-semibold">{productLabel}</h2>
      <Badge status="default" variant="solid" size="sm" label={region} />
    </header>
  );
}
