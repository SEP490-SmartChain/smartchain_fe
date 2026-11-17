import { useMemo, useState } from 'react';

import { History } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';

import { sumUnits, type ForecastPoint } from '../lib/demandForecastSummary';

const LEVEL_DAYS = 28;

interface DemandHistoryDialogProps {
  history: readonly ForecastPoint[];
}

/** Daily sales the forecast was built from, so the seller can check it against their own records. */
export function DemandHistoryDialog({ history }: DemandHistoryDialogProps) {
  const t = useTranslations('DemandForecast');
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const number = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
    [locale],
  );
  const dayFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    [locale],
  );
  if (!history.length) return null;

  const recent = history.slice(-LEVEL_DAYS);
  const previous = history.slice(-2 * LEVEL_DAYS, -LEVEL_DAYS);
  const soldDays = history.filter((point) => point.units > 0).length;
  const newestFirst = [...history].reverse();
  const stats = [
    { label: t('historyTotal', { days: history.length }), value: number.format(sumUnits(history)) },
    { label: t('historySoldDays'), value: `${soldDays}/${history.length}` },
    {
      label: t('historyRecentAvg', { days: LEVEL_DAYS }),
      value: number.format(sumUnits(recent) / recent.length),
    },
    {
      label: t('historyPreviousAvg', { days: LEVEL_DAYS }),
      value: previous.length === LEVEL_DAYS ? number.format(sumUnits(previous) / LEVEL_DAYS) : '—',
    },
  ];

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
        <History aria-hidden="true" size={16} className="mr-1.5" />
        {t('historyOpen')}
      </Button>
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={t('historyTitle')}
        width="560px"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--sc-text-secondary)]">
            {t('historyIntro', { days: history.length })}
          </p>
          <dl className="grid grid-cols-2 gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-xl bg-[var(--sc-bg-secondary)] p-3">
                <dt className="text-xs text-[var(--sc-text-secondary)]">{stat.label}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">{stat.value}</dd>
              </div>
            ))}
          </dl>
          <div className="max-h-80 overflow-auto rounded-xl border border-[var(--sc-border-default)]">
            <table className="w-full text-left text-sm tabular-nums" aria-label={t('historyTable')}>
              <thead className="sticky top-0 bg-[var(--sc-bg-secondary)]">
                <tr>
                  <th className="px-4 py-2 font-medium">{t('tableDate')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('historyUnits')}</th>
                </tr>
              </thead>
              <tbody>
                {newestFirst.map((point) => (
                  <tr key={point.date} className="border-t border-[var(--sc-border-default)]">
                    <td className="px-4 py-2">
                      {dayFormat.format(new Date(`${point.date}T00:00:00Z`))}
                    </td>
                    <td className="px-4 py-2 text-right">{number.format(point.units)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[var(--sc-text-tertiary)]">{t('historyNote')}</p>
        </div>
      </Modal>
    </>
  );
}
