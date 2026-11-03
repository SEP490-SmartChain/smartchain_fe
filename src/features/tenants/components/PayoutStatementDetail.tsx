import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { useAccess } from '@/hooks/useAccess';
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
    [now, setNow] = useState(() => new Date());
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
    defaultValues: { bankReference: '', transferredAt: '', evidenceKey: '' },
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
      <div className="space-y-5" aria-busy={loading || busy}>
        {error && <Alert variant="error">{error}</Alert>}
        {hasPending && (
          <Alert variant="warning">
            {t('uncertain')}{' '}
            <Button
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
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            pending.current = null;
            setHasPending(false);
            setRevision((value) => value + 1);
          }}
        >
          {t('refresh')}
        </Button>
        {loading ? (
          <p role="status">{t('loading')}</p>
        ) : (
          row && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
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
                <span className="text-sm text-[var(--sc-text-secondary)]">
                  {t('deadline')}: {date(row.reviewDeadlineAt)}
                </span>
              </div>
              <Card padding="sm" className="bg-[var(--sc-primary-alpha-08)]">
                <p className="text-xs font-medium uppercase text-[var(--sc-primary)]">
                  {t('frozenSnapshot')}
                </p>
                <p className="mt-1 font-semibold">
                  {row.periodStart} — {row.periodEnd}
                </p>
                <p className="mt-2 text-sm text-[var(--sc-text-secondary)]">{t('immutableHelp')}</p>
              </Card>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ['opening', row.openingBalanceVnd],
                    ['closing', row.closingBalanceVnd],
                    ['approved', row.approvedAmountVnd],
                  ] as const
                ).map(([label, amount]) => (
                  <Card key={label} padding="sm">
                    <p className="text-sm text-[var(--sc-text-secondary)]">{t(label)}</p>
                    <p className="mt-2 font-semibold tabular-nums">
                      {amount === null ? t('notApproved') : money(amount)}
                    </p>
                  </Card>
                ))}
              </div>
              {row.review && (
                <Card padding="sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{t('disputeSummary')}</h3>
                    <Badge
                      status={row.review.openDisputeCount ? 'warning' : 'success'}
                      label={t('openDisputes', { count: row.review.openDisputeCount })}
                    />
                  </div>
                  <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                    {[
                      ['frozenEligible', row.eligibleAmountVnd],
                      ['disputedCredits', row.review.disputedCreditsVnd],
                      ['disputedDebits', row.review.disputedDebitsVnd],
                    ].map(([label, amount]) => (
                      <div key={label}>
                        <dt className="text-xs text-[var(--sc-text-secondary)]">{t(label)}</dt>
                        <dd className="mt-1 text-lg font-semibold tabular-nums">{money(amount)}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-xs text-[var(--sc-text-secondary)]">
                    {t('disputeTotalsHelp')}
                  </p>
                </Card>
              )}
              {row.transfer && (
                <Card padding="sm" className="border-[var(--sc-success-border)]">
                  <Badge status="success" label={t('recordedTransfer')} />
                  <p className="mt-3 text-xl font-semibold tabular-nums">
                    {money(row.transfer.amountVnd)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--sc-text-secondary)]">
                    {date(row.transfer.confirmedAt)}
                  </p>
                  <p className="mt-2 break-all text-sm">
                    {t('bankReference')}: {row.transfer.bankReference}
                  </p>
                </Card>
              )}
              <Alert variant="info">{row.isLegacy ? t('legacy') : t('reviewHelp')}</Alert>
              <div className="flex flex-wrap gap-2">
                {can('statement.review') && reviewOpen && (
                  <Button disabled={busy || hasPending} onClick={() => void perform('confirm')}>
                    {t('confirm')}
                  </Button>
                )}
                {can('payout.manage') &&
                  !row.isLegacy &&
                  row.status === 'DRAFT' &&
                  now < new Date(row.reviewDeadlineAt) && (
                    <Button disabled={busy || hasPending} onClick={() => void perform('send')}>
                      {t('send')}
                    </Button>
                  )}
                {can('payout.manage') &&
                  !row.isLegacy &&
                  ['CONFIRMED', 'AUTO_CONFIRMED'].includes(row.status) && (
                    <Button
                      disabled={busy || hasPending || !vietnamWednesday(now)}
                      onClick={() => void perform('approve')}
                    >
                      {t('approve')}
                    </Button>
                  )}
              </div>
              {can('payout.manage') &&
                ['CONFIRMED', 'AUTO_CONFIRMED', 'APPROVED'].includes(row.status) && (
                  <p className="text-sm text-[var(--sc-text-secondary)]">{t('wednesday')}</p>
                )}
              <div className="overflow-x-auto rounded-xl border border-[var(--sc-border-default)]">
                <table className="w-full text-left text-sm" aria-label={t('lines')}>
                  <thead className="bg-[var(--sc-bg-secondary)]">
                    <tr>
                      {['source', 'amount', 'state', 'actions'].map((key) => (
                        <th key={key} className="p-3">
                          {t(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.id} className="border-t border-[var(--sc-border-default)]">
                        <td className="max-w-xs p-3">
                          <div>
                            {t.has(`entry.${line.entryType}`)
                              ? t(`entry.${line.entryType}`)
                              : line.entryType}
                          </div>
                          <details className="mt-1 text-xs text-[var(--sc-text-secondary)]">
                            <summary>{t('reference')}</summary>
                            <p className="break-all">
                              {line.sourceType} · {line.sourceId}
                            </p>
                            {line.carryForwardFromLineId && (
                              <p>
                                {t('carried')}: {line.carryForwardFromLineId}
                              </p>
                            )}
                          </details>
                          {line.disputes.map((dispute) => (
                            <p key={dispute.id} className="mt-2 text-xs">
                              {dispute.reason}
                              {dispute.resolutionReason && ` · ${dispute.resolutionReason}`}
                              {dispute.adjustmentEntryId && (
                                <span className="mt-1 block break-all text-[var(--sc-text-secondary)]">
                                  {t('adjustmentReference')}: {dispute.adjustmentEntryId}
                                </span>
                              )}
                            </p>
                          ))}
                        </td>
                        <td className="whitespace-nowrap p-3 font-medium tabular-nums">
                          {money(line.amountVnd)}
                        </td>
                        <td className="p-3">
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
                        <td className="p-3">
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
                <Button variant="outline" disabled={busy} onClick={() => void more()}>
                  {t('more')}
                </Button>
              )}
              {reasonTarget && (
                <div ref={reasonCardRef} className="pt-2">
                  <Card>
                    <form
                      className="space-y-3"
                      onSubmit={
                        reasonTarget.disputeId
                          ? resolution.handleSubmit((values) =>
                              perform('resolve', values, reasonTarget.disputeId),
                            )
                          : reason.handleSubmit((values) =>
                              perform('dispute', values, reasonTarget.lineId),
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
                      <Button type="submit" disabled={busy || hasPending}>
                        {reasonTarget.disputeId ? t('resolve') : t('dispute')}
                      </Button>
                    </form>
                  </Card>
                </div>
              )}
              {can('payout.manage') && !row.isLegacy && row.status === 'APPROVED' && (
                <Card>
                  <h3 className="mb-3 font-semibold">{t('recordTransfer')}</h3>
                  <p className="mb-4 text-sm text-[var(--sc-text-secondary)]">
                    {t('transferHelp')}
                  </p>
                  <form
                    className="grid gap-4 sm:grid-cols-2"
                    onSubmit={transfer.handleSubmit((values) =>
                      perform('transfers', { ...values, amountVnd: row.approvedAmountVnd }),
                    )}
                  >
                    <Input
                      label={t('bankReference')}
                      {...transfer.register('bankReference')}
                      disabled={busy || hasPending}
                      error={
                        transfer.formState.errors.bankReference ? t('invalidReference') : undefined
                      }
                    />
                    <Input
                      label={t('transferredAt')}
                      placeholder="2026-11-04T02:00:00Z"
                      {...transfer.register('transferredAt')}
                      disabled={busy || hasPending}
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
                    <div className="self-end text-sm">
                      {transfer.watch('evidenceKey') ? t('evidenceReady') : t('pdfRequired')}
                    </div>
                    <Button type="submit" disabled={busy || hasPending}>
                      {t('recordTransfer')}
                    </Button>
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
