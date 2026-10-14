import { useEffect, useRef, useState } from 'react';

import { useFieldArray, useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Button, Input, Select } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { ReceiptInspectionForm } from './ReceiptInspectionForm';
import { ReceiptPhotos } from './ReceiptPhotos';
import { receivingApi, type ReceivingState } from '../api/receivingApi';
import {
  countCommand,
  receiptCountFormSchema,
  type ReceiptCountFormValues,
  type ReceiptCountInput,
} from '../schemas/receiptCountSchema';

interface Props {
  warehouseId: string;
  asnId: string;
  canWrite: boolean;
  onSaved: () => void;
}

export function ReceiptCountForm({ warehouseId, asnId, canWrite, onSaved }: Props) {
  const t = useTranslations('Receiving');
  const { can } = useAccess();
  const owner = useAuthStore((state) => state.user);
  const [receipt, setReceipt] = useState<ReceivingState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uncertain, setUncertain] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const operationKey = useRef(crypto.randomUUID());
  const lastAttempt = useRef<ReceiptCountInput | null>(null);
  const mounted = useRef(false);
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ReceiptCountFormValues>({
    resolver: zodResolver(receiptCountFormSchema),
    defaultValues: { inboundLineId: '', lots: [] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lots' });
  const lineId = watch('inboundLineId');
  const line = receipt?.lines.find((row) => row.id === lineId);
  const openLines = receipt?.lines.filter((row) => row.count === null) ?? [];
  const editable =
    canWrite &&
    receipt?.status === 'RECEIVING' &&
    ['ARRIVED', 'RECEIVING'].includes(receipt.asnStatus) &&
    openLines.length > 0;

  useEffect(() => {
    const controller = new AbortController();
    mounted.current = true;
    setLoading(true);
    setReceipt(null);
    void receivingApi
      .receipt(warehouseId, asnId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted || owner !== useAuthStore.getState().user) return;
        setReceipt(result);
        if (!lastAttempt.current) {
          reset({ inboundLineId: result.lines.find((row) => !row.count)?.id ?? '', lots: [] });
        }
        // A read confirms whether an uncertain write committed; do not invent a new operation.
        const saved = result.lines.find(
          (row) => row.id === lastAttempt.current?.inboundLineId,
        )?.count;
        if (saved) {
          lastAttempt.current = null;
          setUncertain(false);
          setError('');
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && owner === useAuthStore.getState().user) {
          setError(reason instanceof ApiError ? reason.message : t('loadError'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [warehouseId, asnId, owner, refresh, reset, t]);

  async function send(input: ReceiptCountInput) {
    if (busy || !editable || owner !== useAuthStore.getState().user) return;
    setBusy(true);
    setError('');
    lastAttempt.current = input;
    try {
      await receivingApi.recordCount(warehouseId, asnId, input);
      if (mounted.current && owner === useAuthStore.getState().user) onSaved();
    } catch (reason) {
      if (!mounted.current || owner !== useAuthStore.getState().user) return;
      setError(reason instanceof ApiError ? reason.message : t('countError'));
      if (reason instanceof ApiError && [400, 403, 404, 409, 422].includes(reason.status)) {
        lastAttempt.current = null;
        setUncertain(false);
      } else setUncertain(true);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--sc-text-secondary)]">{t('countHelp')}</p>
      {loading && <p role="status">{t('loading')}</p>}
      {error && <Alert variant="error" title={error} />}
      {uncertain && <Alert variant="warning" title={t('countUncertain')} />}
      {receipt?.lines
        .filter((row) => row.count !== null)
        .map((row) => (
          <div key={row.id} className="rounded-lg border border-[var(--sc-border-default)] p-3">
            <p className="font-medium">
              {row.sku} · {row.productName}
            </p>
            <p>{t('countSaved', { quantity: row.count?.receivedQty ?? 0 })}</p>
            {row.count?.lots.map((lot) => (
              <div key={lot.recordId} className="mt-3 text-sm">
                <p className="text-[var(--sc-text-secondary)]">
                  {lot.lotCode} · {lot.receivedQty} · {lot.expiresOn ?? '—'} ·{' '}
                  {lot.quarantinedQty > 0 ? t('countQuarantine') : t('countPendingQc')}
                </p>
                <ReceiptPhotos
                  warehouseId={warehouseId}
                  asnId={asnId}
                  recordId={lot.recordId}
                  canWrite={
                    can('warehouse.asn.uploadPhoto') &&
                    receipt.status === 'RECEIVING' &&
                    ['ARRIVED', 'RECEIVING'].includes(receipt.asnStatus) &&
                    lot.qcState !== 'APPROVED'
                  }
                />
                <ReceiptInspectionForm
                  warehouseId={warehouseId}
                  asnId={asnId}
                  recordId={lot.recordId}
                  receivedQty={lot.receivedQty}
                  requiresQuarantine={
                    lot.quarantinedQty > 0 || !['SELLABLE', 'NEAR_EXPIRY'].includes(lot.lotStatus)
                  }
                  canWrite={
                    can('warehouse.asn.inspect') &&
                    receipt.status === 'RECEIVING' &&
                    ['ARRIVED', 'RECEIVING'].includes(receipt.asnStatus)
                  }
                  onSaved={(inspection) =>
                    setReceipt((previous) =>
                      previous
                        ? {
                            ...previous,
                            version: Math.max(previous.version, inspection.receiptVersion),
                            lines: previous.lines.map((item) => ({
                              ...item,
                              count: item.count
                                ? {
                                    ...item.count,
                                    lots: item.count.lots.map((itemLot) =>
                                      itemLot.recordId === lot.recordId
                                        ? { ...itemLot, qcState: 'REVIEW_REQUIRED' }
                                        : itemLot,
                                    ),
                                  }
                                : null,
                            })),
                          }
                        : previous,
                    )
                  }
                />
              </div>
            ))}
          </div>
        ))}
      {editable && (
        <form
          className="space-y-4"
          onSubmit={handleSubmit((values) => {
            if (receipt) void send(countCommand(values, operationKey.current, receipt.version));
          })}
        >
          <fieldset disabled={busy || uncertain || loading} className="space-y-4">
            <Select
              label={t('countLine')}
              options={openLines.map((row) => ({
                value: row.id,
                label: `${row.sku} — ${row.productName}`,
              }))}
              {...register('inboundLineId')}
              error={errors.inboundLineId ? t('countInvalid') : undefined}
              onChange={(event) => {
                reset({ inboundLineId: event.target.value, lots: [] });
                operationKey.current = crypto.randomUUID();
              }}
            />
            {line?.trackExpiry && (
              <Alert
                variant="info"
                title={t('countExpiryHelp', {
                  percent: line.minInboundShelfLifePct,
                  days: line.shelfLifeDays ?? '—',
                })}
              />
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label={t('countQuantity')}
                type="number"
                min={0}
                max={1_000_000}
                step={1}
                {...register('receivedQty', { valueAsNumber: true })}
                error={errors.receivedQty ? t('countInvalid') : undefined}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setValue('receivedQty', 0);
                  setValue('lots', []);
                }}
              >
                {t('countZero')}
              </Button>
            </div>
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="space-y-3 rounded-lg border border-[var(--sc-border-default)] p-3"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label={t('countLot', { number: index + 1 })}
                    maxLength={100}
                    {...register(`lots.${index}.lotCode`)}
                    error={errors.lots?.[index]?.lotCode ? t('countInvalid') : undefined}
                  />
                  <Input
                    label={t('countLotQuantity', { number: index + 1 })}
                    type="number"
                    min={1}
                    max={1_000_000}
                    step={1}
                    {...register(`lots.${index}.receivedQty`, { valueAsNumber: true })}
                    error={errors.lots?.[index]?.receivedQty ? t('countInvalid') : undefined}
                  />
                  <Input
                    label={t('countManufacture', { number: index + 1 })}
                    type="date"
                    {...register(`lots.${index}.manufacturedOn`)}
                    error={errors.lots?.[index]?.manufacturedOn ? t('countInvalid') : undefined}
                  />
                  <Input
                    label={t('countExpiry', { number: index + 1 })}
                    type="date"
                    {...register(`lots.${index}.expiresOn`)}
                    error={errors.lots?.[index]?.expiresOn ? t('countInvalid') : undefined}
                  />
                </div>
                <Button type="button" variant="ghost" onClick={() => remove(index)}>
                  {t('countRemoveLot', { number: index + 1 })}
                </Button>
              </div>
            ))}
            {errors.lots && (
              <p role="alert" className="text-sm text-[var(--sc-error-dark)]">
                {t('countBreakdownInvalid')}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={fields.length >= 50}
              onClick={() =>
                append({ lotCode: '', receivedQty: 1, manufacturedOn: '', expiresOn: '' })
              }
            >
              {t('countAddLot')}
            </Button>
          </fieldset>
          <div className="flex flex-wrap justify-end gap-2">
            {uncertain ? (
              <Button
                type="button"
                isLoading={busy}
                onClick={() => {
                  if (lastAttempt.current) void send(lastAttempt.current);
                }}
              >
                {t('countRetry')}
              </Button>
            ) : (
              <Button type="submit" isLoading={busy} disabled={loading}>
                {t('countSave')}
              </Button>
            )}
          </div>
        </form>
      )}
      {!loading && receipt && !editable && openLines.length > 0 && (
        <Alert variant="info" title={t(canWrite ? 'countClosed' : 'countReadOnly')} />
      )}
      <Button
        type="button"
        variant="outline"
        disabled={busy || loading}
        onClick={() => {
          setError('');
          setRefresh((value) => value + 1);
        }}
      >
        {t('reload')}
      </Button>
    </div>
  );
}
