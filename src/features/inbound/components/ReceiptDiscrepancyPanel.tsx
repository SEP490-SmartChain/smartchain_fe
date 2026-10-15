import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert, Button, Input, Select } from '@/components/Common';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import {
  discrepancyApi,
  type DiscrepancyInput,
  type DiscrepancyState,
} from '../api/discrepancyApi';

const formSchema = z.object({
  source: z.string().min(1),
  reason: z.string().trim().min(1).max(1000),
});
interface Props {
  onPendingChange?: (key: string, locked: boolean) => void;
  warehouseId: string;
  asnId: string;
  receiptVersion: number;
  canWrite: boolean;
  onSaved: () => void;
}
export function ReceiptDiscrepancyPanel({
  onPendingChange,
  warehouseId,
  asnId,
  receiptVersion,
  canWrite,
  onSaved,
}: Props) {
  const t = useTranslations('Receiving');
  const owner = useAuthStore((s) => s.user);
  const [expanded, setExpanded] = useState(true),
    [state, setState] = useState<DiscrepancyState | null>(null);
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0),
    [attempt, setAttempt] = useState<{ input: DiscrepancyInput; qty: number } | null>(null);
  useEffect(() => {
    onPendingChange?.(`discrepancy:${asnId}`, busy || attempt !== null);
    return () => onPendingChange?.(`discrepancy:${asnId}`, false);
  }, [onPendingChange, asnId, busy, attempt]);
  const generation = useRef(0),
    active = useRef<AbortController | null>(null),
    operation = useRef(crypto.randomUUID());
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { source: '', reason: '' },
  });
  const current = (version: number) =>
    version === generation.current && owner === useAuthStore.getState().user;
  useEffect(() => {
    const version = ++generation.current,
      controller = new AbortController();
    active.current = controller;
    setState(null);
    setAttempt(null);
    setError('');
    setBusy(false);
    reset({ source: '', reason: '' });
    operation.current = crypto.randomUUID();
    return () => {
      generation.current = version + 1;
      controller.abort();
    };
  }, [warehouseId, asnId, owner, reset]);
  useEffect(() => {
    if (!expanded) return;
    const version = generation.current,
      controller = new AbortController();
    setLoading(true);
    void discrepancyApi
      .get(warehouseId, asnId, controller.signal)
      .then((result) => {
        if (
          !controller.signal.aborted &&
          version === generation.current &&
          owner === useAuthStore.getState().user
        ) {
          setState(result);
          setError('');
        }
      })
      .catch((reason: unknown) => {
        if (
          !controller.signal.aborted &&
          version === generation.current &&
          owner === useAuthStore.getState().user
        ) {
          setState(null);
          setError(reason instanceof ApiError ? reason.message : t('discrepancyLoadError'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && version === generation.current) setLoading(false);
      });
    return () => controller.abort();
  }, [expanded, warehouseId, asnId, owner, receiptVersion, refresh, t]);
  const candidates = (state?.lines ?? []).flatMap((line) => {
    const result: {
      key: string;
      inboundLineId: string;
      receivingRecordId?: string;
      discrepancyType: DiscrepancyInput['discrepancyType'];
      qty: number;
      label: string;
    }[] = [];
    if (line.variance) {
      const type = line.variance.discrepancyType,
        qty = line.variance.qty;
      result.push({
        key: `${line.inboundLineId}:${type}`,
        inboundLineId: line.inboundLineId,
        discrepancyType: type,
        qty,
        label: t('discrepancyCandidate', { line: line.lineNo, type: t(`discrepancy${type}`), qty }),
      });
    }
    for (const qc of line.exceptions) {
      result.push({
        key: `${line.inboundLineId}:${qc.receivingRecordId}:${qc.discrepancyType}`,
        inboundLineId: line.inboundLineId,
        receivingRecordId: qc.receivingRecordId,
        discrepancyType: qc.discrepancyType,
        qty: qc.qty,
        label: `${t('discrepancyCandidate', { line: line.lineNo, type: t(`discrepancy${qc.discrepancyType}`), qty: qc.qty })} · ${qc.lotCode}`,
      });
    }
    return result.filter(
      (candidate) =>
        !state?.items.some(
          (item) =>
            item.inboundLineId === candidate.inboundLineId &&
            item.receivingRecordId === (candidate.receivingRecordId ?? null) &&
            item.discrepancyType === candidate.discrepancyType,
        ),
    );
  });
  async function send(command: { input: DiscrepancyInput; qty: number }) {
    if (busy || !canWrite || !current(generation.current)) return;
    const version = generation.current;
    setBusy(true);
    setError('');
    try {
      const result = await discrepancyApi.report(
        warehouseId,
        asnId,
        command.input,
        active.current?.signal,
      );
      if (!current(version)) return;
      if (result.qty !== command.qty) {
        throw new Error('Reported quantity differs from the physical evidence');
      }
      setAttempt(null);
      reset({ source: '', reason: '' });
      operation.current = crypto.randomUUID();
      setRefresh((v) => v + 1);
      onSaved();
    } catch (reason) {
      if (!current(version)) return;
      setError(reason instanceof ApiError ? reason.message : t('discrepancySubmitError'));
      if (reason instanceof ApiError && [400, 403, 404, 409, 422].includes(reason.status)) {
        setAttempt(null);
        setState(null);
        operation.current = crypto.randomUUID();
        setRefresh((v) => v + 1);
      } else setAttempt(command);
    } finally {
      if (current(version)) setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-lg border border-[var(--sc-border-default)] p-3">
      <Button
        type="button"
        variant="outline"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {t('discrepancyTitle')}
      </Button>
      {expanded && (
        <>
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('discrepancyHelp')}</p>
          {loading && <p role="status">{t('loading')}</p>}
          {error && <Alert variant="error" title={error} />}
          {attempt && <Alert variant="warning" title={t('discrepancyUncertain')} />}
          {state && (
            <>
              {!state.ready && <Alert variant="warning" title={t('discrepancyIncomplete')} />}
              {state.lines.map((line) => (
                <p className="text-sm" key={line.inboundLineId}>
                  {t('discrepancyComparison', {
                    line: line.lineNo,
                    actual: line.receivedQty ?? '—',
                  })}
                  {line.variance &&
                    ` · ${t('discrepancyVariance', { type: t(`discrepancy${line.variance.discrepancyType}`), qty: line.variance.qty })}`}
                </p>
              ))}
              {state.items.map((item) => (
                <div
                  key={item.id}
                  className="space-y-1 rounded-lg border border-[var(--sc-border-default)] p-3 text-sm"
                >
                  <p className="font-medium">
                    {t('discrepancyReported', {
                      type: t(`discrepancy${item.discrepancyType}`),
                      qty: item.qty,
                    })}
                  </p>
                  <p className="break-words">{item.reason}</p>
                  <p>{t('discrepancyState' + item.status)}</p>
                  <p>{t('qcAttached', { count: item.photoIds.length })}</p>
                </div>
              ))}
              {!candidates.length && state.ready && (
                <p className="text-sm">{t('discrepancyNoNew')}</p>
              )}
              {canWrite &&
                state.ready &&
                candidates.length > 0 &&
                ['RECEIVING', 'DISCREPANCY'].includes(state.asnStatus) && (
                  <form
                    className="space-y-3"
                    onSubmit={handleSubmit((values) => {
                      const candidate = candidates.find((c) => c.key === values.source);
                      if (candidate) {
                        void send({
                          qty: candidate.qty,
                          input: {
                            operationKey: operation.current,
                            expectedVersion: state.receiptVersion,
                            inboundLineId: candidate.inboundLineId,
                            receivingRecordId: candidate.receivingRecordId,
                            discrepancyType: candidate.discrepancyType,
                            reason: values.reason,
                          },
                        });
                      }
                    })}
                  >
                    <fieldset className="space-y-3" disabled={busy || loading || Boolean(attempt)}>
                      <Select
                        label={t('discrepancySource')}
                        options={[
                          { value: '', label: t('discrepancySelect') },
                          ...candidates.map((c) => ({ value: c.key, label: c.label })),
                        ]}
                        {...register('source')}
                        onChange={(event) => {
                          const candidate = candidates.find(
                            (item) => item.key === event.target.value,
                          );
                          const evidence = state.lines
                            .flatMap((item) => item.exceptions)
                            .find(
                              (item) =>
                                item.receivingRecordId === candidate?.receivingRecordId &&
                                item.discrepancyType === candidate?.discrepancyType,
                            );
                          reset({ source: event.target.value, reason: evidence?.reason ?? '' });
                        }}
                        error={errors.source ? t('discrepancySelect') : undefined}
                      />
                      <Input
                        label={t('discrepancyReason')}
                        maxLength={1000}
                        {...register('reason')}
                        error={errors.reason ? t('discrepancyReasonRequired') : undefined}
                      />
                      <Button type="submit">{t('discrepancySubmit')}</Button>
                    </fieldset>
                  </form>
                )}
              {!canWrite && <p className="text-sm">{t('discrepancyReadOnly')}</p>}
            </>
          )}
          {attempt && (
            <Button type="button" disabled={busy || !canWrite} onClick={() => void send(attempt)}>
              {t('discrepancyRetry')}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            disabled={loading || busy || Boolean(attempt)}
            onClick={() => setRefresh((v) => v + 1)}
          >
            {t('discrepancyReload')}
          </Button>
        </>
      )}
    </section>
  );
}
