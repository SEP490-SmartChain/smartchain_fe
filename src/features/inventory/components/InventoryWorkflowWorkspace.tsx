import { useEffect, useState } from 'react';

import { RefreshCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Alert, Badge, Button, PageHeader, Select, Tabs } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';

import { InventoryWorkflowAction, type WorkflowAction } from './InventoryWorkflowAction';
import {
  inventoryWorkflowApi,
  type WorkflowCount,
  type WorkflowDisposal,
  type WorkflowPutback,
} from '../api/inventoryWorkflowApi';
import { useWarehouseOptions } from '../hooks/useWarehouseOptions';

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  POSTED: 'success',
  APPROVED: 'success',
  EXECUTED: 'success',
  CONFIRMED: 'success',
  COMPLETED: 'success',
  REVIEW: 'warning',
  REQUESTED: 'info',
  PLANNED: 'info',
  COUNTING: 'info',
  ASSIGNED: 'info',
  REJECTED: 'error',
  REVOKED: 'error',
  CANCELLED: 'error',
};
export function InventoryWorkflowWorkspace({
  initialTab,
}: {
  /** `/warehouse/counts` opens on the count plan tab; the workflow route keeps its own default. */
  initialTab?: 'counts' | 'disposals' | 'putbacks';
} = {}) {
  const revision = useAuthStore((s) => s.revision);
  return <Workspace key={revision} initialTab={initialTab} />;
}
function Workspace({ initialTab }: { initialTab?: 'counts' | 'disposals' | 'putbacks' }) {
  const t = useTranslations('InventoryWorkflows');
  const locale = useLocale();
  // Session/role/tenant changes remount this workspace through the key in the wrapper above.
  const revision = useAuthStore((s) => s.revision);
  const { roles, actorScope, can } = useAccess();
  const manager = roles.includes('WAREHOUSE_MANAGER'),
    staff = roles.includes('WAREHOUSE_STAFF');
  const permitted = can('inventory.workflows.view');
  const {
    warehouses,
    error: warehouseError,
    isLoading: warehousesLoading,
    refetch,
  } = useWarehouseOptions(permitted);
  // Narrow count authority; the generic workflow screen view never grants a mutation.
  const canPlan = can('inventory.counts.plan'),
    canObserve = can('inventory.counts.observe');
  const [selected, setSelected] = useState(''),
    [tab, setTab] = useState<'counts' | 'disposals' | 'putbacks'>(
      actorScope === 'TENANT' ? 'disposals' : (initialTab ?? 'counts'),
    ),
    [reload, setReload] = useState(0),
    [cursor, setCursor] = useState<string | undefined>(),
    [next, setNext] = useState<string | null>(null),
    [counts, setCounts] = useState<WorkflowCount[]>([]),
    [disposals, setDisposals] = useState<WorkflowDisposal[]>([]),
    [putbacks, setPutbacks] = useState<WorkflowPutback[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(false),
    [action, setAction] = useState<WorkflowAction | null>(null),
    [downloadError, setDownloadError] = useState(false);
  const wh = warehouses.some((w) => w.id === selected)
    ? selected
    : warehouses.length === 1
      ? warehouses[0].id
      : '';
  useEffect(() => {
    if (!wh || !permitted) return;
    const abort = new AbortController();
    // The wrapper's key already remounts on scope change; this check also drops a response
    // that resolves in the gap between the store update and that unmount.
    const requestedRevision = revision;
    const isCurrent = () =>
      !abort.signal.aborted && useAuthStore.getState().revision === requestedRevision;
    setLoading(true);
    setError(false);
    setCounts([]);
    setDisposals([]);
    setPutbacks([]);
    setNext(null);
    void (async () => {
      try {
        if (tab === 'counts') {
          const page = await inventoryWorkflowApi.counts(wh, cursor, abort.signal);
          if (isCurrent()) {
            setCounts(page.items);
            setNext(page.nextCursor);
          }
        } else if (tab === 'disposals') {
          const page = await inventoryWorkflowApi.disposals(wh, cursor, abort.signal);
          if (isCurrent()) {
            setDisposals(page.items);
            setNext(page.nextCursor);
          }
        } else {
          const page = await inventoryWorkflowApi.putbacks(wh, cursor, abort.signal);
          if (isCurrent()) {
            setPutbacks(page.items);
            setNext(page.nextCursor);
          }
        }
      } catch {
        if (isCurrent()) setError(true);
      } finally {
        if (isCurrent()) setLoading(false);
      }
    })();
    return () => abort.abort();
  }, [wh, tab, reload, cursor, permitted, revision]);
  async function evidence(kind: 'counts' | 'disposals', id: string) {
    setDownloadError(false);
    const requestedRevision = revision;
    try {
      const value = await inventoryWorkflowApi.download(wh, kind, id);
      if (useAuthStore.getState().revision !== requestedRevision) return;
      window.open(value.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch {
      if (useAuthStore.getState().revision === requestedRevision) setDownloadError(true);
    }
  }
  const status = (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : t('unknownStatus'));
  const badgeVariant = (s: string) => STATUS_BADGE[s] ?? 'default';
  const visibleTabs = (
    actorScope === 'TENANT'
      ? (['disposals'] as const)
      : (['counts', 'putbacks', 'disposals'] as const)
  ).map((id) => ({ id, label: t(id) }));
  if (!permitted) return <Alert variant="error" title={t('forbidden')} />;
  return (
    <div className="space-y-5">
      <PageHeader title={t('title')} description={t('description')} />
      <div className="sc-surface flex flex-wrap items-end justify-between gap-4 p-4">
        <div className="min-w-[260px] flex-1 sm:max-w-md">
          <Select
            label={t('warehouse')}
            disabled={!!action || warehousesLoading || !!warehouseError}
            value={wh}
            onChange={(e) => {
              setSelected(e.target.value);
              setCursor(undefined);
            }}
            options={[
              { value: '', label: t('selectWarehouse') },
              ...warehouses.map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` })),
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={loading || !wh}
            onClick={() => setReload((v) => v + 1)}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {t('refresh')}
          </Button>
          {canPlan && tab === 'counts' && wh && (
            <Button onClick={() => setAction({ kind: 'countPlan' })}>{t('countPlan')}</Button>
          )}
          {manager && tab === 'putbacks' && wh && (
            <Button onClick={() => setAction({ kind: 'putbackRequest' })}>
              {t('putbackRequest')}
            </Button>
          )}
        </div>
      </div>
      {warehousesLoading && <p role="status">{t('loading')}</p>}
      {warehouseError && (
        <Alert variant="error" title={t('loadError')}>
          <Button variant="outline" onClick={refetch}>
            {t('refresh')}
          </Button>
        </Alert>
      )}
      {!warehousesLoading && !warehouseError && !warehouses.length && (
        <Alert>{t('noWarehouse')}</Alert>
      )}
      <Tabs
        id="inventory-workflows"
        label={t('title')}
        tabs={visibleTabs}
        activeId={tab}
        onChange={(id) => {
          if (action) return;
          setTab(id as 'counts' | 'disposals' | 'putbacks');
          setCursor(undefined);
        }}
      />
      {(error || downloadError) && <Alert variant="error" title={t('loadError')} />}
      {loading && (
        <p role="status" className="text-sm text-[var(--sc-text-secondary)]">
          {t('loading')}
        </p>
      )}
      <div className="space-y-4" aria-busy={loading}>
        {tab === 'counts' &&
          counts.map((c) => (
            <section key={c.id} className="sc-surface space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Badge status={badgeVariant(c.status)} label={status(c.status)} />
                  <span className="text-sm font-semibold text-[var(--sc-text-primary)]">
                    {t('round')} {c.round ?? 1}
                  </span>
                </div>
                <details className="text-right text-xs text-[var(--sc-text-secondary)]">
                  <summary className="cursor-pointer font-medium">{t('reference')}</summary>
                  <p className="mt-1 break-all font-mono">{c.id}</p>
                </details>
              </div>
              {(c.snapshotAt || c.countWindowStart || c.createReason || c.reviewReason) && (
                <div className="grid gap-1.5 rounded-lg bg-[var(--sc-bg-secondary)] p-3 text-sm text-[var(--sc-text-secondary)] sm:grid-cols-2">
                  {c.snapshotAt && (
                    <p className="m-0">
                      {t('snapshotAt')}:{' '}
                      <span className="font-medium text-[var(--sc-text-primary)]">
                        {new Date(c.snapshotAt).toLocaleString(locale)}
                      </span>
                    </p>
                  )}
                  {c.countWindowStart && c.countWindowEnd && (
                    <p className="m-0">
                      {t('window')}:{' '}
                      <span className="font-medium text-[var(--sc-text-primary)]">
                        {new Date(c.countWindowStart).toLocaleString(locale)} –{' '}
                        {new Date(c.countWindowEnd).toLocaleString(locale)}
                      </span>
                    </p>
                  )}
                  {c.createReason && <p className="m-0 sm:col-span-2">{c.createReason}</p>}
                  {c.reviewReason && <p className="m-0 sm:col-span-2">{c.reviewReason}</p>}
                </div>
              )}
              <div className="divide-y divide-[var(--sc-border-default)] rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)]">
                {c.lines.map((l) => (
                  <div
                    key={l.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-[var(--sc-text-primary)]">{l.sku}</span>
                      <span className="ml-2 text-xs text-[var(--sc-text-secondary)]">
                        {l.lotCode} · {l.binCode}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 tabular-nums">
                      {manager && (
                        <span className="text-[var(--sc-text-secondary)]">
                          {t('expected')}:{' '}
                          <strong className="text-[var(--sc-text-primary)]">{l.expectedQty}</strong>{' '}
                          · {t('variance')}:{' '}
                          <strong className="text-[var(--sc-text-primary)]">
                            {l.varianceQty ?? '—'}
                            {l.variancePercent === undefined || l.variancePercent === null
                              ? ''
                              : ` (${l.variancePercent}%)`}
                          </strong>
                        </span>
                      )}
                      <span className="text-[var(--sc-text-secondary)]">
                        {t('observed')}:{' '}
                        <strong className="text-[var(--sc-text-primary)]">
                          {l.observedQty ?? '—'}
                        </strong>
                      </span>
                      {l.hasEvidence && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void evidence('counts', l.id)}
                        >
                          {t('viewEvidence')}
                        </Button>
                      )}
                      {canObserve &&
                        l.observedQty === null &&
                        ['PLANNED', 'COUNTING'].includes(c.status) && (
                          <Button
                            size="sm"
                            onClick={() =>
                              setAction({
                                kind: 'observe',
                                id: c.id,
                                lineId: l.id,
                                version: c.version,
                              })
                            }
                          >
                            {t('observe')}
                          </Button>
                        )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 border-t border-[var(--sc-border-default)] pt-3">
                {canPlan && ['PLANNED', 'COUNTING'].includes(c.status) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAction({ kind: 'countAssign', id: c.id, version: c.version })}
                  >
                    {t('countAssign')}
                  </Button>
                )}
                {canPlan && c.status === 'REVIEW' && (
                  <Button
                    size="sm"
                    onClick={() => setAction({ kind: 'countReview', id: c.id, version: c.version })}
                  >
                    {t('countReview')}
                  </Button>
                )}
                {canPlan && c.status !== 'POSTED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAction({ kind: 'resnapshot', id: c.id, version: c.version })}
                  >
                    {t('resnapshot')}
                  </Button>
                )}
                {/* UC-59: the Manager who approved the plan posts it; Staff never post. */}
                {canPlan && c.status === 'APPROVED' && (
                  <Button
                    size="sm"
                    onClick={() => setAction({ kind: 'post', id: c.id, version: c.version })}
                  >
                    {t('post')}
                  </Button>
                )}
              </div>
            </section>
          ))}
        {tab === 'disposals' &&
          disposals.map((d) => (
            <section key={d.id} className="sc-surface space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="m-0 text-sm font-semibold text-[var(--sc-text-primary)]">
                    {d.sku} · {d.lotCode} · {d.binCode}
                  </p>
                  <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">
                    {t('qty')}: {d.qty} · {t('executedQty', { qty: d.executedQty })} ·{' '}
                    {t(
                      d.authorizationMode === 'POLICY'
                        ? 'policyAuthorization'
                        : 'consentAuthorization',
                    )}
                  </p>
                </div>
                <Badge status={badgeVariant(d.status)} label={status(d.status)} />
              </div>
              <div className="space-y-1 rounded-lg bg-[var(--sc-bg-secondary)] p-3 text-sm text-[var(--sc-text-secondary)]">
                <p className="m-0 text-[var(--sc-text-primary)]">{d.reason}</p>
                {d.authorizationMode === 'POLICY' && d.policyExpiresAt && (
                  <p className="m-0 text-xs">
                    {t('policyExpiry', {
                      date: new Date(d.policyExpiresAt).toLocaleString(locale, {
                        timeZone: 'Asia/Ho_Chi_Minh',
                      }),
                    })}
                  </p>
                )}
                {d.reviewReason && (
                  <p className="m-0 text-xs">
                    {t('reason')}: {d.reviewReason}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {manager && d.status === 'REQUESTED' && (
                  <Button
                    size="sm"
                    onClick={() =>
                      setAction({ kind: 'disposalReview', id: d.id, version: d.version })
                    }
                  >
                    {t('disposalReview')}
                  </Button>
                )}
                {staff && d.status === 'APPROVED' && (
                  <Button
                    size="sm"
                    onClick={() => setAction({ kind: 'execute', id: d.id, version: d.version })}
                  >
                    {t('execute')}
                  </Button>
                )}
                {actorScope === 'TENANT' && ['REQUESTED', 'APPROVED'].includes(d.status) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAction({ kind: 'revoke', id: d.id, version: d.version })}
                  >
                    {t('revoke')}
                  </Button>
                )}
                {actorScope === 'PLATFORM' && d.hasEvidence && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void evidence('disposals', d.id)}
                  >
                    {t('viewEvidence')}
                  </Button>
                )}
              </div>
            </section>
          ))}
        {tab === 'putbacks' &&
          putbacks.map((p) => (
            <section
              key={p.id}
              className="sc-surface flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Badge status={badgeVariant(p.status)} label={status(p.status)} />
                <span className="font-medium text-[var(--sc-text-primary)]">
                  {p.sku} · {p.lotCode} → {p.binCode}
                </span>
                <span className="text-[var(--sc-text-secondary)]">
                  {t('qty')}: {p.qty}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {manager && p.status === 'ASSIGNED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setAction({ kind: 'putbackRetarget', id: p.id, version: p.version })
                    }
                  >
                    {t('putbackRetarget')}
                  </Button>
                )}
                {staff && p.status === 'ASSIGNED' && (
                  <Button
                    size="sm"
                    onClick={() =>
                      setAction({ kind: 'putbackConfirm', id: p.id, version: p.version })
                    }
                  >
                    {t('putbackConfirm')}
                  </Button>
                )}
              </div>
            </section>
          ))}
      </div>
      {wh && !loading && !error && counts.length + disposals.length + putbacks.length === 0 && (
        <div className="sc-surface p-8 text-center text-sm text-[var(--sc-text-secondary)]">
          {t('empty')}
        </div>
      )}
      <div className="flex gap-2">
        {cursor && (
          <Button variant="outline" onClick={() => setCursor(undefined)}>
            {t('first')}
          </Button>
        )}
        {next && (
          <Button variant="outline" onClick={() => setCursor(next)}>
            {t('next')}
          </Button>
        )}
      </div>
      {action && (
        <InventoryWorkflowAction
          key={`${action.kind}:${action.id ?? 'new'}`}
          warehouseId={wh}
          action={action}
          onClose={() => setAction(null)}
          onAccepted={() => {
            setAction(null);
            setReload((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}
