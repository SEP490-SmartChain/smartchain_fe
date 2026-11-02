import { useCallback, useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { useAuthStore } from '@/stores/authStore';

import { carrierSettlementApi } from '../api/carrierSettlementApi';
import {
  disputeOpenSchema,
  isDisputable,
  isManuallyMatchable,
  manualMatchSchema,
  type DisputeOpenOutput,
  type DisputeOpenValues,
  type ManualMatchValues,
} from '../schemas/settlementReviewSchema';

import type { SettlementBatch, SettlementRecord } from '../types/carrierSettlement.types';

interface SettlementExceptionsModalProps {
  batch: SettlementBatch;
  formatMoney: (value: string | null) => string;
  onClose: () => void;
  /** Called after a server-confirmed change so the batch totals are reloaded. */
  onChanged: (message: string) => void;
}

interface ManualMatchFormProps {
  batch: SettlementBatch;
  record: SettlementRecord;
  onDone: (message: string) => void;
  onCancel: () => void;
}

interface OpenDisputeFormProps {
  batch: SettlementBatch;
  rowNumbers: number[];
  onDone: (message: string) => void;
  onCancel: () => void;
}

function errorMessage(failure: unknown, fallback: string): string {
  return failure instanceof Error ? failure.message : fallback;
}

function ManualMatchForm({ batch, record, onDone, onCancel }: ManualMatchFormProps) {
  const t = useTranslations('CarrierSettlement');
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ManualMatchValues>({
    resolver: zodResolver(manualMatchSchema),
    defaultValues: { trackingNumber: '', reason: '' },
  });

  const handleMatch = handleSubmit(async (values) => {
    setError(null);
    const revision = useAuthStore.getState().revision;
    try {
      const result = await carrierSettlementApi.match(batch.id, record.rowNumber, values);
      if (revision !== useAuthStore.getState().revision) return;
      onDone(t('matched', { row: result.rowNumber }));
    } catch (failure) {
      setError(errorMessage(failure, t('matchError')));
    }
  });

  return (
    <form onSubmit={handleMatch} className="space-y-3" noValidate>
      <p className="text-sm text-[var(--sc-text-secondary)]">
        {t('matchHelp', { row: record.rowNumber, waybill: record.trackingNumber || '—' })}
      </p>
      <Input
        label={t('matchTracking')}
        autoComplete="off"
        error={errors.trackingNumber ? t('matchTrackingInvalid') : undefined}
        {...register('trackingNumber')}
      />
      <Input
        label={t('matchReason')}
        autoComplete="off"
        error={errors.reason ? t('matchReasonInvalid') : undefined}
        {...register('reason')}
      />
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          {t('cancel')}
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          {t('matchSubmit')}
        </Button>
      </div>
    </form>
  );
}

function OpenDisputeForm({ batch, rowNumbers, onDone, onCancel }: OpenDisputeFormProps) {
  const t = useTranslations('CarrierSettlement');
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DisputeOpenValues, unknown, DisputeOpenOutput>({
    resolver: zodResolver(disputeOpenSchema),
    defaultValues: { externalTicketRef: '', note: '' },
  });

  const handleOpen = handleSubmit(async (parsed) => {
    setError(null);
    const revision = useAuthStore.getState().revision;
    try {
      const result = await carrierSettlementApi.openDispute({
        batchId: batch.id,
        rowNumbers,
        ...(parsed.externalTicketRef ? { externalTicketRef: parsed.externalTicketRef } : {}),
        ...(parsed.note ? { note: parsed.note } : {}),
      });
      if (revision !== useAuthStore.getState().revision) return;
      onDone(t('disputeOpened', { code: result.code, rows: result.records }));
    } catch (failure) {
      setError(errorMessage(failure, t('disputeError')));
    }
  });

  return (
    <form onSubmit={handleOpen} className="space-y-3" noValidate>
      <p className="text-sm text-[var(--sc-text-secondary)]">
        {t('disputeHelp', { rows: rowNumbers.length })}
      </p>
      <Input
        label={t('disputeTicket')}
        autoComplete="off"
        error={errors.externalTicketRef ? t('fieldTooLong') : undefined}
        {...register('externalTicketRef')}
      />
      <Input
        label={t('disputeNote')}
        autoComplete="off"
        error={errors.note ? t('fieldTooLong') : undefined}
        {...register('note')}
      />
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          {t('cancel')}
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          {t('disputeSubmit')}
        </Button>
      </div>
    </form>
  );
}

/** SS-1288 / UC-140–143: review exception rows, match them manually or dispute them with the carrier. */
export function SettlementExceptionsModal({
  batch,
  formatMoney,
  onClose,
  onChanged,
}: SettlementExceptionsModalProps) {
  const t = useTranslations('CarrierSettlement');
  const [records, setRecords] = useState<SettlementRecord[]>([]);
  const [nextRow, setNextRow] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [matching, setMatching] = useState<SettlementRecord | null>(null);
  const [isDisputing, setIsDisputing] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const loadErrorMessage = t('loadError');
  const isOpen = batch.status === 'PROCESSING';

  const load = useCallback(
    async (afterRow: number, shouldAppend: boolean) => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      setIsLoading(true);
      setError(null);
      try {
        const page = await carrierSettlementApi.exceptions(batch.id, afterRow, abort.signal);
        if (abort.signal.aborted) return;
        setRecords((current) => (shouldAppend ? [...current, ...page.items] : page.items));
        setNextRow(page.pagination.nextCursor ? Number(page.pagination.nextCursor) : null);
      } catch (failure) {
        if (!abort.signal.aborted) setError(errorMessage(failure, loadErrorMessage));
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    },
    [batch.id, loadErrorMessage],
  );

  useEffect(() => {
    void load(0, false);
    return () => controller.current?.abort();
  }, [load]);

  // Row errors arrive as INVALID_ROW:<reason>; unknown codes are shown as received, never hidden.
  const describeDiscrepancy = (code: string) => {
    if (code.startsWith('INVALID_ROW:')) {
      const reason = code.slice('INVALID_ROW:'.length);
      return t('discrepancy.INVALID_ROW', {
        reason: t.has(`rowError.${reason}`) ? t(`rowError.${reason}`) : reason,
      });
    }
    return t.has(`discrepancy.${code}`) ? t(`discrepancy.${code}`) : code;
  };

  const handleToggle = (rowNumber: number, isChecked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (isChecked) next.add(rowNumber);
      else next.delete(rowNumber);
      return next;
    });
  };

  const handleDone = (message: string) => {
    setMatching(null);
    setIsDisputing(false);
    setSelected(new Set());
    onChanged(message);
    void load(0, false);
  };

  const columns: ColumnDef<SettlementRecord>[] = [
    {
      key: 'select',
      label: t('select'),
      render: (row) =>
        isDisputable(row) ? (
          <Checkbox
            aria-label={t('selectRow', { row: row.rowNumber })}
            checked={selected.has(row.rowNumber)}
            onChange={(event) => handleToggle(row.rowNumber, event.target.checked)}
          />
        ) : null,
    },
    { key: 'rowNumber', label: t('row') },
    { key: 'trackingNumber', label: t('waybill') },
    {
      key: 'matchStatus',
      label: t('result'),
      render: (row) => (
        <span>
          {t.has(`status.${row.matchStatus}`) ? t(`status.${row.matchStatus}`) : row.matchStatus}
          {row.discrepancies.length > 0 &&
            ` · ${row.discrepancies.map(describeDiscrepancy).join(', ')}`}
        </span>
      ),
    },
    {
      key: 'fee',
      label: t('fee'),
      render: (row) => `${formatMoney(row.actualFeeVnd)} / ${formatMoney(row.expectedFeeVnd)}`,
    },
    {
      key: 'cod',
      label: t('cod'),
      render: (row) => `${formatMoney(row.collectedCodVnd)} / ${formatMoney(row.expectedCodVnd)}`,
    },
    {
      key: 'actions',
      label: t('actions'),
      render: (row) =>
        isOpen && isManuallyMatchable(row.matchStatus) ? (
          <Button size="sm" variant="ghost" onClick={() => setMatching(row)}>
            {t('matchAction')}
          </Button>
        ) : null,
    },
  ];

  const title = matching
    ? t('matchTitle')
    : isDisputing
      ? t('disputeTitle')
      : t('exceptionsTitle', { file: batch.fileName });

  return (
    <Modal isOpen onClose={onClose} title={title} width="960px">
      {matching ? (
        <ManualMatchForm
          batch={batch}
          record={matching}
          onDone={handleDone}
          onCancel={() => setMatching(null)}
        />
      ) : isDisputing ? (
        <OpenDisputeForm
          batch={batch}
          rowNumbers={[...selected].sort((a, b) => a - b)}
          onDone={handleDone}
          onCancel={() => setIsDisputing(false)}
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('exceptionsHelp')}</p>
          {error ? (
            <Alert variant="error">{error}</Alert>
          ) : (
            <DataTable
              ariaLabel={t('exceptionsLabel')}
              columns={columns}
              data={records}
              isLoading={isLoading && records.length === 0}
              getRowKey={(row) => row.rowNumber}
              emptyMessage={t('noExceptions')}
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="outline"
              disabled={selected.size === 0}
              onClick={() => setIsDisputing(true)}
            >
              {t('disputeAction', { rows: selected.size })}
            </Button>
            {nextRow !== null && !error && (
              <Button
                variant="ghost"
                isLoading={isLoading}
                onClick={() => void load(nextRow, true)}
              >
                {t('loadMore')}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
