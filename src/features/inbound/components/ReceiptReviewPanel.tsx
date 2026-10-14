import { useCallback, useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Button, Input, Select } from '@/components/Common';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import {
  reviewApi,
  reviewValuesSchema,
  type ReviewInput,
  type ReviewState,
} from '../api/reviewApi';

import type { z } from 'zod';

interface Props {
  warehouseId: string;
  asnId: string;
  receiptVersion: number;
  canWrite: boolean;
  onSaved: () => void;
}
export function ReceiptReviewPanel({
  warehouseId,
  asnId,
  receiptVersion,
  canWrite,
  onSaved,
}: Props) {
  const t = useTranslations('Receiving');
  const owner = useAuthStore((s) => s.user);
  const [expanded, setExpanded] = useState(false),
    [state, setState] = useState<ReviewState | null>(null);
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const [refresh, setRefresh] = useState(0),
    [attempt, setAttempt] = useState<{ input: ReviewInput; receiptId: string } | null>(null);
  const generation = useRef(0),
    active = useRef<AbortController | null>(null),
    operation = useRef(crypto.randomUUID());
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<z.infer<typeof reviewValuesSchema>>({
    resolver: zodResolver(reviewValuesSchema),
    defaultValues: { decision: 'APPROVE', reason: '' },
  });
  const decision = watch('decision');
  const current = useCallback(
    (version: number) => version === generation.current && owner === useAuthStore.getState().user,
    [owner],
  );
  useEffect(() => {
    const version = ++generation.current,
      controller = new AbortController();
    active.current = controller;
    setState(null);
    setAttempt(null);
    setBusy(false);
    setError('');
    setSuccess('');
    operation.current = crypto.randomUUID();
    reset({ decision: 'APPROVE', reason: '' });
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
    void reviewApi
      .get(warehouseId, asnId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && current(version)) {
          setState(result);
          setError('');
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && current(version)) {
          setState(null);
          setError(reason instanceof ApiError ? reason.message : t('reviewLoadError'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && current(version)) setLoading(false);
      });
    return () => controller.abort();
  }, [expanded, warehouseId, asnId, receiptVersion, owner, refresh, current, t]);
  async function send(input: ReviewInput, receiptId: string) {
    if (
      busy ||
      !canWrite ||
      (!attempt && (!state?.ready || (input.decision === 'APPROVE' && !state.canApprove)))
    ) {
      return;
    }
    const version = generation.current;
    if (!current(version)) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await reviewApi.decide(
        warehouseId,
        asnId,
        receiptId,
        input,
        active.current?.signal,
      );
      if (!current(version)) return;
      setAttempt(null);
      operation.current = crypto.randomUUID();
      reset({ decision: 'APPROVE', reason: '' });
      setSuccess(t(result.decision === 'APPROVE' ? 'reviewApproved' : 'reviewReturned'));
      setRefresh((v) => v + 1);
      onSaved();
    } catch (reason: unknown) {
      if (!current(version)) return;
      setError(reason instanceof ApiError ? reason.message : t('reviewSubmitError'));
      if (reason instanceof ApiError && [400, 403, 404, 409, 422].includes(reason.status)) {
        setAttempt(null);
        operation.current = crypto.randomUUID();
        setState(null);
        setRefresh((v) => v + 1);
      } else setAttempt({ input, receiptId });
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
        {t('reviewTitle')}
      </Button>
      {expanded && (
        <>
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('reviewHelp')}</p>
          {loading && <p role="status">{t('loading')}</p>}
          {error && <Alert variant="error" title={error} />}
          {success && <Alert variant="success" title={success} />}
          {attempt && <Alert variant="warning" title={t('reviewUncertain')} />}
          {state?.records.map((r) => (
            <div key={r.receivingRecordId} className="space-y-1 text-sm">
              <p className="font-medium">
                {r.lotCode} · {t('countSaved', { quantity: r.receivedQty })}
              </p>
              {r.inspection && (
                <>
                  <p>
                    {t('reviewPartition', {
                      accepted: r.inspection.acceptedQty,
                      quarantine: r.inspection.quarantinedQty,
                      rejected: r.inspection.rejectedQty,
                    })}
                  </p>
                  <p>{r.inspection.reason}</p>
                </>
              )}
            </div>
          ))}
          {state?.unreportedDiscrepancies !== undefined && state.unreportedDiscrepancies > 0 && (
            <Alert
              variant="warning"
              title={t('reviewMissingReports', { count: state.unreportedDiscrepancies })}
            />
          )}
          {state?.items.map((row) => (
            <div key={row.id} className="space-y-1 text-sm">
              <p className="font-medium">
                {t(row.decision === 'APPROVE' ? 'reviewApproved' : 'reviewReturned')}
              </p>
              <p>{row.reason}</p>
              <p>{new Date(row.reviewedAt).toLocaleString()}</p>
              <p className="text-[var(--sc-text-secondary)]">{t('reviewNotificationPending')}</p>
            </div>
          ))}
          {canWrite && state?.ready && (
            <form
              className="space-y-3"
              onSubmit={handleSubmit((values) => {
                void send(
                  {
                    ...values,
                    operationKey: operation.current,
                    expectedVersion: state.receiptVersion,
                    inspectionIds: state.inspectionIds,
                    discrepancyIds: state.discrepancyIds,
                  },
                  state.receiptId,
                );
              })}
            >
              <fieldset disabled={busy || loading || !!attempt} className="space-y-3">
                <Select
                  label={t('reviewDecision')}
                  {...register('decision')}
                  options={[
                    { value: 'APPROVE', label: t('reviewApproveChoice') },
                    { value: 'RETURN', label: t('reviewReturnChoice') },
                  ]}
                />
                <Input
                  label={t('reviewReason')}
                  {...register('reason')}
                  maxLength={1000}
                  error={errors.reason ? t('reviewReasonRequired') : undefined}
                />
                <Button
                  type="submit"
                  disabled={decision === 'APPROVE' && !state.canApprove}
                  isLoading={busy}
                >
                  {t('reviewSubmit')}
                </Button>
              </fieldset>
            </form>
          )}
          {attempt && canWrite && (
            <Button
              type="button"
              isLoading={busy}
              onClick={() => void send(attempt.input, attempt.receiptId)}
            >
              {t('reviewRetrySame')}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setRefresh((v) => v + 1)}
          >
            {t('reviewReload')}
          </Button>
          {!canWrite && (
            <p className="text-sm text-[var(--sc-text-secondary)]">{t('reviewManagerOnly')}</p>
          )}
        </>
      )}
    </section>
  );
}
