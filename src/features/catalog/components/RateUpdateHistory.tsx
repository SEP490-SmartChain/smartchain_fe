import { useTranslations } from 'next-intl';

import { Badge } from '@/components/Common/Badge/Badge';
import { Card, CardHeader } from '@/components/Common/Card/Card';

import { jobErrorKey } from '../utils/rateDisplay';

import type { RateCollectionJob } from '../api/rateIntelligenceApi';

interface RateUpdateHistoryProps {
  jobs: RateCollectionJob[];
}

const STATUS_TONE = {
  SUCCEEDED: 'success',
  PARTIAL: 'warning',
  PENDING: 'info',
  RUNNING: 'info',
  FAILED: 'error',
} as const;

export function RateUpdateHistory({ jobs }: RateUpdateHistoryProps) {
  const t = useTranslations('RateIntelligence');

  return (
    <Card padding="none">
      <div className="border-b border-[var(--sc-border-default)] p-5">
        <CardHeader
          className="mb-0"
          title={t('historyTitle')}
          description={t('historyDescription')}
        />
      </div>
      {jobs.length === 0 ? (
        <p className="p-6 text-sm text-[var(--sc-text-secondary)]">{t('historyEmpty')}</p>
      ) : (
        <ul className="divide-y divide-[var(--sc-border-default)]">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
            >
              <div>
                <p className="font-medium text-[var(--sc-text-primary)]">
                  {job.carrier.name}
                  {job.status === 'FAILED' ? '' : ` · ${job.recordCount} ${t('records')}`}
                </p>
                <p className="mt-1 text-xs text-[var(--sc-text-secondary)]">
                  {job.startedAt ? new Date(job.startedAt).toLocaleString() : t('notStarted')} ·{' '}
                  {job.source === 'CONTRACT_IMPORT'
                    ? t('historyKindImport')
                    : t('historyKindQuote')}
                </p>
                {job.errorCode ? (
                  <p className="mt-1 text-xs text-[var(--sc-error-dark)]">
                    {t(`jobError_${jobErrorKey(job.errorCode)}`)}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge status={STATUS_TONE[job.status]} label={t(`status_${job.status}`)} />
                {job.isSample ? <Badge status="default" label={t('sampleLabel')} /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
