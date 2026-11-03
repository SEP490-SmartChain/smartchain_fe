import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { useAuthStore } from '@/stores/authStore';
import { useLocaleStore } from '@/stores/localeStore';

import { sepayReconciliationApi } from '../api/sepayReconciliationApi';
import { useUnmatchedSepayTransfers } from '../hooks/useUnmatchedSepayTransfers';
import { sepayMatchSchema, type SepayMatchFormValues } from '../schemas/sepayMatchSchema';

import type { UnmatchedSepayTransfer } from '../types/sepayReconciliation.types';

interface MatchTransferFormProps {
  transfer: UnmatchedSepayTransfer;
  formatMoney: (value: string) => string;
  onCancel: () => void;
  onMatched: (unallocatedVnd: string) => Promise<void>;
}

function MatchTransferForm({ transfer, formatMoney, onCancel, onMatched }: MatchTransferFormProps) {
  const t = useTranslations('SepayReconciliation');
  const authRevision = useAuthStore((state) => state.revision);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SepayMatchFormValues>({
    resolver: zodResolver(sepayMatchSchema),
    defaultValues: { invoiceNo: '' },
  });

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    return () => abort.abort();
  }, []);

  const handleMatch = handleSubmit(async ({ invoiceNo }) => {
    setError(null);
    const isCurrent = () =>
      !controller.current?.signal.aborted && authRevision === useAuthStore.getState().revision;
    try {
      // Success is shown only after the server confirms the single posting.
      const result = await sepayReconciliationApi.match(
        transfer.id,
        invoiceNo,
        controller.current?.signal,
      );
      if (isCurrent()) await onMatched(result.unallocatedVnd);
    } catch (failure) {
      if (isCurrent()) setError(failure instanceof Error ? failure.message : t('matchError'));
    }
  });

  return (
    <form onSubmit={handleMatch} className="space-y-4" noValidate>
      <p className="text-sm text-[var(--sc-text-secondary)]">
        {t('matchHelp', { amount: formatMoney(transfer.amountVnd) })}
      </p>
      <p className="text-sm break-words">
        {t('content')}: {transfer.content ?? '—'}
      </p>
      <Input
        label={t('invoiceNo')}
        autoComplete="off"
        required
        {...register('invoiceNo')}
        error={errors.invoiceNo ? t('invoiceNoInvalid') : undefined}
      />
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          {t('cancel')}
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          {t('confirm')}
        </Button>
      </div>
    </form>
  );
}

/** UC-127: ORCA Accountant queue of verified SePay transfers that need manual invoice matching. */
export function SepayUnmatchedTransfers() {
  const t = useTranslations('SepayReconciliation');
  const locale = useLocaleStore((state) => state.locale);
  const { transfers, error, isLoading, isLoadingMore, hasNextPage, refetch, loadMore } =
    useUnmatchedSepayTransfers();
  const [selected, setSelected] = useState<UnmatchedSepayTransfer | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const formatMoney = (value: string) =>
    `${BigInt(value).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')} VND`;
  const formatTime = (value: string) =>
    new Date(value).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US');

  const handleMatched = async (unallocatedVnd: string) => {
    setSelected(null);
    setNotice(t('matched', { amount: formatMoney(unallocatedVnd) }));
    await refetch();
  };

  const columns: ColumnDef<UnmatchedSepayTransfer>[] = [
    { key: 'receivedAt', label: t('receivedAt'), render: (row) => formatTime(row.receivedAt) },
    { key: 'amountVnd', label: t('amount'), render: (row) => formatMoney(row.amountVnd) },
    {
      key: 'content',
      label: t('content'),
      render: (row) => <span className="break-words">{row.content ?? '—'}</span>,
    },
    { key: 'externalRef', label: t('reference') },
    {
      key: 'actions',
      label: t('actions'),
      render: (row) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setNotice(null);
            setSelected(row);
          }}
        >
          {t('match')}
        </Button>
      ),
    },
  ];

  return (
    <section className="space-y-4" aria-labelledby="sepay-unmatched-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="sepay-unmatched-title" className="text-lg font-semibold">
            {t('title')}
          </h2>
          <p className="mt-1 text-sm text-[var(--sc-text-secondary)]">{t('description')}</p>
        </div>
        <Button variant="secondary" onClick={() => void refetch()} disabled={isLoading}>
          {t('refresh')}
        </Button>
      </div>
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
          data={transfers}
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
      <Modal
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        title={t('matchTitle')}
        width="480px"
      >
        {selected && (
          <MatchTransferForm
            key={selected.id}
            transfer={selected}
            formatMoney={formatMoney}
            onCancel={() => setSelected(null)}
            onMatched={handleMatched}
          />
        )}
      </Modal>
    </section>
  );
}
