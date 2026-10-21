import { useCallback, useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import Modal from '@/components/Common/Modal/Modal';
import { Select } from '@/components/Common/Select/Select';
import { useAuthStore } from '@/stores/authStore';
import { useLocaleStore } from '@/stores/localeStore';

import { carrierSettlementApi } from '../api/carrierSettlementApi';
import { useSettlementBatches } from '../hooks/useSettlementBatches';
import {
  SETTLEMENT_CARRIERS,
  settlementUploadSchema,
  type SettlementUploadValues,
} from '../schemas/settlementUploadSchema';

import type { SettlementBatch, SettlementRecord } from '../types/carrierSettlement.types';

interface UploadFormProps {
  onUploaded: (message: string) => Promise<void>;
}

interface ExceptionsModalProps {
  batch: SettlementBatch;
  formatMoney: (value: string | null) => string;
  onClose: () => void;
}

function isBatchReady(batch: SettlementBatch): boolean {
  return (
    batch.status === 'PROCESSING' && batch.totalRows > 0 && batch.processedRows === batch.totalRows
  );
}

function SettlementUploadForm({ onUploaded }: UploadFormProps) {
  const t = useTranslations('CarrierSettlement');
  const authRevision = useAuthStore((state) => state.revision);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SettlementUploadValues>({
    resolver: zodResolver(settlementUploadSchema),
    defaultValues: { carrierCode: 'GHN' },
  });

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    return () => abort.abort();
  }, []);

  const handleUpload = handleSubmit(async ({ carrierCode, file }) => {
    const selected = file[0];
    if (!selected) return;
    setError(null);
    const isCurrent = () =>
      !controller.current?.signal.aborted && authRevision === useAuthStore.getState().revision;
    try {
      const result = await carrierSettlementApi.upload(
        carrierCode,
        selected,
        controller.current?.signal,
      );
      if (!isCurrent()) return;
      reset({ carrierCode });
      await onUploaded(
        result.duplicate ? t('duplicate') : t('uploaded', { rows: result.totalRows }),
      );
    } catch (failure) {
      if (isCurrent()) setError(failure instanceof Error ? failure.message : t('uploadError'));
    }
  });

  return (
    <form
      onSubmit={handleUpload}
      className="grid gap-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-4 md:grid-cols-[200px_1fr_auto] md:items-end"
      noValidate
    >
      <Select
        label={t('carrier')}
        options={SETTLEMENT_CARRIERS.map((code) => ({ value: code, label: code }))}
        {...register('carrierCode')}
      />
      <div>
        <label htmlFor="settlement-file" className="mb-1 block text-sm font-medium">
          {t('file')}
        </label>
        <input
          id="settlement-file"
          type="file"
          accept=".csv,text/csv"
          className="block w-full text-sm"
          aria-invalid={errors.file ? true : undefined}
          aria-describedby="settlement-file-help"
          {...register('file')}
        />
        <p
          id="settlement-file-help"
          className={`mt-1 text-xs ${errors.file ? 'text-[var(--sc-error)]' : 'text-[var(--sc-text-secondary)]'}`}
        >
          {errors.file ? t('fileInvalid') : t('fileHelp')}
        </p>
      </div>
      <Button type="submit" isLoading={isSubmitting}>
        {t('upload')}
      </Button>
      {error && (
        <Alert variant="error" className="md:col-span-3">
          {error}
        </Alert>
      )}
    </form>
  );
}

function ExceptionsModal({ batch, formatMoney, onClose }: ExceptionsModalProps) {
  const t = useTranslations('CarrierSettlement');
  const [records, setRecords] = useState<SettlementRecord[]>([]);
  const [nextRow, setNextRow] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const loadErrorMessage = t('loadError');

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
        if (!abort.signal.aborted)
          setError(failure instanceof Error ? failure.message : loadErrorMessage);
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

  const columns: ColumnDef<SettlementRecord>[] = [
    { key: 'rowNumber', label: t('row') },
    { key: 'trackingNumber', label: t('waybill') },
    {
      key: 'matchStatus',
      label: t('result'),
      render: (row) => (
        <span>
          {t(`status.${row.matchStatus}`)}
          {row.discrepancies.length > 0 &&
            ` · ${row.discrepancies.map((d) => t(`discrepancy.${d}`)).join(', ')}`}
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
  ];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('exceptionsTitle', { file: batch.fileName })}
      width="860px"
    >
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
        {nextRow !== null && !error && (
          <div className="flex justify-center">
            <Button variant="ghost" isLoading={isLoading} onClick={() => void load(nextRow, true)}>
              {t('loadMore')}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** SS-1288 / UC-137–141: upload carrier settlement files, review exceptions, complete and lock. */
export function CarrierSettlementBatches() {
  const t = useTranslations('CarrierSettlement');
  const locale = useLocaleStore((state) => state.locale);
  const authRevision = useAuthStore((state) => state.revision);
  const { batches, error, isLoading, isLoadingMore, hasNextPage, refetch, loadMore } =
    useSettlementBatches();
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<SettlementBatch | null>(null);
  const [confirming, setConfirming] = useState<SettlementBatch | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  const localeTag = locale === 'vi' ? 'vi-VN' : 'en-US';
  const formatMoney = (value: string | null) =>
    value === null ? '—' : `${BigInt(value).toLocaleString(localeTag)} VND`;
  const formatTime = (value: string) => new Date(value).toLocaleString(localeTag);

  const handleUploaded = async (message: string) => {
    setNotice(message);
    await refetch();
  };

  const handleComplete = async () => {
    if (!confirming) return;
    setIsCompleting(true);
    setActionError(null);
    const revision = authRevision;
    try {
      // Success is shown only after the server locks the batch and posts COD once.
      const result = await carrierSettlementApi.complete(confirming.id);
      if (revision !== useAuthStore.getState().revision) return;
      setConfirming(null);
      setNotice(
        t('completed', {
          count: result.postedCount,
          amount: formatMoney(result.creditedVnd),
          skipped: result.skippedAlreadyCredited,
        }),
      );
      await refetch();
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : t('completeError'));
    } finally {
      setIsCompleting(false);
    }
  };

  const columns: ColumnDef<SettlementBatch>[] = [
    { key: 'createdAt', label: t('uploadedAt'), render: (row) => formatTime(row.createdAt) },
    { key: 'carrierCode', label: t('carrier') },
    { key: 'fileName', label: t('file') },
    {
      key: 'progress',
      label: t('progress'),
      render: (row) => `${row.processedRows}/${row.totalRows}`,
    },
    {
      key: 'totals',
      label: t('totals'),
      render: (row) =>
        t('totalsValue', { matched: row.matchedRows, exceptions: row.exceptionRows }),
    },
    {
      key: 'status',
      label: t('state'),
      render: (row) => (
        <Badge
          status={row.status === 'COMPLETED' ? 'success' : isBatchReady(row) ? 'warning' : 'info'}
          label={
            row.status === 'COMPLETED'
              ? t('stateCompleted')
              : isBatchReady(row)
                ? t('stateReady')
                : t('stateProcessing')
          }
        />
      ),
    },
    {
      key: 'actions',
      label: t('actions'),
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => setReviewing(row)}>
            {t('viewExceptions')}
          </Button>
          {isBatchReady(row) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setActionError(null);
                setConfirming(row);
              }}
            >
              {t('complete')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <section className="space-y-4" aria-labelledby="carrier-settlement-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="carrier-settlement-title" className="text-lg font-semibold">
            {t('title')}
          </h2>
          <p className="mt-1 text-sm text-[var(--sc-text-secondary)]">{t('description')}</p>
        </div>
        <Button variant="secondary" onClick={() => void refetch()} disabled={isLoading}>
          {t('refresh')}
        </Button>
      </div>
      <SettlementUploadForm onUploaded={handleUploaded} />
      {notice && (
        <Alert variant="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {error ? (
        <Alert variant="error" title={t('loadError')}>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            {t('refresh')}
          </Button>
        </Alert>
      ) : (
        <DataTable
          ariaLabel={t('tableLabel')}
          columns={columns}
          data={batches}
          isLoading={isLoading}
          getRowKey={(row) => row.id}
          emptyMessage={t('empty')}
        />
      )}
      {hasNextPage && !error && (
        <div className="flex justify-center">
          <Button variant="ghost" isLoading={isLoadingMore} onClick={() => void loadMore()}>
            {t('loadMore')}
          </Button>
        </div>
      )}
      {reviewing && (
        <ExceptionsModal
          key={reviewing.id}
          batch={reviewing}
          formatMoney={formatMoney}
          onClose={() => setReviewing(null)}
        />
      )}
      <Modal
        isOpen={confirming !== null}
        onClose={() => setConfirming(null)}
        title={t('completeTitle')}
        width="480px"
      >
        <div className="space-y-4">
          <p className="text-sm">
            {t('completeHelp', {
              file: confirming?.fileName ?? '',
              exceptions: confirming?.exceptionRows ?? 0,
            })}
          </p>
          {actionError && <Alert variant="error">{actionError}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(null)} disabled={isCompleting}>
              {t('cancel')}
            </Button>
            <Button isLoading={isCompleting} onClick={() => void handleComplete()}>
              {t('confirmComplete')}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
