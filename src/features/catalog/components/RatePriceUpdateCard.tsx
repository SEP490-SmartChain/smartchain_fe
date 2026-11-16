import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card, CardHeader } from '@/components/Common/Card/Card';

import { jobErrorKey } from '../utils/rateDisplay';

import type { RateCollectionJob } from '../api/rateIntelligenceApi';

export interface RateUpdateAccount {
  id: string;
  carrierCode: string;
  carrierName: string;
}

interface RatePriceUpdateCardProps {
  accounts: RateUpdateAccount[];
  jobs: RateCollectionJob[];
  busyAccountId: string | null;
  notice: string;
  error: string;
  onUpdate: (accountIds: string[]) => void;
}

const STATUS_TONE = {
  SUCCEEDED: 'success',
  PARTIAL: 'warning',
  PENDING: 'info',
  RUNNING: 'info',
  FAILED: 'error',
} as const;

export function RatePriceUpdateCard({
  accounts,
  jobs,
  busyAccountId,
  notice,
  error,
  onUpdate,
}: RatePriceUpdateCardProps) {
  const t = useTranslations('RateIntelligence');
  const isBusy = busyAccountId !== null;
  const latestFor = (carrierCode: string) =>
    jobs.find((job) => job.source === 'SANDBOX_API' && job.carrier.code === carrierCode);

  return (
    <Card>
      <CardHeader
        title={t('updateTitle')}
        action={
          <Button
            type="button"
            isLoading={busyAccountId === 'all'}
            disabled={isBusy || accounts.length === 0}
            onClick={() => onUpdate(accounts.map((account) => account.id))}
          >
            {busyAccountId === 'all' ? t('updating') : t('updateAll')}
          </Button>
        }
      />

      {accounts.length === 0 ? (
        <Alert variant="info">{t('updateNoCarrier')}</Alert>
      ) : (
        <ul className="divide-y divide-[var(--sc-border-default)]">
          {accounts.map((account) => {
            const job = latestFor(account.carrierCode);
            const running = job?.status === 'PENDING' || job?.status === 'RUNNING';
            return (
              <li
                key={account.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[var(--sc-text-primary)]">
                      {account.carrierName}
                    </span>
                    {job ? (
                      <Badge status={STATUS_TONE[job.status]} label={t(`status_${job.status}`)} />
                    ) : null}
                    {job?.isSample ? <Badge status="default" label={t('sampleLabel')} /> : null}
                  </div>
                  <p className="text-sm text-[var(--sc-text-secondary)]">
                    {running
                      ? t('updateInProgress')
                      : job?.startedAt
                        ? `${t('updateLast', { time: new Date(job.startedAt).toLocaleString() })}${
                            job.recordCount > 0 && job.status !== 'FAILED'
                              ? ` · ${t('updateCount', { count: job.recordCount })}`
                              : ''
                          }`
                        : t('updateNever')}
                  </p>
                  {job && (job.status === 'FAILED' || job.status === 'PARTIAL') && job.errorCode ? (
                    <p className="text-sm text-[var(--sc-error-dark)]">
                      {t(`jobError_${jobErrorKey(job.errorCode)}`)}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  isLoading={busyAccountId === account.id}
                  disabled={isBusy || running}
                  onClick={() => onUpdate([account.id])}
                >
                  {t('updateOne')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {error ? (
        <Alert className="mt-3" variant="error">
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert className="mt-3" variant="success">
          {notice}
        </Alert>
      ) : null}
    </Card>
  );
}
