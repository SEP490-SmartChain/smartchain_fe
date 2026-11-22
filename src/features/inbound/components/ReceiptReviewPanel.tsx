import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock3,
  RefreshCw,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Alert, Button, Card } from '@/components/Common';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { ReceiptReviewEvidence } from './ReceiptReviewEvidence';
import styles from './ReceiptWorkspace.module.css';
import { discrepancyApi, type DiscrepancyState } from '../api/discrepancyApi';
import { reviewApi, type ReviewInput, type ReviewState } from '../api/reviewApi';

import type { ReceivingState } from '../api/receivingApi';

interface Props {
  onPendingChange?: (key: string, locked: boolean) => void;
  warehouseId: string;
  asnId: string;
  receiptVersion: number;
  mediaRevision?: number;
  isCountComplete: boolean;
  canWrite: boolean;
  onSaved: () => void;
  lines?: ReceivingState['lines'];
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
  lines = [],
}: Props) {
  const t = useTranslations('Receiving');
  const locale = useLocale();
  const owner = useAuthStore((s) => s.user);
  const [expanded, setExpanded] = useState(true),
    [state, setState] = useState<ReviewState | null>(null);
  const [reports, setReports] = useState<DiscrepancyState['items']>([]);
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
    setReports([]);
    setAttempt(null);
    setBusy(false);
    setError('');
    setSuccess('');
    setDecisionError('');
    operation.current = createUuid();
    return () => {
      generation.current = version + 1;
      controller.abort();
    };
  }, [warehouseId, asnId, owner]);
  useEffect(() => {
    if (!expanded) return;
    const version = generation.current,
      controller = new AbortController();
    setLoading(true);
    void Promise.all([
      reviewApi.get(warehouseId, asnId, controller.signal),
      discrepancyApi.get(warehouseId, asnId, controller.signal),
    ])
      .then(([result, discrepancies]) => {
        if (
          result.receiptId !== discrepancies.receiptId ||
          result.receiptVersion !== discrepancies.receiptVersion ||
          result.discrepancyIds.some((id) => !discrepancies.items.some((item) => item.id === id))
        ) {
          throw new Error('Review evidence changed while loading');
        }
        if (!controller.signal.aborted && current(version)) {
          setState(result);
          setReports(discrepancies.items.filter((item) => result.discrepancyIds.includes(item.id)));
          setError('');
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && current(version)) {
          setState(null);
          setReports([]);
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
      (!attempt && (!state?.canApprove || state.hasVerifiedVideo !== true))
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
      const result = await reviewApi.finalize(
        warehouseId,
        asnId,
        receiptId,
        input,
        active.current?.signal,
      );
      if (!current(version)) return;
      setAttempt(null);
      operation.current = createUuid();
      setSuccess(
        result.stock.pending.length > 0
          ? t('receiptFinalizedStockPending', { count: result.stock.pending.length })
          : t('receiptFinalizedStockRecorded'),
      );
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
            <span>{t(canWrite ? 'finalizeTitle' : 'reviewHistoryTitle')}</span>
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
                  state.status === 'COMPLETED'
                    ? 'receiptCompleted'
                    : isApproved
                      ? 'receiptApproved'
                      : returned
                        ? 'progressReinspection'
                        : state.status === 'CANCELLED'
                          ? 'progressCancelled'
                          : state.canApprove && (!canWrite || state.hasVerifiedVideo)
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
          {state && (
            <ReceiptReviewEvidence records={state.records} reports={reports} lines={lines} />
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
          {canWrite && state?.status === 'RECEIVING' && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--sc-text-secondary)]">{t('finalizeHelp')}</p>
              {state.hasVerifiedVideo !== true && (
                <Alert variant="info">{t('finalizeVideoRequired')}</Alert>
              )}
              <Button
                type="button"
                className="w-full"
                isLoading={busy}
                disabled={
                  loading || !!attempt || !state.canApprove || state.hasVerifiedVideo !== true
                }
                onClick={() =>
                  void send(
                    {
                      decision: 'APPROVE',
                      reason: t('finalizeRecordedReason'),
                      operationKey: operation.current,
                      expectedVersion: state.receiptVersion,
                      inspectionIds: state.inspectionIds,
                      discrepancyIds: state.discrepancyIds,
                    },
                    state.receiptId,
                  )
                }
              >
                {t(
                  totals && totals.accepted + totals.quarantine > 0
                    ? 'finalizeAndRecordStock'
                    : 'finalizeAction',
                )}
              </Button>
            </div>
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
