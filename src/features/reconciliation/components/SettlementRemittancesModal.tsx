import { useCallback, useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { Select } from '@/components/Common/Select/Select';
import { useAuthStore } from '@/stores/authStore';
import { useLocaleStore } from '@/stores/localeStore';

import { carrierSettlementApi, loadRemittanceSources } from '../api/carrierSettlementApi';
import { sepayReconciliationApi } from '../api/sepayReconciliationApi';
import { remittanceSchema, type RemittanceValues } from '../schemas/remittanceSchema';

import type { UnmatchedSepayTransfer } from '../types/sepayReconciliation.types';

interface Props {
  batchId: string;
  onClose: () => void;
  onChanged: () => void;
}

export function SettlementRemittancesModal({ batchId, onClose, onChanged }: Props) {
  const t = useTranslations('SettlementMoney');
  const revision = useAuthStore((state) => state.revision);
  const locale = useLocaleStore((state) => state.locale);
  const localeTag = locale === 'vi' ? 'vi-VN' : 'en-US';
  const controller = useRef<AbortController | null>(null);
  const [receipts, setReceipts] = useState<
    Awaited<ReturnType<typeof carrierSettlementApi.remittances>>
  >([]);
  const [transfers, setTransfers] = useState<UnmatchedSepayTransfer[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receiptsError, setReceiptsError] = useState<string | null>(null);
  const [transfersError, setTransfersError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const {
    register,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RemittanceValues>({
    resolver: zodResolver(remittanceSchema),
    defaultValues: {
      source: 'MANUAL',
      bankReference: '',
      amountVnd: '',
      receivedAt: '',
      evidenceRef: '',
    },
  });
  const source = watch('source');
  const fallback = t('error');
  const load = useCallback(async () => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setError(null);
    setReceiptsError(null);
    setTransfersError(null);
    setIsLoading(true);
    setReceipts([]);
    setTransfers([]);
    setCursor(null);
    try {
      const { receipts: links, sepay: page } = await loadRemittanceSources(batchId, abort.signal);
      if (abort.signal.aborted || revision !== useAuthStore.getState().revision) return;
      if (links.status === 'fulfilled') setReceipts(links.value);
      else setReceiptsError(links.reason instanceof Error ? links.reason.message : fallback);
      if (page.status === 'fulfilled') {
        setTransfers(page.value.items);
        setCursor(page.value.pagination.nextCursor);
      } else setTransfersError(page.reason instanceof Error ? page.reason.message : fallback);
    } catch (failure) {
      if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : fallback);
    } finally {
      if (!abort.signal.aborted) setIsLoading(false);
    }
  }, [batchId, fallback, revision]);
  useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, [load]);

  const submit = handleSubmit(async (values) => {
    setError(null);
    setSaved(false);
    try {
      await carrierSettlementApi.linkRemittance(
        batchId,
        values.source === 'SEPAY'
          ? { notificationId: values.notificationId }
          : {
              bankReference: values.bankReference,
              amountVnd: values.amountVnd,
              receivedAt: new Date(values.receivedAt).toISOString(),
              evidenceRef: values.evidenceRef,
            },
        controller.current?.signal,
      );
      if (controller.current?.signal.aborted || revision !== useAuthStore.getState().revision) {
        return;
      }
      setSaved(true);
      onChanged();
      await load();
    } catch (failure) {
      if (!controller.current?.signal.aborted && revision === useAuthStore.getState().revision) {
        setError(failure instanceof Error ? failure.message : fallback);
      }
    }
  });
  const loadMore = async () => {
    if (!cursor) return;
    try {
      const page = await sepayReconciliationApi.unmatched(cursor, controller.current?.signal);
      if (controller.current?.signal.aborted || revision !== useAuthStore.getState().revision) {
        return;
      }
      setTransfers((current) => [...current, ...page.items]);
      setCursor(page.pagination.nextCursor);
    } catch (failure) {
      if (!controller.current?.signal.aborted) {
        setError(failure instanceof Error ? failure.message : fallback);
      }
    }
  };
  return (
    <Modal isOpen onClose={onClose} title={t('title')} width="700px">
      <div className="space-y-4">
        <Alert variant="info">{t('help')}</Alert>
        {error && (
          <Alert variant="error">
            {error}
            <Button variant="ghost" onClick={() => void load()}>
              {t('retry')}
            </Button>
          </Alert>
        )}
        {saved && <Alert variant="success">{t('saved')}</Alert>}
        {(receiptsError || (source === 'SEPAY' && transfersError)) && (
          <Alert variant="error">
            {receiptsError || transfersError}
            <Button variant="ghost" onClick={() => void load()}>
              {t('retry')}
            </Button>
          </Alert>
        )}
        {isLoading ? (
          <p>{t('loading')}</p>
        ) : !receiptsError ? (
          <ul className="space-y-2 text-sm" aria-label={t('linked')}>
            {receipts.length === 0 && <li>{t('empty')}</li>}
            {receipts.map((receipt) => (
              <li key={receipt.id} className="break-all">
                {receipt.bankReference} · {BigInt(receipt.amountVnd).toLocaleString(localeTag)} VND
                · {receipt.evidenceRef}
              </li>
            ))}
          </ul>
        ) : null}
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-2" noValidate>
          <Select
            label={t('source')}
            options={[
              { value: 'MANUAL', label: t('manual') },
              { value: 'SEPAY', label: t('sepay') },
            ]}
            {...register('source')}
          />
          {source === 'MANUAL' ? (
            <>
              <Input
                label={t('reference')}
                {...register('bankReference')}
                error={'bankReference' in errors ? t('invalid') : undefined}
              />
              <Input
                label={t('amount')}
                inputMode="numeric"
                {...register('amountVnd')}
                error={'amountVnd' in errors ? t('invalid') : undefined}
              />
              <Input
                label={t('receivedAt')}
                type="datetime-local"
                {...register('receivedAt')}
                error={'receivedAt' in errors ? t('invalid') : undefined}
              />
              <Input
                label={t('evidence')}
                {...register('evidenceRef')}
                error={'evidenceRef' in errors ? t('invalid') : undefined}
              />
            </>
          ) : (
            <>
              <Select
                label={t('transfer')}
                options={[
                  { value: '', label: t('choose') },
                  ...transfers
                    .filter((row) => row.environment === 'PRODUCTION')
                    .map((row) => ({
                      value: row.id,
                      label: `${row.externalRef} · ${BigInt(row.amountVnd).toLocaleString(localeTag)} VND`,
                    })),
                ]}
                {...register('notificationId')}
                error={'notificationId' in errors ? t('invalid') : undefined}
              />
              {cursor && (
                <Button variant="ghost" type="button" onClick={() => void loadMore()}>
                  {t('more')}
                </Button>
              )}
            </>
          )}
          <div className="md:col-span-2 flex justify-end">
            <Button
              type="submit"
              isLoading={isSubmitting}
              disabled={isLoading || (source === 'SEPAY' && transfersError !== null)}
            >
              {t('link')}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
