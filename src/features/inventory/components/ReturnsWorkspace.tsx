import { useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert, Badge, Button, PageHeader, Select } from '@/components/Common';
import { SellerWithdrawalForm, orderScope } from '@/features/orders';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';

import { InventoryWorkflowAction, type WorkflowAction } from './InventoryWorkflowAction';
import { ReturnActionForm, type ReturnAction } from './ReturnActionForm';
import { ReturnRequestForm } from './ReturnRequestForm';
import { returnWorkflowApi, type ReturnRecord } from '../api/returnWorkflowApi';
import { useWarehouseOptions } from '../hooks/useWarehouseOptions';

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
      <Select
        label={t('warehouse')}
        value={wh}
        disabled={requesting || !!action || !!disposal || !!withdrawal || warehouseLoading}
        onChange={(e) => {
          setSelected(e.target.value);
          setCursor(undefined);
        }}
        options={[
          { value: '', label: t('chooseWarehouse') },
          ...warehouses.map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` })),
        ]}
      />
      {warehouseLoading && <p role="status">{t('loading')}</p>}
      {warehouseError && (
        <Alert variant="error" title={t('loadError')}>
          <Button onClick={refetch}>{t('retry')}</Button>
        </Alert>
      )}
      {!warehouseLoading && !warehouseError && warehouses.length === 0 && (
        <p>{t('noWarehouses')}</p>
      )}
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
      {wh && (
        <ReturnQueue
          key={`${wh}:${cursor ?? ''}:${attempt}`}
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
}: {
  warehouseId: string;
  cursor?: string;
  onCursor: (value: string | undefined) => void;
  onAction: (value: ReturnAction) => void;
  onDisposal: (value: WorkflowAction) => void;
  onWithdrawal: (lotId: string) => void;
}) {
  const t = useTranslations('Returns'),
    { can } = useAccess();
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
      {records.map((r) => (
        <section key={r.id} className="sc-surface space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="m-0 break-all text-sm font-semibold">{r.id}</h2>
            <Badge
              status={r.status === 'COMPLETED' ? 'success' : 'info'}
              label={t.has(`status_${r.status}`) ? t(`status_${r.status}`) : r.status}
            />
            <span>{t(r.kind)}</span>
          </div>
          {r.reason && <p className="text-sm">{r.reason}</p>}
          {r.inspectionDueAt && (
            <p className="text-sm">
              {t('inspectionDue')}: {new Date(r.inspectionDueAt).toLocaleString()}
            </p>
          )}
          {r.inspectionOverdue && <Alert variant="warning" title={t('overdue')} />}
          {r.reverseTrackingNumber && (
            <p className="text-sm">
              {t('reverseTracking')}: {r.reverseTrackingNumber} · {r.reverseShipmentStatus}
            </p>
          )}
          {r.warehouseNoticeStatus && (
            <p className="text-sm">
              {t('warehouseNotice')}: {t(`notice_${r.warehouseNoticeStatus}`)}
            </p>
          )}
          {r.kind === 'POST_DELIVERY' && r.status === 'AUTHORIZED' && !r.reverseBookingState && (
            <Alert variant="info" title={t('reversePending')} />
          )}
          <div className="flex gap-2">
            {can('returns.authorize') && r.status === 'REQUESTED' && (
              <Button onClick={() => onAction({ kind: 'authorize', id: r.id, version: r.version })}>
                {t('authorize')}
              </Button>
            )}
            {can('returns.receive') && ['AUTHORIZED', 'IN_TRANSIT'].includes(r.status) && (
              <Button onClick={() => onAction({ kind: 'arrival', id: r.id, version: r.version })}>
                {t('arrival')}
              </Button>
            )}
          </div>
          {r.lines.map((l) => (
            <div key={l.id} className="space-y-2 border-t border-[var(--sc-border-default)] pt-3">
              <p className="m-0 text-sm font-medium">
                {l.sku} · {l.lotCode}
              </p>
              <p className="m-0 text-sm">
                {t('requestedQty')}: {l.requestedQty} · {t('receivedQty')}: {l.receivedQty} ·{' '}
                {t('restockedQty')}: {l.restockedQty} · {t('quarantinedQty')}: {l.quarantinedQty}
              </p>
              <p className="m-0 text-sm">
                {t(`classification_${l.classification}`)} ·{' '}
                {t(l.reviewed ? 'reviewed' : 'pendingReview')}
              </p>
              {l.reviewReason && <p>{l.reviewReason}</p>}
              <div className="flex flex-wrap gap-2">
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
