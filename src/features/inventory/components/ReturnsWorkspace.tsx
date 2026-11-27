import { useEffect, useState } from 'react';

import { useLocale, useTranslations } from 'next-intl';

import { Alert, Badge, Button, PageHeader, Select } from '@/components/Common';
import { SellerWithdrawalForm, orderScope } from '@/features/orders';
import { useAccess } from '@/hooks/useAccess';
import { createUuid } from '@/lib/uuid';
import { useAuthStore } from '@/stores/authStore';

import { InventoryWorkflowAction, type WorkflowAction } from './InventoryWorkflowAction';
import { ReturnActionForm, type ReturnAction } from './ReturnActionForm';
import { ReturnRequestForm } from './ReturnRequestForm';
import { returnWorkflowApi, type ReturnRecord } from '../api/returnWorkflowApi';
import { useWarehouseOptions } from '../hooks/useWarehouseOptions';

const CLASSIFICATION_STATUS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  ACCEPTED: 'success',
  DAMAGED: 'error',
  UNKNOWN: 'warning',
  PENDING: 'default',
};
const INSPECTION_OPEN = ['ARRIVED', 'INSPECTING', 'REVIEW_PENDING'];

function showDue(r: ReturnRecord): boolean {
  return Boolean(r.inspectionDueAt) && INSPECTION_OPEN.includes(r.status);
}

export function ReturnsWorkspace() {
  const revision = useAuthStore((s) => s.revision);
  return <ReturnsContent key={revision} />;
}
function ReturnsContent() {
  const t = useTranslations('Returns'),
    { can } = useAccess();
  const permitted = can('returns.view') || can('returns.operations.view'),
    {
      warehouses,
      error: warehouseError,
      isLoading: warehouseLoading,
      refetch,
    } = useWarehouseOptions(permitted);
  const [selected, setSelected] = useState(''),
    [cursor, setCursor] = useState<string>(),
    [attempt, setAttempt] = useState(0),
    [requesting, setRequesting] = useState(false),
    [action, setAction] = useState<ReturnAction | null>(null);
  const [disposal, setDisposal] = useState<WorkflowAction | null>(null);
  const [withdrawal, setWithdrawal] = useState<{ warehouseId: string; lotId: string } | null>(null);
  const wh = warehouses.some((w) => w.id === selected)
    ? selected
    : warehouses.length === 1
      ? warehouses[0].id
      : '';
  if (!permitted) return <Alert variant="error" title={t('forbidden')} />;
  return (
    <div className="space-y-5">
      <PageHeader title={t('title')} description={t('description')} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:max-w-md">
          <Select
            label={t('warehouse')}
            value={wh}
            disabled={requesting || !!action || !!disposal || !!withdrawal || warehouseLoading}
            onChange={(e) => {
              setSelected(e.target.value);
              setCursor(undefined);
            }}
            placeholder={t('chooseWarehouse')}
            options={warehouses.map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` }))}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!wh || requesting || !!action || !!disposal || !!withdrawal}
            onClick={() => setAttempt((n) => n + 1)}
          >
            {t('refresh')}
          </Button>
          {can('returns.request') && wh && (
            <Button
              disabled={!!action || !!disposal || !!withdrawal}
              onClick={() => setRequesting(true)}
            >
              {t('request')}
            </Button>
          )}
        </div>
      </div>
      {warehouseLoading && <p role="status">{t('loading')}</p>}
      {warehouseError && (
        <Alert variant="error" title={t('loadError')}>
          <Button onClick={refetch}>{t('retry')}</Button>
        </Alert>
      )}
      {!warehouseLoading && !warehouseError && warehouses.length === 0 && (
        <p>{t('noWarehouses')}</p>
      )}
      {wh && (
        <ReturnQueue
          key={`${wh}:${cursor ?? ''}:${attempt}`}
          onChanged={() => setAttempt((n) => n + 1)}
          warehouseId={wh}
          cursor={cursor}
          onCursor={setCursor}
          onAction={setAction}
          onDisposal={setDisposal}
          onWithdrawal={(lotId) => setWithdrawal({ warehouseId: wh, lotId })}
        />
      )}
      {requesting && (
        <ReturnRequestForm
          warehouseId={wh}
          onClose={() => setRequesting(false)}
          onAccepted={() => {
            setRequesting(false);
            setCursor(undefined);
            setAttempt((n) => n + 1);
          }}
        />
      )}
      {action && (
        <ReturnActionForm
          warehouseId={wh}
          action={action}
          onClose={() => setAction(null)}
          onAccepted={() => {
            setAction(null);
            setAttempt((n) => n + 1);
          }}
        />
      )}
      {disposal && (
        <InventoryWorkflowAction
          warehouseId={wh}
          action={disposal}
          onClose={() => setDisposal(null)}
          onAccepted={() => {
            setDisposal(null);
            setAttempt((n) => n + 1);
          }}
        />
      )}
      {withdrawal && (
        <SellerWithdrawalForm
          isOpen
          scope={orderScope()}
          initialLot={withdrawal}
          onClose={() => setWithdrawal(null)}
          onAccepted={() => {
            setWithdrawal(null);
            setAttempt((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
function ReturnQueue({
  warehouseId,
  cursor,
  onCursor,
  onAction,
  onDisposal,
  onWithdrawal,
  onChanged,
}: {
  warehouseId: string;
  cursor?: string;
  onCursor: (value: string | undefined) => void;
  onAction: (value: ReturnAction) => void;
  onDisposal: (value: WorkflowAction) => void;
  onWithdrawal: (lotId: string) => void;
  onChanged: () => void;
}) {
  const t = useTranslations('Returns'),
    inventory = useTranslations('InventoryDetail'),
    orders = useTranslations('Orders'),
    locale = useLocale(),
    { can } = useAccess();
  const isOps = can('returns.operations.view');
  const canCancel = can('returns.request') && !isOps;
  const [cancelId, setCancelId] = useState<string | null>(null),
    [cancelError, setCancelError] = useState(false),
    [cancelling, setCancelling] = useState(false);
  async function cancelRequest(r: ReturnRecord) {
    setCancelling(true);
    setCancelError(false);
    try {
      await returnWorkflowApi.command(warehouseId, `${r.id}/cancel`, {
        operationId: createUuid(),
        expectedVersion: r.version,
      });
      setCancelId(null);
      onChanged();
    } catch {
      setCancelError(true);
    } finally {
      setCancelling(false);
    }
  }
  const timestamp = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
  const [records, setRecords] = useState<ReturnRecord[]>([]),
    [next, setNext] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [downloadError, setDownloadError] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void returnWorkflowApi
      .list(warehouseId, cursor, abort.signal)
      .then((p) => {
        if (!abort.signal.aborted) {
          setRecords(p.items);
          setNext(p.nextCursor);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [warehouseId, cursor]);
  async function photo(id: string, lineId: string) {
    setDownloadError(false);
    try {
      const { downloadUrl } = await returnWorkflowApi.download(warehouseId, id, lineId);
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    } catch {
      setDownloadError(true);
    }
  }
  return (
    <div className="space-y-4" aria-busy={loading}>
      {loading && <p role="status">{t('loading')}</p>}
      {(error || downloadError) && <Alert variant="error" title={t('loadError')} />}
      {!loading && !error && records.length === 0 && <p>{t('empty')}</p>}
      {[...records]
        .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt))
        .map((r) => (
          <section key={r.id} className="sc-surface space-y-4 p-5">
            <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="m-0 text-base font-semibold">{t(r.kind)}</h2>
                <Badge
                  status={
                    r.status === 'COMPLETED'
                      ? 'success'
                      : r.status === 'CANCELLED'
                        ? 'error'
                        : 'info'
                  }
                  label={
                    t.has(`status_${r.status}`)
                      ? t(`status_${r.status}`)
                      : inventory('statusUnknown')
                  }
                />
              </div>
              <time
                dateTime={r.requestedAt}
                className="text-xs text-[var(--sc-text-secondary)] tabular-nums"
              >
                {timestamp.format(new Date(r.requestedAt))}
              </time>
            </header>
            {/* Failed-delivery reasons are a fixed system string; the kind title already explains it. */}
            {r.reason && r.kind !== 'FAILED_DELIVERY' && (
              <p className="m-0 text-sm">
                <span className="text-[var(--sc-text-secondary)]">{t('reason')}: </span>
                {r.reason}
              </p>
            )}
            {r.inspectionOverdue && <Alert variant="warning" title={t('overdue')} />}
            {(showDue(r) || r.reverseTrackingNumber || (isOps && r.warehouseNoticeStatus)) && (
              <dl className="m-0 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {showDue(r) && r.inspectionDueAt && (
                  <div>
                    <dt className="text-xs text-[var(--sc-text-secondary)]">
                      {t('inspectionDue')}
                    </dt>
                    <dd className="m-0 tabular-nums" title={t('inspectionDueHint')}>
                      {timestamp.format(new Date(r.inspectionDueAt))}
                    </dd>
                  </div>
                )}
                {r.reverseTrackingNumber && (
                  <div>
                    <dt className="text-xs text-[var(--sc-text-secondary)]">
                      {t('reverseTracking')}
                    </dt>
                    <dd className="m-0">
                      {r.reverseTrackingNumber} ·{' '}
                      {r.reverseShipmentStatus && orders.has(`statuses.${r.reverseShipmentStatus}`)
                        ? orders(`statuses.${r.reverseShipmentStatus}`)
                        : inventory('statusUnknown')}
                    </dd>
                  </div>
                )}
                {isOps && r.warehouseNoticeStatus && (
                  <div>
                    <dt className="text-xs text-[var(--sc-text-secondary)]">
                      {t('warehouseNotice')}
                    </dt>
                    <dd
                      className={`m-0 ${r.warehouseNoticeStatus === 'FAILED' ? 'text-[var(--sc-error)]' : ''}`}
                    >
                      {t.has(`notice_${r.warehouseNoticeStatus}`)
                        ? t(`notice_${r.warehouseNoticeStatus}`)
                        : inventory('statusUnknown')}
                    </dd>
                  </div>
                )}
              </dl>
            )}
            {r.kind === 'POST_DELIVERY' && r.status === 'AUTHORIZED' && !r.reverseBookingState && (
              <Alert variant="info" title={t('reversePending')} />
            )}
            <div className="flex gap-2">
              {canCancel &&
                r.kind === 'POST_DELIVERY' &&
                !r.arrivedAt &&
                ['REQUESTED', 'AUTHORIZED'].includes(r.status) &&
                (cancelId === r.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">{t('cancelConfirm')}</span>
                    <Button
                      variant="danger"
                      size="sm"
                      isLoading={cancelling}
                      onClick={() => void cancelRequest(r)}
                    >
                      {t('confirmCancel')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cancelling}
                      onClick={() => setCancelId(null)}
                    >
                      {t('keepRequest')}
                    </Button>
                    {cancelError && <Alert variant="error" title={t('cancelError')} />}
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCancelError(false);
                      setCancelId(r.id);
                    }}
                  >
                    {t('cancelAction')}
                  </Button>
                ))}
              {can('returns.authorize') && r.status === 'REQUESTED' && (
                <Button
                  onClick={() => onAction({ kind: 'authorize', id: r.id, version: r.version })}
                >
                  {t('authorize')}
                </Button>
              )}
              {can('returns.receive') && ['AUTHORIZED', 'IN_TRANSIT'].includes(r.status) && (
                <Button
                  onClick={() =>
                    onAction({
                      kind: 'arrival',
                      id: r.id,
                      version: r.version,
                      label: r.reverseTrackingNumber
                        ? t('waybillLabel', { code: r.reverseTrackingNumber })
                        : undefined,
                    })
                  }
                >
                  {t('arrival')}
                </Button>
              )}
            </div>
            {r.lines.map((l) => (
              <div
                key={l.id}
                className="space-y-4 rounded-[12px] border border-[var(--sc-border-default)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="m-0 text-sm font-semibold">{l.sku}</p>
                    <p
                      className="m-0 truncate font-mono text-xs text-[var(--sc-text-tertiary)]"
                      title={l.lotCode}
                    >
                      {t('lot')}: {l.lotCode}
                    </p>
                  </div>
                  {/* QC badges only mean something once the warehouse has inspected the line. */}
                  {l.classification !== 'PENDING' && (
                    <div className="flex flex-wrap gap-1.5">
                      <Badge
                        status={CLASSIFICATION_STATUS[l.classification] ?? 'default'}
                        label={t(`classification_${l.classification}`)}
                      />
                      <Badge
                        status={l.reviewed ? 'success' : 'warning'}
                        variant="outline"
                        label={t(l.reviewed ? 'reviewed' : 'pendingReview')}
                      />
                    </div>
                  )}
                </div>
                <dl className="m-0 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(
                    [
                      ['requestedQty', l.requestedQty],
                      ['receivedQty', l.receivedQty],
                      ['restockedQty', l.restockedQty],
                      ['quarantinedQty', l.quarantinedQty],
                    ] as const
                  ).map(([key, value]) => (
                    <div key={key} className="rounded-[8px] bg-[var(--sc-bg-secondary)] px-3 py-2">
                      <dt className="text-xs text-[var(--sc-text-secondary)]">{t(key)}</dt>
                      <dd className="m-0 text-base font-semibold tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                {l.reviewReason && (
                  <p className="m-0 rounded-[8px] border border-[var(--sc-border-default)] px-3 py-2 text-sm">
                    <span className="text-[var(--sc-text-secondary)]">{t('reviewNote')}: </span>
                    {l.reviewReason}
                  </p>
                )}
                <div className="flex flex-wrap gap-3 border-t border-[var(--sc-border-default)] pt-4 empty:hidden">
                  {l.hasEvidence && (
                    <Button variant="outline" size="sm" onClick={() => void photo(r.id, l.id)}>
                      {t('viewPhoto')}
                    </Button>
                  )}
                  {can('returns.inspect') &&
                    r.arrivedAt &&
                    !l.reviewed &&
                    l.restockedQty + l.quarantinedQty === 0 && (
                      <Button
                        size="sm"
                        onClick={() =>
                          onAction({ kind: 'inspection', id: r.id, version: r.version, line: l })
                        }
                      >
                        {t('inspection')}
                      </Button>
                    )}
                  {can('returns.review') &&
                    l.classification !== 'PENDING' &&
                    l.hasEvidence &&
                    !l.reviewed && (
                      <Button
                        size="sm"
                        onClick={() =>
                          onAction({ kind: 'review', id: r.id, version: r.version, line: l })
                        }
                      >
                        {t('review')}
                      </Button>
                    )}
                  {can('returns.restock') &&
                    l.reviewed &&
                    l.restockedQty + l.quarantinedQty === 0 && (
                      <Button
                        size="sm"
                        onClick={() =>
                          onAction({ kind: 'stock', id: r.id, version: r.version, line: l })
                        }
                      >
                        {t('stock')}
                      </Button>
                    )}
                  {can('returns.disposition') && l.quarantinedQty > 0 && l.targetStockId && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        onDisposal({
                          kind: 'disposalRequest',
                          stockId: l.targetStockId ?? undefined,
                          maxQty: l.quarantinedQty,
                        })
                      }
                    >
                      {t('disposal')}
                    </Button>
                  )}
                  {can('orders.withdrawal.create') && l.quarantinedQty > 0 && (
                    <Button size="sm" variant="outline" onClick={() => onWithdrawal(l.lotId)}>
                      {t('withdraw')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <details className="text-xs text-[var(--sc-text-secondary)]">
              <summary className="cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)]">
                {inventory('lookupReferences')}
              </summary>
              <p className="mt-1 break-all font-mono">
                {t('returnReference')}: {r.id}
              </p>
            </details>
          </section>
        ))}
      <div className="flex gap-2">
        {cursor && (
          <Button variant="outline" onClick={() => onCursor(undefined)}>
            {t('first')}
          </Button>
        )}
        {next && (
          <Button variant="outline" onClick={() => onCursor(next)}>
            {t('next')}
          </Button>
        )}
      </div>
    </div>
  );
}
