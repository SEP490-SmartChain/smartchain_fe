import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert, Button, Input, Select } from '@/components/Common';
import { ApiError } from '@/services/apiClient';

import { getPendingClaim, retryClaimCommand, sendClaimCommand } from '../api/claimCommands';
import { claimsApi, type ClaimScope, type ClaimSource } from '../api/claimsApi';

const schema = z.object({
  fulfillmentItemId: z.string().uuid(),
  affectedQty: z.number().int().min(1).max(2147483647),
  incidentType: z.enum(['LOST', 'DAMAGED']),
  declaredCostVnd: z.string().regex(/^(0|[1-9]\d{0,19})?$/),
  note: z.string().trim().min(5).max(2000),
});
type Values = z.infer<typeof schema>;
export function CreateClaimForm({
  scope,
  signal,
  onCreated,
}: {
  scope: ClaimScope;
  signal: AbortSignal;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations('Claims');
  const [sources, setSources] = useState<ClaimSource[]>([]),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState(''),
    [searchVersion, setSearchVersion] = useState(0),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [pending, setPending] = useState(() => getPendingClaim('create', 'new', scope));
  const restore = pending?.kind === 'create' ? pending.input : undefined;
  const pageRequest = useRef<AbortController | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      fulfillmentItemId: restore?.fulfillmentItemId ?? '',
      affectedQty: restore?.affectedQty ?? 1,
      incidentType: restore?.incidentType ?? 'DAMAGED',
      declaredCostVnd: restore?.declaredCostVnd ?? '',
      note: restore?.note ?? '',
    },
  });
  const selected = sources.find((s) => s.fulfillmentItemId === form.watch('fulfillmentItemId'));
  const fail = (failure: unknown) => {
    const code =
      failure instanceof ApiError
        ? failure.code.replace(/^(CLAIM|UPLOAD)\./, '')
        : failure instanceof Error
          ? failure.message.replace(/^(CLAIM|UPLOAD)\./, '')
          : '';
    setError(t.has(`errors.${code}`) ? t(`errors.${code}`) : t('errors.generic'));
  };
  useEffect(() => {
    const controller = new AbortController(),
      abort = () => controller.abort();
    pageRequest.current = controller;
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    setLoading(true);
    setError('');
    setSources([]);
    setCursor(null);
    claimsApi
      .sources(scope, controller.signal, filter)
      .then((page) => {
        if (!controller.signal.aborted) {
          setSources(page.items);
          setCursor(page.nextCursor);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) fail(e);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      signal.removeEventListener('abort', abort);
    };
    // scope changes remount this form; search requests independently cancel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, scope.warehouseId, signal, searchVersion]);
  const submit = form.handleSubmit(async (values) => {
    if (!selected || values.affectedQty > selected.remainingQty) {
      setError(t('errors.QUANTITY_EXCEEDED'));
      return;
    }
    if (selected.declaredCostVnd === null && !values.declaredCostVnd) {
      form.setError('declaredCostVnd', { message: t('errors.DECLARED_COST_REQUIRED') });
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await sendClaimCommand(
        {
          kind: 'create',
          id: 'new',
          scope,
          input: {
            fulfillmentItemId: values.fulfillmentItemId,
            affectedQty: values.affectedQty,
            incidentType: values.incidentType,
            note: values.note,
            ...(selected.declaredCostVnd !== null
              ? { declaredCostVnd: selected.declaredCostVnd }
              : values.declaredCostVnd
                ? { declaredCostVnd: values.declaredCostVnd }
                : {}),
          },
        },
        signal,
      );
      if (!signal.aborted) onCreated(result.id);
    } catch (e) {
      if (!signal.aborted) {
        fail(e);
        setPending(getPendingClaim('create', 'new', scope));
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  });
  const retry = async () => {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      const result = await retryClaimCommand(pending, signal, scope);
      if (!signal.aborted) onCreated(result.id);
    } catch (e) {
      if (!signal.aborted) {
        fail(e);
        setPending(getPendingClaim('create', 'new', scope));
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  };
  return (
    <section className="sc-card space-y-5 p-5" aria-label={t('newClaim')}>
      <h2 className="text-lg font-semibold">{t('newClaim')}</h2>
      {error && !pending && <Alert variant="error">{error}</Alert>}
      {pending && (
        <Alert variant="warning">
          <p>{t('pendingRequest')}</p>
          <Button type="button" onClick={() => void retry()} isLoading={busy}>
            {t('retrySame')}
          </Button>
        </Alert>
      )}
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={busy || Boolean(pending)} className="space-y-4">
          <div className="flex items-end gap-3">
            <Input
              label={t('searchParcel')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={100}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setFilter(search);
                setSearchVersion((n) => n + 1);
              }}
            >
              {t('search')}
            </Button>
          </div>
          <Select
            label={t('parcelItem')}
            placeholder={loading ? t('loading') : t('chooseParcel')}
            options={sources.map((s) => ({
              value: s.fulfillmentItemId,
              label: `${s.orderReference} · #${s.sequenceNo} · ${s.sku ?? s.productName ?? t('item')} · ${t('remaining', { qty: s.remainingQty })}`,
              disabled: s.remainingQty === 0,
            }))}
            {...form.register('fulfillmentItemId')}
            error={form.formState.errors.fulfillmentItemId ? t('required') : undefined}
          />
          {cursor && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                const current = pageRequest.current;
                if (!current || current.signal.aborted) return;
                void claimsApi
                  .sources(scope, current.signal, filter, cursor)
                  .then((page) => {
                    if (!current.signal.aborted) {
                      setSources((old) => [
                        ...old,
                        ...page.items.filter(
                          (item) =>
                            !old.some((o) => o.fulfillmentItemId === item.fulfillmentItemId),
                        ),
                      ]);
                      setCursor(page.nextCursor);
                    }
                  })
                  .catch((e) => {
                    if (!current.signal.aborted) fail(e);
                  });
              }}
            >
              {t('loadMore')}
            </Button>
          )}
          {!loading && sources.length === 0 && (
            <p className="text-sm text-[var(--sc-text-secondary)]">{t('noSources')}</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              type="number"
              min={1}
              max={selected?.remainingQty ?? 2147483647}
              label={t('affectedQty')}
              {...form.register('affectedQty', { valueAsNumber: true })}
              error={form.formState.errors.affectedQty ? t('invalidQuantity') : undefined}
            />
            <Select
              label={t('incident')}
              options={[
                { value: 'DAMAGED', label: t('incidents.DAMAGED') },
                { value: 'LOST', label: t('incidents.LOST') },
              ]}
              {...form.register('incidentType')}
            />
          </div>
          {selected?.declaredCostVnd !== null && selected ? (
            <Input
              key="snapshot-cost"
              label={t('declaredCost')}
              value={selected.declaredCostVnd ?? ''}
              readOnly
              helperText={t('source.ORDER_SNAPSHOT')}
            />
          ) : (
            <Input
              key="declared-cost"
              label={t('declaredCost')}
              inputMode="numeric"
              {...form.register('declaredCostVnd')}
              error={form.formState.errors.declaredCostVnd ? t('wholeVnd') : undefined}
              helperText={t('manualCostReview')}
            />
          )}
          <label className="block text-sm font-medium">
            {t('description')}
            <textarea
              rows={4}
              maxLength={2000}
              className="mt-2 w-full rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-3"
              {...form.register('note')}
            />
          </label>
          {form.formState.errors.note && (
            <p role="alert" className="text-sm text-[var(--sc-error)]">
              {t('noteLength')}
            </p>
          )}
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('createHint')}</p>
          <Button
            type="submit"
            isLoading={busy}
            disabled={!selected || selected.remainingQty === 0}
          >
            {t('create')}
          </Button>
        </fieldset>
      </form>
    </section>
  );
}
