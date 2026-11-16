import { useCallback, useEffect, useRef, useState } from 'react';

import { CheckCircle2, Clock3, PackageCheck, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import { useAccess } from '@/hooks/useAccess';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';
import { useLocaleStore } from '@/stores/localeStore';

import { shipmentApi } from '../api/shipmentApi';

import type { SlaException } from '../schemas/shipmentSchema';

function getLoadError(
  failure: unknown,
  messages: {
    network: string;
    permission: string;
    invalidResponse: string;
    general: string;
  },
) {
  if (failure instanceof ApiError) {
    if (failure.status === 0) return messages.network;
    if (failure.status === 403) return messages.permission;
  }
  if (failure instanceof Error && failure.name === 'ZodError') return messages.invalidResponse;
  return messages.general;
}

/**
 * SS-1319 / UC-104: overdue handover and stalled carrier progress for platform operators.
 * Breaches close automatically when the parcel is handed over or the carrier reports progress.
 */
export function SlaExceptionsPanel() {
  const t = useTranslations('SlaExceptions');
  const { can } = useAccess();
  const locale = useLocaleStore((state) => state.locale);
  const authRevision = useAuthStore((state) => state.revision);
  const [isOpenOnly, setIsOpenOnly] = useState(true);
  const [items, setItems] = useState<SlaException[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const loadErrorMessage = t('loadError');
  const networkErrorMessage = t('networkError');
  const permissionErrorMessage = t('permissionError');
  const invalidResponseMessage = t('invalidResponse');
  const generalErrorMessage = t('loadErrorDetail');
  const canAssign = can('shipments.sla.assign');

  const localeTag = locale === 'vi' ? 'vi-VN' : 'en-US';
  const formatTime = (value: string | null) =>
    value ? new Date(value).toLocaleString(localeTag) : '—';

  const load = useCallback(
    async (before: string | null) => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      setIsLoading(true);
      setError(null);
      try {
        const page = await shipmentApi.slaExceptions(isOpenOnly, before, abort.signal);
        if (abort.signal.aborted) return;
        setItems((current) => (before ? [...current, ...page.items] : page.items));
        setNextCursor(page.pagination.nextCursor);
      } catch (failure) {
        if (!abort.signal.aborted) {
          setError(
            getLoadError(failure, {
              network: networkErrorMessage,
              permission: permissionErrorMessage,
              invalidResponse: invalidResponseMessage,
              general: generalErrorMessage,
            }),
          );
        }
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    },
    [
      generalErrorMessage,
      invalidResponseMessage,
      isOpenOnly,
      networkErrorMessage,
      permissionErrorMessage,
    ],
  );

  useEffect(() => {
    void load(null);
    return () => controller.current?.abort();
  }, [load, authRevision]);

  const handleAssign = async (row: SlaException) => {
    setAssigningId(row.id);
    setActionError(null);
    const revision = useAuthStore.getState().revision;
    try {
      await shipmentApi.assignSlaException(row.id);
      if (revision !== useAuthStore.getState().revision) return;
      await load(null);
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : t('assignError'));
    } finally {
      setAssigningId(null);
    }
  };

  const handleRetryLabel = async (row: SlaException) => {
    setAssigningId(row.id);
    setActionError(null);
    const revision = useAuthStore.getState().revision;
    try {
      await shipmentApi.retryLabelException(row.id);
      if (revision !== useAuthStore.getState().revision) return;
      await load(null);
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : t('retryLabelError'));
    } finally {
      setAssigningId(null);
    }
  };

  const columns: ColumnDef<SlaException>[] = [
    {
      key: 'reason',
      label: t('reason'),
      render: (row) =>
        t(
          `reasonCode.${row.reasonCode === 'SLA.HANDOVER_OVERDUE' ? 'HANDOVER' : row.reasonCode === 'SLA.TRACKING_STALLED' ? 'STALLED' : 'LABEL'}`,
        ),
    },
    { key: 'warehouseCode', label: t('warehouse') },
    {
      key: 'reference',
      label: t('reference'),
      render: (row) => row.trackingNumber ?? row.aggregateId.slice(0, 8),
    },
    {
      key: 'clock',
      label: t('clock'),
      render: (row) =>
        row.reasonCode === 'SLA.HANDOVER_OVERDUE'
          ? t('deadlineValue', { time: formatTime(row.deadline) })
          : row.reasonCode === 'SLA.TRACKING_STALLED'
            ? t('stalledValue', {
                time: formatTime(row.lastProgressAt),
                hours: row.stallHours ?? 0,
              })
            : formatTime(row.createdAt),
    },
    {
      key: 'status',
      label: t('state'),
      render: (row) => (
        <Badge
          status={row.status === 'RESOLVED' ? 'success' : row.isAssigned ? 'info' : 'warning'}
          label={
            row.status === 'RESOLVED'
              ? t('resolved')
              : row.reasonCode === 'DISPATCH.LABEL_RETRIES_EXHAUSTED' &&
                  row.isAssignedToMe &&
                  !row.canRetryLabel
                ? t('retryScheduled')
                : row.isAssignedToMe
                  ? t('mine')
                  : row.isAssigned
                    ? t('assigned')
                    : t('open')
          }
        />
      ),
    },
    { key: 'createdAt', label: t('detectedAt'), render: (row) => formatTime(row.createdAt) },
    {
      key: 'actions',
      label: t('actions'),
      render: (row) =>
        canAssign &&
        row.reasonCode === 'DISPATCH.LABEL_RETRIES_EXHAUSTED' &&
        row.isAssignedToMe &&
        row.canRetryLabel ? (
          <Button
            size="sm"
            variant="outline"
            isLoading={assigningId === row.id}
            onClick={() => void handleRetryLabel(row)}
          >
            {t('retryLabel')}
          </Button>
        ) : canAssign && row.status !== 'RESOLVED' && !row.isAssigned ? (
          <Button
            size="sm"
            variant="outline"
            isLoading={assigningId === row.id}
            onClick={() => void handleAssign(row)}
          >
            {t('assign')}
          </Button>
        ) : null,
    },
  ];

  return (
    <section aria-labelledby="sla-exceptions-title">
      <Card padding="none" className="overflow-hidden">
        <div className="flex flex-col justify-between gap-5 border-b border-[var(--sc-border-default)] p-5 sm:flex-row sm:items-start sm:p-6">
          <div className="flex min-w-0 gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]">
              <Clock3 aria-hidden="true" size={21} />
            </span>
            <div className="min-w-0">
              <h1 id="sla-exceptions-title" className="text-xl font-semibold">
                {t('title')}
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-[var(--sc-text-secondary)]">
                {t('description')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <Checkbox
              label={t('openOnly')}
              checked={isOpenOnly}
              onChange={(event) => setIsOpenOnly(event.target.checked)}
            />
            <Button variant="secondary" onClick={() => void load(null)} disabled={isLoading}>
              {t('refresh')}
            </Button>
          </div>
        </div>

        <div className="grid gap-px bg-[var(--sc-border-default)] md:grid-cols-2">
          <article className="flex gap-3 bg-[var(--sc-bg-surface)] px-5 py-3 sm:px-6">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-warning-bg)] text-[var(--sc-warning-dark)]">
              <PackageCheck aria-hidden="true" size={18} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[var(--sc-text-primary)]">
                {t('handoverTitle')}
              </h3>
              <p className="mt-0.5 text-sm text-[var(--sc-text-secondary)]">
                {t('handoverDescription')}
              </p>
            </div>
          </article>
          <article className="flex gap-3 bg-[var(--sc-bg-surface)] px-5 py-3 sm:px-6">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-info-bg)] text-[var(--sc-info-dark)]">
              <Truck aria-hidden="true" size={18} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[var(--sc-text-primary)]">
                {t('trackingTitle')}
              </h3>
              <p className="mt-0.5 text-sm text-[var(--sc-text-secondary)]">
                {t('trackingDescription')}
              </p>
            </div>
          </article>
        </div>
        {actionError && (
          <div className="p-4 pb-0 sm:px-6">
            <Alert variant="error" onClose={() => setActionError(null)}>
              {actionError}
            </Alert>
          </div>
        )}
        {error ? (
          <div className="p-4 sm:p-6">
            <Alert variant="error" title={loadErrorMessage}>
              <p>{error}</p>
              <Button size="sm" variant="outline" onClick={() => void load(null)}>
                {t('refresh')}
              </Button>
            </Alert>
          </div>
        ) : (
          <DataTable
            ariaLabel={t('tableLabel')}
            columns={columns}
            data={items}
            isLoading={isLoading && items.length === 0}
            getRowKey={(row) => row.id}
            emptyMessage={
              <div className="mx-auto flex max-w-md items-start justify-center gap-3 text-left">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--sc-success-bg)] text-[var(--sc-success-dark)]">
                  <CheckCircle2 aria-hidden="true" size={19} />
                </span>
                <span>
                  <span className="block font-medium text-[var(--sc-text-primary)]">
                    {t('emptyTitle')}
                  </span>
                  <span className="mt-1 block text-sm text-[var(--sc-text-secondary)]">
                    {t('empty')}
                  </span>
                </span>
              </div>
            }
          />
        )}
        {nextCursor && !error && (
          <div className="border-t border-[var(--sc-border-default)] p-3 text-center">
            <Button variant="ghost" isLoading={isLoading} onClick={() => void load(nextCursor)}>
              {t('loadMore')}
            </Button>
          </div>
        )}
      </Card>
    </section>
  );
}
