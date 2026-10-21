import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';
import { Input } from '@/components/Common/Input/Input';
import { useAccess } from '@/hooks/useAccess';
import { useLocaleStore } from '@/stores/localeStore';

import { payoutApi } from '../api/payoutApi';
import {
  closeoutOffsetSchema,
  closeoutRefundSchema,
  type CloseoutSummary,
} from '../schemas/payoutSchema';

import type { z } from 'zod';

type Action = 'offsets' | 'refunds';
type Pending = { action: Action; payload: Record<string, unknown> };
export function CloseoutSettlement({
  tenantId,
  onChanged,
}: {
  tenantId?: string;
  onChanged: () => void;
}) {
  const t = useTranslations('Payouts'),
    { can } = useAccess();
  const locale = useLocaleStore((s) => s.locale);
  const [state, setState] = useState<CloseoutSummary | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [action, setAction] = useState<Action>('offsets'),
    [hasPending, setHasPending] = useState(false),
    [revision, setRevision] = useState(0);
  const request = useRef<AbortController | null>(null),
    pending = useRef<Pending | null>(null),
    busyRef = useRef(false);
  const offset = useForm<z.infer<typeof closeoutOffsetSchema>>({
    resolver: zodResolver(closeoutOffsetSchema),
    defaultValues: { amountVnd: '', evidenceKey: '', reason: '' },
  });
  const refund = useForm<z.infer<typeof closeoutRefundSchema>>({
    resolver: zodResolver(closeoutRefundSchema),
    defaultValues: {
      amountVnd: '',
      evidenceKey: '',
      reason: '',
      bankReference: '',
      transferredAt: '',
    },
  });
  useEffect(() => {
    const abort = new AbortController();
    request.current = abort;
    void payoutApi
      .closeout(tenantId, abort.signal)
      .then((row) => {
        if (!abort.signal.aborted) {
          setState(row);
          refund.setValue('amountVnd', row.refundableVnd);
        }
      })
      .catch((failure) => {
        if (!abort.signal.aborted) {
          setError(failure instanceof Error ? failure.message : t('loadError'));
        }
      });
    return () => abort.abort();
  }, [tenantId, revision, t, refund]);
  const money = (value: string) =>
    `${BigInt(value).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')} VND`;
  const perform = async (values?: Record<string, unknown>) => {
    const current = request.current;
    if (
      !state?.contractId ||
      !state.contractVersion ||
      !current ||
      current.signal.aborted ||
      busyRef.current
    ) {
      return;
    }
    const intent = pending.current ?? {
      action,
      payload: {
        ...values,
        contractId: state.contractId,
        expectedVersion: state.contractVersion,
        operationKey: crypto.randomUUID(),
      },
    };
    pending.current = intent;
    setHasPending(true);
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await payoutApi.settle(intent.action, intent.payload, tenantId, current.signal);
      if (!current.signal.aborted) {
        pending.current = null;
        setHasPending(false);
        onChanged();
        setRevision((v) => v + 1);
      }
    } catch (failure) {
      if (!current.signal.aborted) {
        setError(failure instanceof Error ? failure.message : t('loadError'));
      }
    } finally {
      busyRef.current = false;
      if (!current.signal.aborted) setBusy(false);
    }
  };
  const upload = async (file?: File) => {
    const current = request.current;
    if (!file || !current || current.signal.aborted || busyRef.current || hasPending) return;
    if (file.size > 20 * 1024 * 1024 || file.type !== 'application/pdf') {
      setError(t('pdfRequired'));
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await payoutApi.closeoutEvidence(file, tenantId, current.signal);
      if (!current.signal.aborted) {
        offset.setValue('evidenceKey', result.evidenceKey, { shouldValidate: true });
        refund.setValue('evidenceKey', result.evidenceKey, { shouldValidate: true });
      }
    } catch (failure) {
      if (!current.signal.aborted) {
        setError(failure instanceof Error ? failure.message : t('loadError'));
      }
    } finally {
      busyRef.current = false;
      if (!current.signal.aborted) setBusy(false);
    }
  };
  if (!state?.isTerminating && !error) return null;
  const disabled = busy || hasPending;
  const fields = action === 'offsets' ? offset : refund;
  return (
    <Card>
      <h2 className="text-lg font-semibold">{t('closeoutTitle')}</h2>
      <p className="mt-2 text-sm text-[var(--sc-text-secondary)]">{t('closeoutHelp')}</p>
      {error && <Alert variant="error">{error}</Alert>}
      {state?.isTerminating && (
        <div className="mt-4 space-y-4">
          <p className="font-medium tabular-nums">
            {t('refundable')}: {money(state.refundableVnd)}
          </p>
          {state.blockers.length > 0 && (
            <Alert variant="warning">
              <ul className="list-inside list-disc">
                {state.blockers.map((key) => (
                  <li key={key}>{t(`closeoutBlockers.${key}`)}</li>
                ))}
              </ul>
            </Alert>
          )}
          {hasPending && (
            <Alert variant="warning">
              <p>{t('uncertain')}</p>
              <Button variant="outline" disabled={busy} onClick={() => void perform()}>
                {t('retrySame')}
              </Button>
            </Alert>
          )}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              pending.current = null;
              setHasPending(false);
              setError(null);
              setRevision((v) => v + 1);
            }}
          >
            {t('refresh')}
          </Button>
          {can('payout.manage') && (
            <>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant={action === 'offsets' ? 'primary' : 'outline'}
                  disabled={disabled}
                  onClick={() => setAction('offsets')}
                >
                  {t('chooseOffset')}
                </Button>
                <Button
                  variant={action === 'refunds' ? 'primary' : 'outline'}
                  disabled={disabled}
                  onClick={() => setAction('refunds')}
                >
                  {t('chooseRefund')}
                </Button>
              </div>
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={
                  action === 'offsets'
                    ? offset.handleSubmit((v) => perform(v))
                    : refund.handleSubmit((v) => perform(v))
                }
              >
                <Input
                  label={t('amount')}
                  {...(action === 'offsets'
                    ? offset.register('amountVnd')
                    : refund.register('amountVnd'))}
                  disabled={disabled}
                  readOnly={action === 'refunds'}
                  error={fields.formState.errors.amountVnd ? t('invalidAmount') : undefined}
                />
                <Input
                  label={t('reason')}
                  {...(action === 'offsets'
                    ? offset.register('reason')
                    : refund.register('reason'))}
                  disabled={disabled}
                  error={fields.formState.errors.reason ? t('invalidReason') : undefined}
                />
                <Input
                  type="file"
                  accept="application/pdf"
                  label={t('evidence')}
                  disabled={disabled}
                  onChange={(e) => void upload(e.target.files?.[0])}
                  error={fields.formState.errors.evidenceKey ? t('pdfRequired') : undefined}
                />
                <p className="self-end text-sm">
                  {(
                    action === 'offsets' ? offset.watch('evidenceKey') : refund.watch('evidenceKey')
                  )
                    ? t('evidenceReady')
                    : t('pdfRequired')}
                </p>
                {action === 'refunds' && (
                  <>
                    <Input
                      label={t('bankReference')}
                      {...refund.register('bankReference')}
                      disabled={disabled}
                      error={
                        refund.formState.errors.bankReference ? t('invalidReference') : undefined
                      }
                    />
                    <Input
                      label={t('transferredAt')}
                      {...refund.register('transferredAt')}
                      disabled={disabled}
                      placeholder="2026-11-05T02:00:00Z"
                      error={refund.formState.errors.transferredAt ? t('invalidTime') : undefined}
                    />
                  </>
                )}
                <Button
                  type="submit"
                  disabled={
                    disabled ||
                    (action === 'refunds'
                      ? state.blockers.length > 0 || BigInt(state.refundableVnd) <= BigInt(0)
                      : BigInt(state.debtVnd) <= BigInt(0) ||
                        BigInt(state.depositBalanceVnd) <= BigInt(0))
                  }
                >
                  {t(action === 'offsets' ? 'offset' : 'refund')}
                </Button>
              </form>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
