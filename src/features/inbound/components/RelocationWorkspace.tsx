import { useEffect, useState } from 'react';

import { ArrowLeftRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert, Badge, Button, Card, CardContent } from '@/components/Common';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { RelocationForm } from './RelocationForm';
import { relocationApi, type RelocationPosition } from '../api/relocationApi';
type User = ReturnType<typeof useAuthStore.getState>['user'];
interface Props {
  warehouse: string;
  disabled: boolean;
  onLock: (locked: boolean) => void;
}
export function RelocationWorkspace({ warehouse, disabled, onLock }: Props) {
  const t = useTranslations('Relocation'),
    user = useAuthStore((s) => s.user),
    [page, setPage] = useState<{
      owner: User;
      warehouse: string;
      items: RelocationPosition[];
      nextCursor: string | null;
    } | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<RelocationPosition | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [refresh, setRefresh] = useState(0),
    [locked, setLocked] = useState(false);
  const visible = page?.owner === user && page.warehouse === warehouse ? page : null;
  useEffect(() => {
    setPage(null);
    setSelected(null);
    setCursor(null);
    setError('');
    setLocked(false);
  }, [warehouse, user]);
  useEffect(() => {
    const c = new AbortController();
    if (!warehouse) return;
    setLoading(true);
    setSelected(null);
    void relocationApi
      .positions(warehouse, cursor, c.signal)
      .then((data) => {
        if (!c.signal.aborted && user === useAuthStore.getState().user) {
          setPage({ owner: user, warehouse, ...data });
          setError('');
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e instanceof ApiError ? e.message : t('loadError'));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [warehouse, user, cursor, refresh, t]);
  useEffect(() => {
    onLock(locked);
    return () => onLock(false);
  }, [locked, onLock]);
  return (
    <section className="space-y-4 border-t border-[var(--sc-border-default)] pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-xl font-semibold">{t('title')}</h2>
          <p className="mb-0 mt-2 text-sm text-[var(--sc-text-secondary)]">{t('description')}</p>
        </div>
        {!selected && (
          <Button
            variant="outline"
            disabled={disabled || locked || loading}
            onClick={() => setRefresh((v) => v + 1)}
          >
            {t('refresh')}
          </Button>
        )}
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {loading ? (
        <p>{t('loading')}</p>
      ) : (
        visible && (
          <>
            {!selected && (
              <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
                {visible.items.map((source) => (
                  <Card key={source.id} className="min-w-0">
                    <CardContent className="space-y-3">
                      <p className="break-words font-semibold">{source.productName}</p>
                      <p className="break-all text-xs text-[var(--sc-text-secondary)]">
                        {source.sku} · {source.lotCode}
                      </p>
                      <Badge
                        status={source.stockState === 'QUARANTINE' ? 'warning' : 'success'}
                        label={t(`state.${source.stockState}`)}
                      />
                      <p className="break-words text-sm">
                        {source.fromBinCode} · {t(`state.${source.stockState}`)}
                      </p>
                      <p className="text-sm">{t('available', { qty: source.availableQty })}</p>
                      <Button
                        variant="outline"
                        disabled={disabled || locked}
                        onClick={() => setSelected(source)}
                      >
                        {t('open')}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {visible.items.length === 0 && (
              <Card variant="bordered" className="flex items-center gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary)]">
                  <ArrowLeftRight size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="m-0 text-sm font-semibold">{t('empty')}</h3>
                  <p className="mb-0 mt-1 text-sm leading-5 text-[var(--sc-text-secondary)]">
                    {t('emptyHint')}
                  </p>
                </div>
                {cursor && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled || locked}
                    onClick={() => setCursor(null)}
                  >
                    {t('firstPage')}
                  </Button>
                )}
              </Card>
            )}
            {!selected && visible.items.length > 0 && (cursor || visible.nextCursor) && (
              <div className="flex justify-end gap-2 border-t border-[var(--sc-border-default)] pt-4">
                {cursor && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled || locked}
                    onClick={() => setCursor(null)}
                  >
                    {t('firstPage')}
                  </Button>
                )}
                {visible.nextCursor && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled || locked}
                    onClick={() => setCursor(visible.nextCursor)}
                  >
                    {t('nextPage')}
                  </Button>
                )}
              </div>
            )}
            {selected && visible.items.some((i) => i.id === selected.id) && (
              <RelocationForm
                key={`${warehouse}:${selected.id}:${user?.userId}`}
                warehouse={warehouse}
                source={selected}
                disabled={disabled}
                onLock={setLocked}
                onClose={() => setSelected(null)}
                onSaved={() => {
                  setCursor(null);
                  setRefresh((v) => v + 1);
                }}
              />
            )}
          </>
        )
      )}
    </section>
  );
}
