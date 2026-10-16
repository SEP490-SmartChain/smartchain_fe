import { useCallback, useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock3,
  RefreshCw,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Alert, Button, Card, Checkbox, Input, Select } from '@/components/Common';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import styles from './ReceiptWorkspace.module.css';
import {
  reviewApi,
  reviewValuesSchema,
  type ReviewInput,
  type ReviewState,
} from '../api/reviewApi';

import type { z } from 'zod';

interface Props {
  onPendingChange?: (key: string, locked: boolean) => void;
  warehouseId: string;
  asnId: string;
  receiptVersion: number;
  mediaRevision?: number;
  isCountComplete: boolean;
  canWrite: boolean;
  onSaved: () => void;
}
export function ReceiptReviewPanel({
  onPendingChange,
  warehouseId,
  asnId,
  receiptVersion,
  mediaRevision = 0,
  isCountComplete,
  canWrite,
  onSaved,
}: Props) {
  const t = useTranslations('Receiving');
  const locale = useLocale();
  const owner = useAuthStore((s) => s.user);
  const [expanded, setExpanded] = useState(true),
    [state, setState] = useState<ReviewState | null>(null);
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const [refresh, setRefresh] = useState(0),
    [attempt, setAttempt] = useState<{ input: ReviewInput; receiptId: string } | null>(null);
  useEffect(() => {
    onPendingChange?.(`review:${asnId}`, busy || attempt !== null);
    return () => onPendingChange?.(`review:${asnId}`, false);
  }, [onPendingChange, asnId, busy, attempt]);
  const generation = useRef(0),
    active = useRef<AbortController | null>(null),
    operation = useRef(createUuid());
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
  const [returnConfirmed, setReturnConfirmed] = useState(false);
  const [decisionError, setDecisionError] = useState('');
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
    setDecisionError('');
    setReturnConfirmed(false);
    operation.current = createUuid();
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
  }, [expanded, warehouseId, asnId, receiptVersion, mediaRevision, owner, refresh, current, t]);
  async function send(input: ReviewInput, receiptId: string) {
    if (
      busy ||
      !canWrite ||
      (input.decision === 'RETURN' && !returnConfirmed) ||
      (!attempt && (!state?.ready || (input.decision === 'APPROVE' && !state.canApprove)))
    ) {
      return;
    }
    const version = generation.current;
    if (!current(version)) return;
    setBusy(true);
    setError('');
    setSuccess('');
    setDecisionError('');
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
      operation.current = createUuid();
      reset({ decision: 'APPROVE', reason: '' });
      setReturnConfirmed(false);
      setSuccess(t(result.decision === 'APPROVE' ? 'reviewApproved' : 'reviewReturned'));
      setRefresh((v) => v + 1);
      onSaved();
    } catch (reason: unknown) {
      if (!current(version)) return;
      setDecisionError(
        reason instanceof ApiError && [400, 403, 404, 409, 422].includes(reason.status)
          ? t(
              reason.status === 403 || reason.status === 404
                ? 'reviewAccessChanged'
                : 'reviewEvidenceChanged',
            )
          : t('reviewSubmitError'),
      );
      if (reason instanceof ApiError && [400, 403, 404, 409, 422].includes(reason.status)) {
        setAttempt(null);
        setReturnConfirmed(false);
        operation.current = createUuid();
        setState(null);
        setRefresh((v) => v + 1);
      } else setAttempt({ input, receiptId });
    } finally {
      if (current(version)) setBusy(false);
    }
  }
  const isApproved = state?.status === 'APPROVED' || state?.status === 'COMPLETED';
  const returned = state?.status === 'RECEIVING' && state.items.at(-1)?.decision === 'RETURN';
  const totals = state?.records.reduce(
    (sum, record) => ({
      actual: sum.actual + record.receivedQty,
      accepted: sum.accepted + (record.inspection?.acceptedQty ?? 0),
      quarantine: sum.quarantine + (record.inspection?.quarantinedQty ?? 0),
      rejected: sum.rejected + (record.inspection?.rejectedQty ?? 0),
    }),
    { actual: 0, accepted: 0, quarantine: 0, rejected: 0 },
  );
  const hasCompleteQc =
    isCountComplete && state?.records.every((record) => record.inspection !== null);
  const panelId = `review-${asnId}`;
  return (
    <Card padding="none" className={styles.panel}>
      <div className={`${styles.actionPanelHeader} ${styles.reviewPanelHeader}`}>
        <h2 className={styles.actionPanelHeading}>
          <Button
            type="button"
            variant="ghost"
            className={styles.actionPanelToggle}
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((v) => !v)}
          >
            <ClipboardCheck size={20} aria-hidden="true" className={styles.panelIcon} />
            <span>{t(canWrite ? 'reviewTitle' : 'reviewHistoryTitle')}</span>
            {expanded ? (
              <ChevronUp size={16} aria-hidden="true" className={styles.chevron} />
            ) : (
              <ChevronDown size={16} aria-hidden="true" className={styles.chevron} />
            )}
          </Button>
        </h2>
        {expanded && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={styles.actionPanelRefresh}
            aria-label={t('reviewReload')}
            disabled={busy || loading}
            onClick={() => setRefresh((v) => v + 1)}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {t('reviewReload')}
          </Button>
        )}
      </div>
      {expanded && (
        <div id={panelId} className={styles.panelBody}>
          {loading && <p role="status">{t('loading')}</p>}
          {error && <Alert variant="error" title={error} />}
          {decisionError && <Alert variant="error" title={decisionError} />}
          {success && <Alert variant="success" title={success} />}
          {attempt && <Alert variant="warning" title={t('reviewUncertain')} />}
          {state && (
            <div role="status" className={styles.status} data-approved={isApproved}>
              <p className={styles.statusTitle}>
                {isApproved ? (
                  <CheckCircle2 size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
                ) : (
                  <Clock3 size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
                )}
                {t(
                  isApproved
                    ? 'receiptApproved'
                    : returned
                      ? 'progressReinspection'
                      : state.status === 'CANCELLED'
                        ? 'progressCancelled'
                        : state.canApprove
                          ? 'reviewReadyTitle'
                          : 'receiptIncomplete',
                )}
              </p>
            </div>
          )}
          {totals && (
            <dl className={styles.metrics} aria-label={t('reviewQuantitySummary')}>
              {(
                [
                  { key: 'actual', label: 'summaryActual', tone: 'default' },
                  { key: 'accepted', label: 'summaryAccepted', tone: 'success' },
                  { key: 'quarantine', label: 'summaryQuarantine', tone: 'warning' },
                  { key: 'rejected', label: 'summaryRejected', tone: 'error' },
                ] as const
              ).map((metric) => (
                <div
                  key={metric.key}
                  className={styles.metric}
                  data-tone={totals[metric.key] > 0 ? metric.tone : 'default'}
                >
                  <dt>{t(metric.label)}</dt>
                  <dd>
                    {!isCountComplete || (metric.key !== 'actual' && !hasCompleteQc)
                      ? '—'
                      : totals[metric.key].toLocaleString(locale)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {!!state?.blockers?.length && state.status === 'RECEIVING' && (
            <ul
              className="list-inside list-disc space-y-1 text-sm"
              aria-label={t('reviewBlockers')}
            >
              {(
                [
                  'EVIDENCE_REQUIRED',
                  'COUNT_REQUIRED',
                  'INSPECTION_REQUIRED',
                  'DISCREPANCY_REPORT_REQUIRED',
                ] as const
              ).map((code) => {
                const count = state.blockers?.filter((b) => b.code === code).length ?? 0;
                return count > 0 ? <li key={code}>{t(`blocker${code}`, { count })}</li> : null;
              })}
            </ul>
          )}
          {state && !state.ready && !state.blockers && state.status === 'RECEIVING' && (
            <Alert variant="info" title={t('reviewIncompleteFallback')} />
          )}
          {!!state?.records.length && (
            <details className={styles.details}>
              <summary>{t('reviewLotDetails', { count: state.records.length })}</summary>
              {state.records.map((r) => (
                <div key={r.receivingRecordId} className={styles.record}>
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
                      {r.inspection.reason && <p>{r.inspection.reason}</p>}
                    </>
                  )}
                </div>
              ))}
            </details>
          )}
          {state?.unreportedDiscrepancies !== undefined && state.unreportedDiscrepancies > 0 && (
            <Alert
              variant="warning"
              title={t('reviewMissingReports', { count: state.unreportedDiscrepancies })}
            />
          )}
          {!!state?.items.length && (
            <details className={styles.details}>
              <summary>{t('reviewDecisions')}</summary>
              {state.items.map((row) => (
                <div key={row.id} className={styles.history}>
                  <p className="font-medium">
                    {t('reviewRound', { round: row.receivingRound })} ·{' '}
                    {t(row.decision === 'APPROVE' ? 'reviewApproveChoice' : 'reviewReturnChoice')}
                  </p>
                  <p>{row.reason}</p>
                  <p className="text-xs text-[var(--sc-text-secondary)]">
                    {new Date(row.reviewedAt).toLocaleString(locale)}
                  </p>
                </div>
              ))}
            </details>
          )}
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
                {decision === 'RETURN' && (
                  <>
                    <Alert variant="warning" title={t('reviewReturnWarning')} />
                    <Checkbox
                      label={t('reviewReturnConfirm')}
                      checked={returnConfirmed}
                      onChange={(event) => setReturnConfirmed(event.target.checked)}
                    />
                  </>
                )}
                <Button
                  type="submit"
                  disabled={decision === 'APPROVE' ? !state.canApprove : !returnConfirmed}
                  isLoading={busy}
                  className="w-full"
                >
                  {t(decision === 'APPROVE' ? 'reviewApproveChoice' : 'reviewReturnChoice')}
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
        </div>
      )}
    </Card>
  );
}
