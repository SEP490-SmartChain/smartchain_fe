import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert, Button, Input, Select } from '@/components/Common';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import {
  receiptStockApi,
  receiptStockInputSchema,
  type ReceiptStockInput,
  type ReceiptStockState,
} from '../api/receiptStockApi';
interface Props {
  onPendingChange?: (key: string, locked: boolean) => void;
  warehouseId: string;
  asnId: string;
  recordId: string;
  receiptId: string;
  canWrite: boolean;
  onSaved: () => void;
}
export function ReceiptStockPanel({
  onPendingChange,
  warehouseId,
  asnId,
  recordId,
  receiptId,
  canWrite,
  onSaved,
}: Props) {
  const t = useTranslations('Receiving'),
    owner = useAuthStore((s) => s.user);
  const [expanded, setExpanded] = useState(false),
    [state, setState] = useState<ReceiptStockState | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0);
  const [binSearch, setBinSearch] = useState(''),
    [binQuery, setBinQuery] = useState('');
  const [attempt, setAttempt] = useState<{
    input: ReceiptStockInput;
    receipt: string;
    quantity: number;
  } | null>(null);
  useEffect(() => {
    onPendingChange?.(`stock:${recordId}`, busy || attempt !== null);
    return () => onPendingChange?.(`stock:${recordId}`, false);
  }, [onPendingChange, recordId, busy, attempt]);
  const generation = useRef(0),
    active = useRef<AbortController | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReceiptStockInput>({
    resolver: zodResolver(receiptStockInputSchema),
    defaultValues: { operationKey: crypto.randomUUID(), expectedVersion: 1, binId: '' },
  });
  useEffect(() => {
    const version = ++generation.current,
      controller = new AbortController();
    active.current = controller;
    setState(null);
    setAttempt(null);
    setBusy(false);
    setError('');
    setBinSearch('');
    setBinQuery('');
    reset({ operationKey: crypto.randomUUID(), expectedVersion: 1, binId: '' });
    return () => {
      generation.current = version + 1;
      controller.abort();
    };
  }, [warehouseId, asnId, recordId, receiptId, owner, reset]);
  useEffect(() => {
    if (!expanded) return;
    const version = generation.current,
      controller = new AbortController();
    setLoading(true);
    void receiptStockApi
      .get(warehouseId, asnId, recordId, receiptId, controller.signal, binSearch)
      .then((result) => {
        if (
          !controller.signal.aborted &&
          version === generation.current &&
          owner === useAuthStore.getState().user
        ) {
          setState(result);
          setError('');
          if (!attempt) {
            reset({
              operationKey: crypto.randomUUID(),
              expectedVersion: result.receiptVersion,
              binId: '',
            });
          }
        }
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted && version === generation.current) {
          setError(e instanceof ApiError ? e.message : t('stockError'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && version === generation.current) setLoading(false);
      });
    return () => controller.abort();
  }, [
    expanded,
    warehouseId,
    asnId,
    recordId,
    receiptId,
    owner,
    refresh,
    attempt,
    reset,
    t,
    binSearch,
  ]);
  async function send(command: { input: ReceiptStockInput; receipt: string; quantity: number }) {
    if (
      busy ||
      !canWrite ||
      (!attempt && !state?.canPost) ||
      owner !== useAuthStore.getState().user
    ) {
      return;
    }
    const version = generation.current;
    setBusy(true);
    setError('');
    try {
      const result = await receiptStockApi.post(
        warehouseId,
        asnId,
        recordId,
        command.receipt,
        command.quantity,
        command.input,
        active.current?.signal,
      );
      if (version !== generation.current || owner !== useAuthStore.getState().user) return;
      toast.success(t('stockSuccess', { quantity: result.recognizedQty }));
      setAttempt(null);
      setRefresh((v) => v + 1);
      onSaved();
    } catch (e: unknown) {
      if (version !== generation.current || owner !== useAuthStore.getState().user) return;
      setError(e instanceof ApiError ? e.message : t('stockError'));
      if (e instanceof ApiError && [400, 403, 404, 409, 422].includes(e.status)) {
        setAttempt(null);
        setState(null);
        setRefresh((v) => v + 1);
      } else setAttempt(command);
    } finally {
      if (version === generation.current) setBusy(false);
    }
  }
  return (
    <section className="mt-3 space-y-3 rounded-lg border border-[var(--sc-border-default)] p-3">
      <Button
        type="button"
        variant="outline"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {t('stockTitle')}
      </Button>
      {expanded && (
        <>
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('stockHelp')}</p>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              setBinSearch(binQuery.trim());
            }}
          >
            <Input
              label={t('stockBinSearch')}
              value={binQuery}
              maxLength={64}
              disabled={busy || !!attempt}
              onChange={(e) => setBinQuery(e.target.value)}
            />
            <Button type="submit" variant="outline" disabled={busy || !!attempt}>
              {t('stockFindBin')}
            </Button>
          </form>
          {loading && <p role="status">{t('loading')}</p>}
          {error && <Alert variant="error" title={error} />}{' '}
          {attempt && <Alert variant="warning" title={t('stockUncertain')} />}{' '}
          {state && (
            <>
              <p>{t('stockRecognized', { quantity: state.recognizedQty })}</p>
              {state.items.map((i) => (
                <p key={i.stockId}>
                  {t('stockLocation', {
                    code: state.bins.find((b) => b.id === i.binId)?.code ?? t('stockSavedLocation'),
                    quantity: i.quantity,
                  })}
                </p>
              ))}
              {!state.canPost && state.recognizedQty === 0 && <p>{t('stockAwaitReview')}</p>}
              {state.moreBins && <p>{t('stockMoreBins')}</p>}
              {canWrite && state.canPost && !attempt && (
                <form
                  className="space-y-3"
                  onSubmit={handleSubmit(
                    (input) =>
                      void send({
                        input,
                        receipt: state.receiptId,
                        quantity: state.acceptedQty + state.quarantinedQty,
                      }),
                  )}
                >
                  <fieldset disabled={busy || loading} className="space-y-3">
                    <Select
                      aria-required
                      label={t('stockBin')}
                      {...register('binId')}
                      options={state.bins.map((b) => ({
                        value: b.id,
                        label: `${b.code} · ${t(b.zoneType === 'RECEIVING' ? 'stockReceivingZone' : 'stockQuarantineZone')}`,
                      }))}
                      error={errors.binId ? t('stockSelectBin') : undefined}
                    />
                    <Select
                      label={t('stockQuarantineBin')}
                      aria-required={state.acceptedQty > 0 && state.quarantinedQty > 0}
                      {...register('quarantineBinId', { setValueAs: (v) => v || undefined })}
                      options={[
                        { value: '', label: t('stockNoQuarantineBin') },
                        ...state.bins
                          .filter((b) => b.zoneType === 'QUARANTINE')
                          .map((b) => ({ value: b.id, label: b.code })),
                      ]}
                      error={errors.quarantineBinId ? t('stockDistinctBin') : undefined}
                    />
                    <Button type="submit" isLoading={busy}>
                      {t('stockSubmit')}
                    </Button>
                  </fieldset>
                </form>
              )}
            </>
          )}
          {attempt && canWrite && (
            <Button type="button" isLoading={busy} onClick={() => void send(attempt)}>
              {t('stockRetry')}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setRefresh((v) => v + 1)}
          >
            {t('stockReload')}
          </Button>
          {!canWrite && <p>{t('stockStaffOnly')}</p>}
        </>
      )}
    </section>
  );
}
