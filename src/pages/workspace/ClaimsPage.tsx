import { useEffect, useRef, useState } from 'react';

import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useTranslations } from 'next-intl';

import { Alert, Badge, Button, Card, PageHeader, Select } from '@/components/Common';
import { claimsApi, type Claim } from '@/features/claims/api/claimsApi';
import { ClaimDetail } from '@/features/claims/components/ClaimDetail';
import { CreateClaimForm } from '@/features/claims/components/CreateClaimForm';
import { useClaimSignal } from '@/features/claims/useClaimSignal';
import { useAccess } from '@/hooks/useAccess';
import { getAuthScopeKey } from '@/lib/authScope';
import { useAuthStore } from '@/stores/authStore';

const NO_WAREHOUSES: readonly string[] = [];

export default function ClaimsPage() {
  const scopeKey = useAuthStore((s) => getAuthScopeKey(s.user));
  return <ClaimsWorkspace key={scopeKey} />;
}
function ClaimsWorkspace() {
  const navigate = useNavigate(),
    [searchParams] = useSearchParams();
  const t = useTranslations('Claims'),
    { roles, actorScope, can } = useAccess();
  const assignments = useAuthStore((s) => s.user?.warehouseIds ?? NO_WAREHOUSES);
  const isOps = roles.includes('OPS_DISPATCHER');
  const needsWarehouse =
    isOps && !roles.some((role) => role === 'ORCA_ACCOUNTANT' || role === 'ORCA_ADMIN');
  const selected = searchParams.get('warehouseId')?.toLowerCase();
  const warehouse =
    selected && assignments.includes(selected)
      ? selected
      : needsWarehouse
        ? (assignments[0] ?? '')
        : '';
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]),
    [warehouseError, setWarehouseError] = useState(false);
  useEffect(() => {
    if (!isOps) return;
    const controller = new AbortController();
    claimsApi
      .warehouses(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) {
          setWarehouses(items.filter((w) => assignments.includes(w.id)));
          setWarehouseError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setWarehouseError(true);
      });
    return () => controller.abort();
    // Auth/assignment changes remount the workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOps]);
  return (
    <div className="sc-page space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      {isOps && (
        <div className="max-w-md">
          <Select
            label={t('warehouse')}
            value={warehouse}
            onChange={(e) => {
              navigate(
                e.target.value
                  ? `/claims?warehouseId=${encodeURIComponent(e.target.value)}`
                  : '/claims',
              );
            }}
            placeholder={t(needsWarehouse ? 'chooseWarehouse' : 'allWarehouses')}
            isPlaceholderDisabled={needsWarehouse}
            options={[...warehouses.map((w) => ({ value: w.id, label: w.name }))]}
          />
          {warehouseError && <Alert variant="error">{t('warehouseError')}</Alert>}
        </div>
      )}
      {needsWarehouse && !warehouse ? (
        <Alert variant="info">{t('chooseWarehouse')}</Alert>
      ) : (
        <ClaimsScope
          key={warehouse}
          warehouse={warehouse}
          canCreate={can('claims.create') && (actorScope === 'TENANT' || Boolean(warehouse))}
        />
      )}
    </div>
  );
}
function ClaimsScope({ warehouse, canCreate }: { warehouse: string; canCreate: boolean }) {
  const t = useTranslations('Claims'),
    signal = useClaimSignal();
  if (!signal || signal.aborted) return <p role="status">{t('loading')}</p>;
  return <ClaimsQueue warehouse={warehouse} canCreate={canCreate} signal={signal} />;
}
function ClaimsQueue({
  warehouse,
  canCreate,
  signal,
}: {
  warehouse: string;
  canCreate: boolean;
  signal: AbortSignal;
}) {
  const t = useTranslations('Claims'),
    navigate = useNavigate(),
    { claimId } = useParams();
  const [items, setItems] = useState<Claim[]>([]),
    [status, setStatus] = useState(''),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [tick, setTick] = useState(0),
    [creating, setCreating] = useState(false);
  const scope = warehouse ? { warehouseId: warehouse } : {};
  const pageRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(),
      abort = () => controller.abort();
    pageRequest.current = controller;
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    setLoading(true);
    setItems([]);
    setCursor(null);
    setError(false);
    claimsApi
      .list(scope, controller.signal, undefined, status)
      .then((page) => {
        if (!controller.signal.aborted) {
          setItems(page.items);
          setCursor(page.nextCursor);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      signal.removeEventListener('abort', abort);
    };
    // The warehouse and authentication scope are fixed by the mounted boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouse, status, tick, signal]);
  const changed = () => setTick((n) => n + 1);
  const open = (id: string) => {
    setCreating(false);
    navigate(
      `/claims/${encodeURIComponent(id)}${warehouse ? `?warehouseId=${encodeURIComponent(warehouse)}` : ''}`,
    );
  };
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:w-64">
          <Select
            label={t('status')}
            placeholder={t('allStatuses')}
            isPlaceholderDisabled={false}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              ...['OPEN', 'INVESTIGATING', 'APPROVED', 'REJECTED', 'CREDITED'].map((value) => ({
                value,
                label: t(`statuses.${value}`),
              })),
            ]}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={changed}>
            {t('refresh')}
          </Button>
          {canCreate && (
            <Button
              onClick={() => {
                setCreating((v) => !v);
                if (claimId) {
                  navigate(
                    warehouse ? `/claims?warehouseId=${encodeURIComponent(warehouse)}` : '/claims',
                  );
                }
              }}
            >
              {t(creating ? 'closeCreate' : 'newClaim')}
            </Button>
          )}
        </div>
      </div>
      {creating && canCreate && (
        <CreateClaimForm
          scope={scope}
          signal={signal}
          onCreated={(id) => {
            changed();
            open(id);
          }}
        />
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.6fr)]">
        <Card className="self-start overflow-hidden">
          <div className="border-b border-[var(--sc-border-default)] p-4">
            <h2 className="font-semibold">{t('queue')}</h2>
          </div>
          {loading ? (
            <p className="p-5 text-sm" role="status">
              {t('loading')}
            </p>
          ) : error ? (
            <div className="p-4">
              <Alert variant="error">{t('errors.generic')}</Alert>
            </div>
          ) : items.length === 0 ? (
            <p className="p-5 text-sm text-[var(--sc-text-secondary)]">{t('empty')}</p>
          ) : (
            <ul className="divide-y divide-[var(--sc-border-default)]">
              {items.map((claim) => (
                <li key={claim.id}>
                  <button
                    type="button"
                    className={`w-full space-y-2 p-4 text-left hover:bg-[var(--sc-primary-alpha-08)] ${claim.id === claimId ? 'bg-[var(--sc-primary-alpha-08)]' : ''}`}
                    onClick={() => open(claim.id)}
                    aria-pressed={claim.id === claimId}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {claim.orderReference} · #{claim.sequenceNo}
                      </span>
                      <Badge
                        status={
                          claim.status === 'CREDITED'
                            ? 'success'
                            : claim.status === 'REJECTED'
                              ? 'error'
                              : 'warning'
                        }
                        label={t(`statuses.${claim.status}`)}
                      />
                    </div>
                    <p className="text-sm text-[var(--sc-text-secondary)]">
                      {claim.warehouseName} · {claim.sku ?? claim.productName ?? t('item')}
                    </p>
                    <p className="text-xs text-[var(--sc-text-secondary)]">
                      {claim.responsibility
                        ? t(`liability.${claim.responsibility}`)
                        : t('unclassified')}{' '}
                      · {t('affected', { qty: claim.affectedQty })}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {cursor && !loading && !error && (
            <Button
              variant="ghost"
              className="m-3"
              onClick={() => {
                const current = pageRequest.current;
                if (!current || current.signal.aborted) return;
                void claimsApi
                  .list(scope, current.signal, cursor, status)
                  .then((page) => {
                    if (!current.signal.aborted) {
                      setItems((old) => [
                        ...old,
                        ...page.items.filter((row) => !old.some((item) => item.id === row.id)),
                      ]);
                      setCursor(page.nextCursor);
                    }
                  })
                  .catch(() => {
                    if (!current.signal.aborted) setError(true);
                  });
              }}
            >
              {t('loadMore')}
            </Button>
          )}
        </Card>
        {claimId && !error ? (
          <ClaimDetail
            key={`${warehouse}/${claimId}`}
            id={claimId}
            scope={scope}
            parentSignal={signal}
            onChanged={changed}
            refreshKey={tick}
          />
        ) : (
          <Card className="p-6 text-sm text-[var(--sc-text-secondary)]">{t('selectClaim')}</Card>
        )}
      </div>
    </>
  );
}
