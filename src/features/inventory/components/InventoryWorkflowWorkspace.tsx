import { useEffect, useState } from 'react';

import { useLocale, useTranslations } from 'next-intl';

import { Alert, Button, PageHeader, Select } from '@/components/Common';
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
export function InventoryWorkflowWorkspace() {
  const revision = useAuthStore((s) => s.revision);
  return <Workspace key={revision} />;
}
function Workspace() {
  const t = useTranslations('InventoryWorkflows');
  const locale = useLocale();
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
  const [selected, setSelected] = useState(''),
    [tab, setTab] = useState<'counts' | 'disposals' | 'putbacks'>(
      actorScope === 'TENANT' ? 'disposals' : 'counts',
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
          if (!abort.signal.aborted) {
            setCounts(page.items);
            setNext(page.nextCursor);
          }
        } else if (tab === 'disposals') {
          const page = await inventoryWorkflowApi.disposals(wh, cursor, abort.signal);
          if (!abort.signal.aborted) {
            setDisposals(page.items);
            setNext(page.nextCursor);
          }
        } else {
          const page = await inventoryWorkflowApi.putbacks(wh, cursor, abort.signal);
          if (!abort.signal.aborted) {
            setPutbacks(page.items);
            setNext(page.nextCursor);
          }
        }
      } catch {
        if (!abort.signal.aborted) setError(true);
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    })();
    return () => abort.abort();
  }, [wh, tab, reload, cursor, permitted]);
  async function evidence(kind: 'counts' | 'disposals', id: string) {
    setDownloadError(false);
    try {
      const value = await inventoryWorkflowApi.download(wh, kind, id);
      window.open(value.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch {
      setDownloadError(true);
    }
  }
  const status = (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : t('unknownStatus'));
  if (!permitted) return <Alert variant="error" title={t('forbidden')} />;
  return (
    <div className="space-y-5">
      <PageHeader title={t('title')} description={t('description')} />
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
      <div className="flex flex-wrap gap-2">
        {(actorScope === 'TENANT'
          ? (['disposals'] as const)
          : (['counts', 'putbacks', 'disposals'] as const)
        ).map((id) => (
          <Button
            key={id}
            variant={tab === id ? 'primary' : 'outline'}
            disabled={!!action}
            onClick={() => {
              setTab(id);
              setCursor(undefined);
            }}
          >
            {t(id)}
          </Button>
        ))}
        <Button variant="outline" disabled={loading || !wh} onClick={() => setReload((v) => v + 1)}>
          {t('refresh')}
        </Button>
        {manager && tab === 'putbacks' && wh && (
          <Button onClick={() => setAction({ kind: 'putbackRequest' })}>
            {t('putbackRequest')}
          </Button>
        )}
      </div>
      {(error || downloadError) && <Alert variant="error" title={t('loadError')} />}
      {loading && <p role="status">{t('loading')}</p>}
      <div className="space-y-3" aria-busy={loading}>
        {tab === 'counts' &&
          counts.map((c) => (
            <section key={c.id} className="sc-surface space-y-3 p-4">
              <p>{status(c.status)}</p>
              <details className="text-xs">
                <summary>{t('reference')}</summary>
                <p className="break-all">{c.id}</p>
              </details>
              {c.reviewReason && <p>{c.reviewReason}</p>}
              {c.lines.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center gap-3">
                  <span>
                    {l.sku} · {l.lotCode} · {l.binCode}
                  </span>
                  {manager && (
                    <span>
                      {t('expected')}: {l.expectedQty} · {t('variance')}: {l.varianceQty ?? '—'}
                    </span>
                  )}
                  <span>
                    {t('observed')}: {l.observedQty ?? '—'}
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
                  {staff &&
                    l.observedQty === null &&
                    ['PLANNED', 'COUNTING'].includes(c.status) && (
                      <Button
                        size="sm"
                        onClick={() =>
                          setAction({ kind: 'observe', id: c.id, lineId: l.id, version: c.version })
                        }
                      >
                        {t('observe')}
                      </Button>
                    )}
                </div>
              ))}
              <div className="flex gap-2">
                {manager && c.status === 'REVIEW' && (
                  <Button
                    onClick={() => setAction({ kind: 'countReview', id: c.id, version: c.version })}
                  >
                    {t('countReview')}
                  </Button>
                )}
                {manager && c.status !== 'POSTED' && (
                  <Button
                    variant="outline"
                    onClick={() => setAction({ kind: 'resnapshot', id: c.id, version: c.version })}
                  >
                    {t('resnapshot')}
                  </Button>
                )}
                {staff && c.status === 'APPROVED' && (
                  <Button onClick={() => setAction({ kind: 'post', id: c.id, version: c.version })}>
                    {t('post')}
                  </Button>
                )}
              </div>
            </section>
          ))}
        {tab === 'disposals' &&
          disposals.map((d) => (
            <section key={d.id} className="sc-surface space-y-3 p-4">
              <p>
                {d.sku} · {d.lotCode} · {d.binCode} · {t('qty')}: {d.qty} · {status(d.status)}
              </p>
              <p>{d.reason}</p>
              <p className="text-sm">
                {t('executedQty', { qty: d.executedQty })} ·{' '}
                {t(
                  d.authorizationMode === 'POLICY' ? 'policyAuthorization' : 'consentAuthorization',
                )}
              </p>
              {d.authorizationMode === 'POLICY' && d.policyExpiresAt && (
                <p className="text-sm">
                  {t('policyExpiry', {
                    date: new Date(d.policyExpiresAt).toLocaleString(locale, {
                      timeZone: 'Asia/Ho_Chi_Minh',
                    }),
                  })}
                </p>
              )}
              {d.reviewReason && <p>{d.reviewReason}</p>}
              <div className="flex gap-2">
                {manager && d.status === 'REQUESTED' && (
                  <Button
                    onClick={() =>
                      setAction({ kind: 'disposalReview', id: d.id, version: d.version })
                    }
                  >
                    {t('disposalReview')}
                  </Button>
                )}
                {staff && d.status === 'APPROVED' && (
                  <Button
                    onClick={() => setAction({ kind: 'execute', id: d.id, version: d.version })}
                  >
                    {t('execute')}
                  </Button>
                )}
                {actorScope === 'TENANT' && ['REQUESTED', 'APPROVED'].includes(d.status) && (
                  <Button
                    onClick={() => setAction({ kind: 'revoke', id: d.id, version: d.version })}
                  >
                    {t('revoke')}
                  </Button>
                )}
                {actorScope === 'PLATFORM' && d.hasEvidence && (
                  <Button variant="outline" onClick={() => void evidence('disposals', d.id)}>
                    {t('viewEvidence')}
                  </Button>
                )}
              </div>
            </section>
          ))}
        {tab === 'putbacks' &&
          putbacks.map((p) => (
            <section key={p.id} className="sc-surface flex flex-wrap items-center gap-3 p-4">
              <span>
                {p.sku} · {p.lotCode} → {p.binCode} · {t('qty')}: {p.qty} · {status(p.status)}
              </span>
              {manager && p.status === 'ASSIGNED' && (
                <Button
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
                  onClick={() =>
                    setAction({ kind: 'putbackConfirm', id: p.id, version: p.version })
                  }
                >
                  {t('putbackConfirm')}
                </Button>
              )}
            </section>
          ))}
      </div>
      {wh && !loading && !error && counts.length + disposals.length + putbacks.length === 0 && (
        <p>{t('empty')}</p>
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
