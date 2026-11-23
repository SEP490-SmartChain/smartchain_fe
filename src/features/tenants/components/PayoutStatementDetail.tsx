import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { useAccess } from '@/hooks/useAccess';
import { notifyInvalidForm } from '@/lib/errorNotifications';
import { useLocaleStore } from '@/stores/localeStore';

import { payoutApi } from '../api/payoutApi';
import {
  payoutReasonSchema,
  payoutResolutionSchema,
  payoutReviewOpen,
  payoutTransferSchema,
  vietnamWednesday,
  type PayoutLine,
  type PayoutStatementDetail,
} from '../schemas/payoutSchema';

import type { z } from 'zod';

type Action = Parameters<typeof payoutApi.command>[1];
interface Pending {
  action: Action;
  payload: Record<string, unknown>;
  resourceId?: string;
}

export function PayoutStatementDetail({
  id,
  tenantId,
  onClose,
  onChanged,
}: {
  id: string;
  tenantId?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations('Payouts');
  const locale = useLocaleStore((s) => s.locale);
  const { can } = useAccess();
  const [row, setRow] = useState<PayoutStatementDetail | null>(null),
    [lines, setLines] = useState<PayoutLine[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [reasonTarget, setReasonTarget] = useState<{ lineId: string; disputeId?: string } | null>(null),
    [hasPending, setHasPending] = useState(false),
    [now, setNow] = useState(() => new Date()),
    [localTransferTime, setLocalTransferTime] = useState(() => {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    });
  const request = useRef<AbortController | null>(null),
    pending = useRef<Pending | null>(null),
    busyRef = useRef(false),
    reasonCardRef = useRef<HTMLDivElement>(null);
  const reason = useForm<z.infer<typeof payoutReasonSchema>>({
    resolver: zodResolver(payoutReasonSchema),
    defaultValues: { reason: '' },
  });
  const resolution = useForm<z.infer<typeof payoutResolutionSchema>>({
    resolver: zodResolver(payoutResolutionSchema),
    defaultValues: { reason: '', adjustmentVnd: '0' },
  });
  const transfer = useForm<z.infer<typeof payoutTransferSchema>>({
    resolver: zodResolver(payoutTransferSchema),
    defaultValues: {
      bankReference: '',
      transferredAt: new Date().toISOString(),
      evidenceKey: '',
    },
  });

  useEffect(() => {
    const abort = new AbortController();
    request.current = abort;
    setLoading(true);
    setError(null);
    void Promise.all([
      payoutApi.detail(id, tenantId, abort.signal),
      payoutApi.lines(id, { tenantId }, abort.signal),
    ])
      .then(([statement, page]) => {
        if (!abort.signal.aborted) {
          setRow(statement);
          setLines(page.items);
          setCursor(page.pagination.nextCursor);
        }
      })
      .catch((failure) => {
        if (!abort.signal.aborted) {
          setError(failure instanceof Error ? failure.message : t('loadError'));
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    const timer = window.setInterval(() => setNow(new Date()), 15000);
    return () => {
      abort.abort();
      window.clearInterval(timer);
    };
  }, [id, tenantId, revision, t]);

  useEffect(() => {
    if (reasonTarget && reasonCardRef.current) {
      reasonCardRef.current.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'nearest',
      });
    }
  }, [reasonTarget]);

  const money = (value: string) =>
    `${BigInt(value).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')} VND`;
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  const reviewOpen = row ? payoutReviewOpen(row, now) : false;

  const perform = async (
    action: Action,
    extra: Record<string, unknown> = {},
    resourceId?: string,
  ) => {
    const current = request.current;
    if (!row || !current || current.signal.aborted || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const intent = pending.current ?? {
      action,
      resourceId,
      payload: { operationKey: crypto.randomUUID(), version: row.version, ...extra },
    };
    pending.current = intent;
    setHasPending(true);
    try {
      await payoutApi.command(
        id,
        intent.action,
        intent.payload,
        tenantId,
        intent.resourceId,
        current.signal,
      );
      if (!current.signal.aborted) {
        pending.current = null;
        setHasPending(false);
        setReasonTarget(null);
        reason.reset();
        resolution.reset();
        setRevision((value) => value + 1);
        onChanged();
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

  const more = async () => {
    const current = request.current;
    if (!cursor || !current || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const page = await payoutApi.lines(id, { tenantId, cursor }, current.signal);
      if (!current.signal.aborted) {
        setLines((old) => [...old, ...page.items]);
        setCursor(page.pagination.nextCursor);
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
    if (!file || !current || busyRef.current) return;
    if (file.size > 20 * 1024 * 1024 || file.type !== 'application/pdf') {
      setError(t('pdfRequired'));
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await payoutApi.upload(id, file, tenantId, current.signal);
      if (!current.signal.aborted) {
        transfer.setValue('evidenceKey', result.evidenceKey, { shouldValidate: true });
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

  return (
    <Modal isOpen title={t('statementDetail')} onClose={onClose} width="960px">
      <div className="space-y-4" aria-busy={loading || busy}>
        {error && <Alert variant="error">{error}</Alert>}
        {hasPending && (
          <Alert variant="warning">
            {t('uncertain')}{' '}
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (pending.current) void perform(pending.current.action);
              }}
            >
              {t('retrySame')}
            </Button>
          </Alert>
        )}

        {loading ? (
          <p role="status" className="text-sm text-[var(--sc-text-secondary)]">
            {t('loading')}
          </p>
        ) : (
          row && (
            <>
              {/* Unified Snapshot & Balances Card */}
              <Card
                padding="none"
                className="overflow-hidden border border-[var(--sc-border-default)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sc-border-default)] px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary)]">
                      <CalendarDays size={16} aria-hidden="true" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--sc-text-primary)]">
                          {row.periodStart} — {row.periodEnd}
                        </span>
                        <Badge
                          status={
                            row.status === 'PAID'
                              ? 'success'
                              : row.status === 'APPROVED'
                                ? 'info'
                                : 'default'
                          }
                          label={t(`status.${row.status}`)}
                        />
                      </div>
                      <p className="mb-0 mt-0.5 text-xs text-[var(--sc-text-secondary)]">
                        {t('frozenSnapshot')} · {t('deadline')}: {date(row.reviewDeadlineAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {can('statement.review') && reviewOpen && (
                      <Button
                        size="sm"
                        disabled={busy || hasPending}
                        onClick={() => void perform('confirm')}
                      >
                        {t('confirm')}
                      </Button>
                    )}
                    {can('payout.manage') &&
                      !row.isLegacy &&
                      row.status === 'DRAFT' &&
                      now < new Date(row.reviewDeadlineAt) && (
                        <Button
                          size="sm"
                          disabled={busy || hasPending}
                          onClick={() => void perform('send')}
                        >
                          {t('send')}
                        </Button>
                      )}
                    {can('payout.manage') &&
                      !row.isLegacy &&
                      ['CONFIRMED', 'AUTO_CONFIRMED'].includes(row.status) && (
                        <Button
                          size="sm"
                          disabled={busy || hasPending || !vietnamWednesday(now)}
                          onClick={() => void perform('approve')}
                        >
                          {t('approve')}
                        </Button>
                      )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        pending.current = null;
                        setHasPending(false);
                        setRevision((value) => value + 1);
                      }}
                    >
                      <RefreshCw size={13} aria-hidden="true" />
                      {t('refresh')}
                    </Button>
                  </div>
                </div>

                {/* 3-Column Balances Strip */}
                <div className="grid divide-y border-b border-[var(--sc-border-default)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  {(
                    [
                      ['opening', row.openingBalanceVnd],
                      ['closing', row.closingBalanceVnd],
                      ['approved', row.approvedAmountVnd],
                    ] as const
                  ).map(([label, amount]) => (
                    <div key={label} className="px-5 py-3.5">
                      <p className="m-0 text-xs text-[var(--sc-text-secondary)]">{t(label)}</p>
                      <p className="mb-0 mt-1 text-base font-semibold tabular-nums text-[var(--sc-text-primary)]">
                        {amount === null ? t('notApproved') : money(amount)}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Dispute Summary Strip */}
                {row.review && (
                  <div className="border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/30 px-5 py-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--sc-text-secondary)]">
                        {t('disputeSummary')}
                      </h3>
                      <Badge
                        status={row.review.openDisputeCount ? 'warning' : 'success'}
                        label={t('openDisputes', { count: row.review.openDisputeCount })}
                      />
                    </div>
                    <dl className="mt-2.5 grid gap-3 sm:grid-cols-3">
                      {[
                        ['frozenEligible', row.eligibleAmountVnd],
                        ['disputedCredits', row.review.disputedCreditsVnd],
                        ['disputedDebits', row.review.disputedDebitsVnd],
                      ].map(([label, amount]) => (
                        <div key={label}>
                          <dt className="text-xs text-[var(--sc-text-secondary)]">{t(label)}</dt>
                          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--sc-text-primary)]">
                            {money(amount)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                {/* Recorded Transfer Strip */}
                {row.transfer && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sc-border-default)] bg-[var(--sc-success-bg)]/40 px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Badge status="success" label={t('recordedTransfer')} />
                      <span className="text-sm font-semibold tabular-nums text-[var(--sc-text-primary)]">
                        {money(row.transfer.amountVnd)}
                      </span>
                      <span className="text-xs text-[var(--sc-text-secondary)]">
                        · {date(row.transfer.confirmedAt)}
                      </span>
                    </div>
                    <code className="rounded bg-[var(--sc-bg-surface)] px-2 py-0.5 font-mono text-xs text-[var(--sc-text-primary)]">
                      {t('bankReference')}: {row.transfer.bankReference}
                    </code>
                  </div>
                )}

                <div className="bg-[var(--sc-bg-secondary)]/40 px-5 py-2.5 text-xs text-[var(--sc-text-secondary)]">
                  {row.isLegacy ? t('legacy') : t('reviewHelp')}{' '}
                  {can('payout.manage') &&
                    ['CONFIRMED', 'AUTO_CONFIRMED', 'APPROVED'].includes(row.status) &&
                    t('wednesday')}
                </div>
              </Card>

              {/* Statement Lines Table */}
              <div className="overflow-x-auto rounded-xl border border-[var(--sc-border-default)]">
                <table className="w-full text-left text-sm" aria-label={t('lines')}>
                  <thead className="border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/60 text-xs font-semibold uppercase tracking-wider text-[var(--sc-text-secondary)]">
                    <tr>
                      {['source', 'amount', 'state', 'actions'].map((key) => (
                        <th key={key} className="px-4 py-3">
                          {t(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--sc-border-default)]">
                    {lines.map((line) => (
                      <tr key={line.id}>
                        <td className="max-w-xs px-4 py-3">
                          <div className="font-medium text-[var(--sc-text-primary)]">
                            {t.has(`entry.${line.entryType}`)
                              ? t(`entry.${line.entryType}`)
                              : line.entryType}
                          </div>
                          <p className="mb-0 mt-0.5 text-xs text-[var(--sc-text-secondary)]">
                            {t.has(`sourceType.${line.sourceType}`)
                              ? t(`sourceType.${line.sourceType}`)
                              : line.sourceType}
                          </p>
                          {line.disputes.map((dispute) => (
                            <p key={dispute.id} className="mb-0 mt-1.5 text-xs">
                              {dispute.reason}
                              {dispute.resolutionReason && ` · ${dispute.resolutionReason}`}
                              {dispute.adjustmentEntryId && (
                                <span className="mt-0.5 block break-all font-mono text-[11px] text-[var(--sc-text-secondary)]">
                                  {t('adjustmentReference')}: {dispute.adjustmentEntryId}
                                </span>
                              )}
                            </p>
                          ))}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums">
                          {money(line.amountVnd)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            status={
                              line.lineStatus === 'DISPUTED' || line.lineStatus === 'DEFERRED'
                                ? 'warning'
                                : line.lineStatus === 'PAID'
                                  ? 'success'
                                  : 'info'
                            }
                            label={t(`lineStatus.${line.lineStatus}`)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          {can('statement.review') &&
                            reviewOpen &&
                            !line.disputes.some((d) => d.status === 'OPEN') && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy || hasPending}
                                onClick={() => {
                                  reason.reset();
                                  setReasonTarget({ lineId: line.id });
                                }}
                              >
                                {t('dispute')}
                              </Button>
                            )}
                          {can('payout.manage') &&
                            ['PAID', 'CLOSED'].includes(row.status) &&
                            line.disputes
                              .filter((d) => d.status === 'OPEN')
                              .map((dispute) => (
                                <Button
                                  key={dispute.id}
                                  size="sm"
                                  variant="outline"
                                  disabled={busy || hasPending}
                                  onClick={() => {
                                    resolution.reset();
                                    setReasonTarget({ lineId: line.id, disputeId: dispute.id });
                                  }}
                                >
                                  {t('resolve')}
                                </Button>
                              ))}
                        </td>
                      </tr>
                    ))}
                    {!lines.length && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-[var(--sc-text-secondary)]">
                          {t('emptyLines')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {cursor && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void more()}>
                  {t('more')}
                </Button>
              )}

              {reasonTarget && (
                <div ref={reasonCardRef} className="pt-1">
                  <Card>
                    <form
                      className="space-y-3"
                      onSubmit={
                        reasonTarget.disputeId
                          ? resolution.handleSubmit(
                              (values) => perform('resolve', values, reasonTarget.disputeId),
                              () => notifyInvalidForm(),
                            )
                          : reason.handleSubmit(
                              (values) => perform('dispute', values, reasonTarget.lineId),
                              () => notifyInvalidForm(),
                            )
                      }
                    >
                      <Input
                        label={t('reason')}
                        {...(reasonTarget.disputeId
                          ? resolution.register('reason')
                          : reason.register('reason'))}
                        error={
                          (
                            reasonTarget.disputeId
                              ? resolution.formState.errors.reason
                              : reason.formState.errors.reason
                          )
                            ? t('invalidReason')
                            : undefined
                        }
                        disabled={busy || hasPending}
                      />
                      {reasonTarget.disputeId && (
                        <Input
                          label={t('adjustment')}
                          {...resolution.register('adjustmentVnd')}
                          error={
                            resolution.formState.errors.adjustmentVnd
                              ? t('invalidAmount')
                              : undefined
                          }
                          disabled={busy || hasPending}
                        />
                      )}
                      <Button type="submit" size="sm" disabled={busy || hasPending}>
                        {reasonTarget.disputeId ? t('resolve') : t('dispute')}
                      </Button>
                    </form>
                  </Card>
                </div>
              )}

              {can('payout.manage') && !row.isLegacy && row.status === 'APPROVED' && (
                <Card>
                  <h3 className="m-0 mb-1 text-sm font-semibold">{t('recordTransfer')}</h3>
                  <p className="mb-3 mt-0 text-xs text-[var(--sc-text-secondary)]">
                    {t('transferHelp')}
                  </p>
                  <form
                    className="grid gap-3 sm:grid-cols-2"
                    onSubmit={transfer.handleSubmit(
                      (values) =>
                        perform('transfers', { ...values, amountVnd: row.approvedAmountVnd }),
                      () => notifyInvalidForm(),
                    )}
                  >
                    <Input
                      label={t('bankReference')}
                      placeholder="VD: VCB-99887766"
                      {...transfer.register('bankReference')}
                      disabled={busy || hasPending}
                      error={
                        transfer.formState.errors.bankReference ? t('invalidReference') : undefined
                      }
                    />
                    <Input
                      type="datetime-local"
                      label={t('transferredAt')}
                      value={localTransferTime}
                      disabled={busy || hasPending}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setLocalTransferTime(raw);
                        const parsed = raw ? new Date(raw) : null;
                        transfer.setValue(
                          'transferredAt',
                          parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : '',
                          { shouldValidate: true },
                        );
                      }}
                      error={transfer.formState.errors.transferredAt ? t('invalidTime') : undefined}
                    />
                    <Input
                      type="file"
                      accept="application/pdf"
                      label={t('evidence')}
                      disabled={busy || hasPending}
                      onChange={(event) => void upload(event.target.files?.[0])}
                      error={transfer.formState.errors.evidenceKey ? t('pdfRequired') : undefined}
                    />
                    <div className="flex items-end justify-between gap-3">
                      <span className="text-xs text-[var(--sc-text-secondary)]">
                        {transfer.watch('evidenceKey') ? t('evidenceReady') : t('pdfRequired')}
                      </span>
                      <Button type="submit" size="sm" disabled={busy || hasPending}>
                        {t('recordTransfer')}
                      </Button>
                    </div>
                  </form>
                </Card>
              )}
            </>
          )
        )}
      </div>
    </Modal>
  );
}
