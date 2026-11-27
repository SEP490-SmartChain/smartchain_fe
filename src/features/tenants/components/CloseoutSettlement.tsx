import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, CheckCircle2, RefreshCw, Scale } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { useAccess } from '@/hooks/useAccess';
import { localDateTimeInput, parseLocalDateTime } from '@/lib/dateValidation';
import { notifyInvalidForm } from '@/lib/errorNotifications';
import { useLocaleStore } from '@/stores/localeStore';

import { payoutApi } from '../api/payoutApi';
import {
  closeoutOffsetSchema,
  closeoutRefundFormSchema,
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
  const dateText = useTranslations('DateValidation');
  const locale = useLocaleStore((s) => s.locale);
  const [state, setState] = useState<CloseoutSummary | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [action, setAction] = useState<Action>('offsets'),
    [hasPending, setHasPending] = useState(false),
    [revision, setRevision] = useState(0),
    [localTransferTime, setLocalTransferTime] = useState(() => localDateTimeInput(new Date()));
  const request = useRef<AbortController | null>(null),
    pending = useRef<Pending | null>(null),
    busyRef = useRef(false);
  const offset = useForm<z.infer<typeof closeoutOffsetSchema>>({
    resolver: zodResolver(closeoutOffsetSchema),
    defaultValues: { amountVnd: '', evidenceKey: '', reason: '' },
  });
  const refund = useForm<z.infer<typeof closeoutRefundFormSchema>>({
    resolver: zodResolver(closeoutRefundFormSchema),
    defaultValues: {
      amountVnd: '',
      evidenceKey: '',
      reason: '',
      bankReference: '',
      transferredAt: new Date().toISOString(),
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
          offset.setValue('amountVnd', BigInt(row.debtVnd) > BigInt(0) ? row.debtVnd : '');
          refund.setValue(
            'amountVnd',
            BigInt(row.refundableVnd) > BigInt(0) ? row.refundableVnd : row.depositBalanceVnd,
          );
          if (BigInt(row.debtVnd) === BigInt(0) && BigInt(row.refundableVnd) > BigInt(0)) {
            setAction('refunds');
          } else if (BigInt(row.debtVnd) > BigInt(0)) {
            setAction('offsets');
          }
        }
      })
      .catch((failure) => {
        if (!abort.signal.aborted) {
          setError(failure instanceof Error ? failure.message : t('loadError'));
        }
      });
    return () => abort.abort();
  }, [tenantId, revision, t, offset, refund]);

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
  const hasEvidence = Boolean(
    action === 'offsets' ? offset.watch('evidenceKey') : refund.watch('evidenceKey'),
  );

  return (
    <div className="border-t border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/35 px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary)]">
            <Scale size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-sm font-semibold text-[var(--sc-text-primary)]">
                {t('closeoutTitle')}
              </h2>
              {state?.isTerminating && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-2.5 py-0.5 text-xs font-medium text-[var(--sc-text-secondary)]">
                  <span>{t('refundable')}:</span>
                  <strong className="font-semibold tabular-nums text-[var(--sc-primary)]">
                    {money(state.refundableVnd)}
                  </strong>
                </span>
              )}
            </div>
            <p className="mb-0 mt-0.5 text-xs text-[var(--sc-text-secondary)]">
              {t('closeoutHelp')}
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            pending.current = null;
            setHasPending(false);
            setError(null);
            setRevision((v) => v + 1);
          }}
        >
          <RefreshCw size={13} aria-hidden="true" />
          {t('refresh')}
        </Button>
      </div>

      {error && (
        <Alert variant="error" compact className="mt-3">
          {error}
        </Alert>
      )}

      {state?.isTerminating && (
        <div className="mt-3 space-y-3">
          {/* Compact Inline Blockers Strip */}
          {state.blockers.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--sc-warning-border)] bg-[var(--sc-warning-bg)]/60 px-3 py-2 text-xs text-[var(--sc-warning-dark)]">
              <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
              {state.blockers.map((key, idx) => (
                <span key={key} className="inline-flex items-center font-medium">
                  {idx > 0 && <span className="mx-1.5 opacity-50">·</span>}
                  {t(`closeoutBlockers.${key}`)}
                </span>
              ))}
            </div>
          )}

          {hasPending && (
            <Alert variant="warning" compact>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{t('uncertain')}</span>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void perform()}>
                  {t('retrySame')}
                </Button>
              </div>
            </Alert>
          )}

          {can('payout.manage') && (
            <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sc-border-light)] pb-3">
                <div className="inline-flex rounded-lg bg-[var(--sc-bg-secondary)] p-1">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setAction('offsets')}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      action === 'offsets'
                        ? 'bg-[var(--sc-bg-surface)] text-[var(--sc-primary)] shadow-xs'
                        : 'text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]'
                    }`}
                  >
                    {t('chooseOffset')}
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setAction('refunds')}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      action === 'refunds'
                        ? 'bg-[var(--sc-bg-surface)] text-[var(--sc-primary)] shadow-xs'
                        : 'text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]'
                    }`}
                  >
                    {t('chooseRefund')}
                  </button>
                </div>

                {hasEvidence && <Badge status="success" label={t('evidenceReady')} />}
              </div>

              <form
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                noValidate={action === 'refunds'}
                onSubmit={
                  action === 'offsets'
                    ? offset.handleSubmit(
                        (v) => perform(v),
                        () => notifyInvalidForm(),
                      )
                    : refund.handleSubmit(
                        (v) => perform(v),
                        () => notifyInvalidForm(),
                      )
                }
              >
                <Input
                  key={`amount-${action}`}
                  label={t('amount')}
                  placeholder="VD: 3000000"
                  {...(action === 'offsets'
                    ? offset.register('amountVnd')
                    : refund.register('amountVnd'))}
                  disabled={disabled}
                  error={fields.formState.errors.amountVnd ? t('invalidAmount') : undefined}
                />
                <Input
                  key={`reason-${action}`}
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
                {action === 'refunds' && (
                  <>
                    <Input
                      label={t('bankReference')}
                      placeholder="VD: VCB-99887766"
                      {...refund.register('bankReference')}
                      disabled={disabled}
                      error={
                        refund.formState.errors.bankReference ? t('invalidReference') : undefined
                      }
                    />
                    <Input
                      type="datetime-local"
                      label={t('transferredAt')}
                      value={localTransferTime}
                      max={localDateTimeInput(new Date())}
                      disabled={disabled}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setLocalTransferTime(raw);
                        const parsed = parseLocalDateTime(raw);
                        refund.setValue('transferredAt', parsed?.toISOString() ?? '', {
                          shouldValidate: true,
                        });
                      }}
                      error={
                        refund.formState.errors.transferredAt ? dateText('recordedTime') : undefined
                      }
                    />
                  </>
                )}
                <div className="flex items-end sm:col-span-2 lg:col-span-1">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={
                      disabled ||
                      (action === 'refunds'
                        ? state.blockers.length > 0 || BigInt(state.refundableVnd) <= BigInt(0)
                        : BigInt(state.debtVnd) <= BigInt(0) ||
                          BigInt(state.depositBalanceVnd) <= BigInt(0))
                    }
                  >
                    <CheckCircle2 size={15} />
                    {t(action === 'offsets' ? 'offset' : 'refund')}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
