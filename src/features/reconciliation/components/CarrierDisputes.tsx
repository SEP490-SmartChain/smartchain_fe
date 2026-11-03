import { useCallback, useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { Select } from '@/components/Common/Select/Select';
import { useAuthStore } from '@/stores/authStore';
import { useLocaleStore } from '@/stores/localeStore';

import { carrierSettlementApi } from '../api/carrierSettlementApi';
import {
  DISPUTE_STATUSES,
  disputeUpdateSchema,
  nextDisputeStatuses,
  type CarrierDispute,
  type CarrierDisputeDetail,
  type DisputeStatus,
  type DisputeUpdateOutput,
  type DisputeUpdateValues,
} from '../schemas/settlementReviewSchema';

interface DisputeDetailModalProps {
  disputeId: string;
  formatMoney: (value: string | null) => string;
  formatTime: (value: string) => string;
  onClose: () => void;
  onChanged: (message: string) => void;
}

const STATUS_BADGE: Record<DisputeStatus, 'info' | 'warning' | 'success' | 'error' | 'neutral'> = {
  OPEN: 'warning',
  SUBMITTED: 'info',
  ACKNOWLEDGED: 'info',
  RESOLVED: 'success',
  REJECTED: 'error',
};

function errorMessage(failure: unknown, fallback: string): string {
  return failure instanceof Error ? failure.message : fallback;
}

function DisputeDetailModal({
  disputeId,
  formatMoney,
  formatTime,
  onClose,
  onChanged,
}: DisputeDetailModalProps) {
  const t = useTranslations('CarrierDisputes');
  const [detail, setDetail] = useState<CarrierDisputeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const loadErrorMessage = t('loadError');
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DisputeUpdateValues, unknown, DisputeUpdateOutput>({
    resolver: zodResolver(disputeUpdateSchema),
    defaultValues: { status: '', externalTicketRef: '', resolvedAmountVnd: '', note: '' },
  });
  const chosenStatus = watch('status');

  const load = useCallback(async () => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setError(null);
    try {
      const result = await carrierSettlementApi.dispute(disputeId, abort.signal);
      if (!abort.signal.aborted) setDetail(result);
    } catch (failure) {
      if (!abort.signal.aborted) setError(errorMessage(failure, loadErrorMessage));
    }
  }, [disputeId, loadErrorMessage]);

  useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, [load]);

  const handleSave = handleSubmit(async (values) => {
    if (!detail) return;
    setSaveError(null);
    const revision = useAuthStore.getState().revision;
    try {
      // The expected version guards against a concurrent edit; a stale write returns 409.
      const result = await carrierSettlementApi.updateDispute(detail.id, {
        expectedVersion: detail.version,
        ...(values.status ? { status: values.status } : {}),
        ...(values.externalTicketRef ? { externalTicketRef: values.externalTicketRef } : {}),
        ...(values.status === 'RESOLVED' ? { resolvedAmountVnd: values.resolvedAmountVnd } : {}),
        ...(values.note ? { note: values.note } : {}),
      });
      if (revision !== useAuthStore.getState().revision) return;
      reset();
      onChanged(t('saved', { code: detail.code, status: t(`status.${result.status}`) }));
      await load();
    } catch (failure) {
      setSaveError(errorMessage(failure, t('saveError')));
    }
  });

  const nextStatuses = detail ? nextDisputeStatuses(detail.status) : [];
  const itemColumns: ColumnDef<CarrierDisputeDetail['items'][number]>[] = [
    { key: 'rowNumber', label: t('row') },
    { key: 'trackingNumber', label: t('waybill') },
    {
      key: 'discrepancies',
      label: t('discrepancies'),
      render: (row) => row.discrepancies.join(', ') || row.matchStatus,
    },
    { key: 'claimed', label: t('claimed'), render: (row) => formatMoney(row.claimedAmountVnd) },
  ];

  return (
    <Modal isOpen onClose={onClose} title={detail ? detail.code : t('detailTitle')} width="860px">
      {error ? (
        <Alert variant="error">{error}</Alert>
      ) : !detail ? (
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('loading')}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge status={STATUS_BADGE[detail.status]} label={t(`status.${detail.status}`)} />
            <span>{t('carrierValue', { carrier: detail.carrierCode })}</span>
            <span>{t('claimedValue', { amount: formatMoney(detail.claimedAmountVnd) })}</span>
            {detail.resolvedAmountVnd !== null && (
              <span>{t('resolvedValue', { amount: formatMoney(detail.resolvedAmountVnd) })}</span>
            )}
            {detail.externalTicketRef && (
              <span>{t('ticketValue', { ticket: detail.externalTicketRef })}</span>
            )}
          </div>
          <DataTable
            ariaLabel={t('itemsLabel')}
            columns={itemColumns}
            data={detail.items}
            getRowKey={(row) => row.rowNumber}
            emptyMessage={t('noItems')}
          />
          <section aria-labelledby="dispute-history">
            <h3 id="dispute-history" className="mb-2 text-sm font-semibold">
              {t('history')}
            </h3>
            <ol className="space-y-1 text-sm">
              {detail.events.map((event) => (
                <li
                  key={`${event.createdAt}-${event.kind}-${event.toStatus ?? ''}-${event.note ?? ''}`}
                >
                  <span className="text-[var(--sc-text-secondary)]">
                    {formatTime(event.createdAt)}
                  </span>{' '}
                  {event.kind === 'NOTE'
                    ? t('eventNote')
                    : t('eventStatus', {
                        status: event.toStatus ? t(`status.${event.toStatus}`) : '—',
                      })}
                  {event.note && ` — ${event.note}`}
                </li>
              ))}
            </ol>
          </section>
          <form onSubmit={handleSave} className="grid gap-3 md:grid-cols-2" noValidate>
            <Select
              label={t('nextStatus')}
              options={[
                { value: '', label: t('noteOnly') },
                ...nextStatuses.map((status) => ({ value: status, label: t(`status.${status}`) })),
              ]}
              {...register('status')}
            />
            <Input
              label={t('ticket')}
              autoComplete="off"
              error={errors.externalTicketRef ? t('fieldTooLong') : undefined}
              {...register('externalTicketRef')}
            />
            {chosenStatus === 'RESOLVED' && (
              <Input
                label={t('resolvedAmount')}
                inputMode="numeric"
                autoComplete="off"
                error={errors.resolvedAmountVnd ? t('resolvedAmountInvalid') : undefined}
                {...register('resolvedAmountVnd')}
              />
            )}
            <Input
              label={t('note')}
              autoComplete="off"
              error={errors.note ? t('noteRequired') : undefined}
              {...register('note')}
            />
            {saveError && (
              <Alert variant="error" className="md:col-span-2">
                {saveError}
              </Alert>
            )}
            <div className="flex justify-end md:col-span-2">
              <Button type="submit" isLoading={isSubmitting}>
                {t('save')}
              </Button>
            </div>
          </form>
        </div>
      )}
    </Modal>
  );
}

/** UC-143: carrier settlement disputes; resolution records the outcome, it never posts money. */
export function CarrierDisputes() {
  const t = useTranslations('CarrierDisputes');
  const locale = useLocaleStore((state) => state.locale);
  const authRevision = useAuthStore((state) => state.revision);
  const [status, setStatus] = useState<DisputeStatus | ''>('');
  const [items, setItems] = useState<CarrierDispute[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const loadErrorMessage = t('loadError');

  const localeTag = locale === 'vi' ? 'vi-VN' : 'en-US';
  const formatMoney = (value: string | null) =>
    value === null ? '—' : `${BigInt(value).toLocaleString(localeTag)} VND`;
  const formatTime = (value: string) => new Date(value).toLocaleString(localeTag);

  const load = useCallback(
    async (before: string | null) => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      setIsLoading(true);
      setError(null);
      try {
        const page = await carrierSettlementApi.disputes(
          { ...(status ? { status } : {}), before },
          abort.signal,
        );
        if (abort.signal.aborted) return;
        setItems((current) => (before ? [...current, ...page.items] : page.items));
        setNextCursor(page.pagination.nextCursor);
      } catch (failure) {
        if (!abort.signal.aborted) setError(errorMessage(failure, loadErrorMessage));
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    },
    [status, loadErrorMessage],
  );

  // Session/scope changes drop data loaded under the previous identity.
  useEffect(() => {
    void load(null);
    return () => controller.current?.abort();
  }, [load, authRevision]);

  const columns: ColumnDef<CarrierDispute>[] = [
    { key: 'code', label: t('code') },
    { key: 'carrierCode', label: t('carrier') },
    {
      key: 'status',
      label: t('state'),
      render: (row) => (
        <Badge status={STATUS_BADGE[row.status]} label={t(`status.${row.status}`)} />
      ),
    },
    { key: 'records', label: t('rows') },
    { key: 'claimed', label: t('claimed'), render: (row) => formatMoney(row.claimedAmountVnd) },
    {
      key: 'resolved',
      label: t('resolved'),
      render: (row) => formatMoney(row.resolvedAmountVnd),
    },
    { key: 'updatedAt', label: t('updatedAt'), render: (row) => formatTime(row.updatedAt) },
    {
      key: 'actions',
      label: t('actions'),
      render: (row) => (
        <Button size="sm" variant="ghost" onClick={() => setOpenId(row.id)}>
          {t('open')}
        </Button>
      ),
    },
  ];

  return (
    <section className="space-y-4" aria-labelledby="carrier-disputes-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="carrier-disputes-title" className="text-lg font-semibold">
            {t('title')}
          </h2>
          <p className="mt-1 text-sm text-[var(--sc-text-secondary)]">{t('description')}</p>
        </div>
        <div className="w-56">
          <Select
            label={t('filter')}
            value={status}
            options={[
              { value: '', label: t('allStatuses') },
              ...DISPUTE_STATUSES.map((value) => ({ value, label: t(`status.${value}`) })),
            ]}
            onChange={(event) => setStatus(event.target.value as DisputeStatus | '')}
          />
        </div>
      </div>
      {notice && (
        <Alert variant="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {error ? (
        <Alert variant="error" title={loadErrorMessage}>
          <Button size="sm" variant="outline" onClick={() => void load(null)}>
            {t('retry')}
          </Button>
        </Alert>
      ) : (
        <DataTable
          ariaLabel={t('tableLabel')}
          columns={columns}
          data={items}
          isLoading={isLoading && items.length === 0}
          getRowKey={(row) => row.id}
          emptyMessage={t('empty')}
        />
      )}
      {nextCursor && !error && (
        <div className="flex justify-center">
          <Button variant="ghost" isLoading={isLoading} onClick={() => void load(nextCursor)}>
            {t('loadMore')}
          </Button>
        </div>
      )}
      {openId && (
        <DisputeDetailModal
          key={openId}
          disputeId={openId}
          formatMoney={formatMoney}
          formatTime={formatTime}
          onClose={() => setOpenId(null)}
          onChanged={(message) => {
            setNotice(message);
            void load(null);
          }}
        />
      )}
    </section>
  );
}
