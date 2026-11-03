import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeftRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert, Button, Card, CardContent, Input, Select } from '@/components/Common';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import {
  relocationApi,
  relocationInputSchema,
  type RelocationInput,
  type RelocationPosition,
} from '../api/relocationApi';
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
        <Button
          variant="outline"
          disabled={disabled || locked || loading}
          onClick={() => setRefresh((v) => v + 1)}
        >
          {t('refresh')}
        </Button>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {loading ? (
        <p>{t('loading')}</p>
      ) : (
        visible && (
          <>
            <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
              {visible.items.map((source) => (
                <Card key={source.id} className="min-w-0">
                  <CardContent className="space-y-3">
                    <p className="break-words font-semibold">
                      {source.sku} — {source.lotCode}
                    </p>
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
            {visible.items.length > 0 && (cursor || visible.nextCursor) && (
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
function RelocationForm({
  warehouse,
  source,
  disabled,
  onLock,
  onSaved,
}: Props & { source: RelocationPosition; onSaved: () => void }) {
  const t = useTranslations('Relocation'),
    user = useAuthStore((s) => s.user),
    [bins, setBins] = useState<{ id: string; code: string }[]>([]),
    [moreBins, setMoreBins] = useState(false),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState<RelocationInput | null>(null),
    generation = useRef(0),
    active = useRef<AbortController | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RelocationInput>({
    resolver: zodResolver(
      relocationInputSchema
        .refine((v) => v.qty <= source.availableQty, { path: ['qty'] })
        .refine((v) => v.toBinId !== source.fromBinId, { path: ['toBinId'] }),
    ),
    defaultValues: {
      operationKey: createUuid(),
      expectedVersion: source.version,
      toBinId: '',
      fromBinScan: '',
      toBinScan: '',
      skuScan: '',
      lotScan: '',
      qty: 0,
      reason: '',
    },
  });
  useEffect(() => {
    const c = new AbortController(),
      g = ++generation.current;
    active.current = c;
    setAttempt(null);
    setBusy(false);
    setError('');
    return () => {
      generation.current = g + 1;
      c.abort();
    };
  }, [warehouse, source.id, user]);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    void relocationApi
      .bins(warehouse, source.id, search, c.signal)
      .then((data) => {
        if (!c.signal.aborted && user === useAuthStore.getState().user) {
          setBins(data.bins);
          setMoreBins(data.moreBins);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e instanceof ApiError ? e.message : t('loadError'));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [warehouse, source.id, search, user, t]);
  useEffect(() => {
    onLock(busy || attempt !== null);
    return () => onLock(false);
  }, [busy, attempt, onLock]);
  async function send(input: RelocationInput) {
    if (disabled || busy || user !== useAuthStore.getState().user) return;
    const g = generation.current;
    setBusy(true);
    setError('');
    try {
      const result = await relocationApi.post(warehouse, source, input, active.current?.signal);
      if (g !== generation.current || user !== useAuthStore.getState().user) return;
      setAttempt(null);
      toast.success(t('success', { qty: result.qty }));
      onSaved();
    } catch (e: unknown) {
      if (g !== generation.current || user !== useAuthStore.getState().user) return;
      setError(e instanceof ApiError ? e.message : t('saveError'));
      if (e instanceof ApiError && [400, 403, 404, 409, 422].includes(e.status)) {
        setAttempt(null);
        toast.error(e.message);
        onSaved();
      } else setAttempt(input);
    } finally {
      if (g === generation.current) setBusy(false);
    }
  }
  return (
    <Card>
      <CardContent className="space-y-4">
        <h3 className="break-words text-lg font-semibold">
          {t('formTitle', { sku: source.sku, lot: source.lotCode })}
        </h3>
        <p className="text-sm">
          {t('source', {
            bin: source.fromBinCode,
            qty: source.availableQty,
            state: t(`state.${source.stockState}`),
          })}
        </p>
        {error && <Alert variant="error">{error}</Alert>}
        {attempt ? (
          <>
            <Alert variant="warning">{t('unknown')}</Alert>
            <Button disabled={busy || disabled} onClick={() => void send(attempt)}>
              {t('retry')}
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <Input
                  label={t('search')}
                  value={query}
                  maxLength={64}
                  disabled={busy || disabled}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                disabled={busy || disabled || loading}
                onClick={() => setSearch(query)}
              >
                {t('searchButton')}
              </Button>
            </div>
            {moreBins && <p className="text-sm">{t('moreBins')}</p>}
            <form className="space-y-4" onSubmit={handleSubmit((input) => void send(input))}>
              <fieldset
                className="grid min-w-0 gap-4 sm:grid-cols-2"
                disabled={busy || disabled || loading}
              >
                <Select
                  label={t('destination')}
                  required
                  options={bins.map((b) => ({ value: b.id, label: b.code }))}
                  {...register('toBinId')}
                  error={errors.toBinId ? t('required') : undefined}
                />
                <Input
                  label={t('fromScan')}
                  required
                  {...register('fromBinScan')}
                  error={errors.fromBinScan ? t('required') : undefined}
                />
                <Input
                  label={t('toScan')}
                  required
                  {...register('toBinScan')}
                  error={errors.toBinScan ? t('required') : undefined}
                />
                <Input
                  label={t('skuScan')}
                  required
                  {...register('skuScan')}
                  error={errors.skuScan ? t('required') : undefined}
                />
                <Input
                  label={t('lotScan')}
                  required
                  {...register('lotScan')}
                  error={errors.lotScan ? t('required') : undefined}
                />
                <Input
                  label={t('quantity')}
                  type="number"
                  required
                  min={1}
                  max={source.availableQty}
                  {...register('qty', { valueAsNumber: true })}
                  error={errors.qty ? t('quantityError') : undefined}
                />
                <Input
                  label={t('reason')}
                  required
                  minLength={3}
                  maxLength={500}
                  {...register('reason')}
                  error={errors.reason ? t('reasonError') : undefined}
                />
              </fieldset>
              <Button type="submit" disabled={busy || disabled || loading || bins.length === 0}>
                {t('confirm')}
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
