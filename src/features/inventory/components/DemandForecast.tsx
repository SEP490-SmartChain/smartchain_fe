import { useEffect, useMemo, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';

import { Alert, Badge, Button, Card, PageHeader, Select } from '@/components/Common';
import { useProducts } from '@/features/catalog';
import { notifyInvalidForm } from '@/lib/errorNotifications';
import { cn } from '@/lib/utils';
import { ApiError } from '@/services/apiClient';

import { DemandForecastResult } from './DemandForecastResult';
import {
  demandForecastApi,
  forecastFormSchema,
  isForecastPending,
  type ForecastForm,
  type ForecastRun,
} from '../api/demandForecastApi';
import {
  FORECAST_DAILY_LIMIT,
  forecastsLeftToday,
  vietnamToday,
} from '../lib/demandForecastSummary';

const productFilters = { search: '', isActive: 'true' } as const;
const mutationErrors: Readonly<Record<string, string>> = {
  'INVENTORY.FORECAST_DAILY_LIMIT': 'quota',
  'INVENTORY.FORECAST_RETRY_LIMIT': 'retryLimit',
  'INVENTORY.FORECAST_NOT_RETRYABLE': 'notRetryable',
  'INVENTORY.FORECAST_NOT_FOUND': 'notFound',
};
const RUN_BADGE: Record<
  ForecastRun['status'],
  'success' | 'warning' | 'error' | 'info' | 'default'
> = {
  QUEUED: 'info',
  RUNNING: 'info',
  PREDICTED: 'success',
  DISABLED: 'default',
  PROVIDER_UNAVAILABLE: 'warning',
  INSUFFICIENT_DATA: 'default',
  FAILED: 'error',
};
const mutationError = (failure: unknown) =>
  (failure instanceof ApiError && failure.code && mutationErrors[failure.code]) || 'createError';

export function DemandForecast() {
  const t = useTranslations('DemandForecast');
  const locale = useLocale();
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    [locale],
  );
  const catalog = useProducts(productFilters);
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('run');
  const [job, setJob] = useState<ForecastRun | null>(null);
  const [runs, setRuns] = useState<ForecastRun[]>([]);
  const [error, setError] = useState('');
  const [listError, setListError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const request = useRef<AbortController | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForecastForm>({
    resolver: zodResolver(forecastFormSchema),
    defaultValues: { productId: '', region: 'NORTH' },
  });
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    void demandForecastApi
      .list(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) {
          setRuns(items);
          setListError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setListError(true);
      });
    return () => controller.abort();
  }, [selectedId, retry]);
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const poll = async () => {
      try {
        const run = await demandForecastApi.get(selectedId, controller.signal);
        if (controller.signal.aborted) return;
        setJob(run);
        setError('');
        failures = 0;
        setRuns((previous) =>
          [run, ...previous.filter((row) => row.jobId !== run.jobId)].slice(0, 100),
        );
        if (isForecastPending(run)) timer = setTimeout(() => void poll(), 2000);
      } catch (failure) {
        if (controller.signal.aborted) return;
        setError(failure instanceof ApiError && failure.status === 404 ? 'notFound' : 'loadError');
        if (
          !(failure instanceof ApiError && [400, 401, 403, 404].includes(failure.status)) &&
          ++failures < 4
        ) {
          timer = setTimeout(() => void poll(), 2000 * failures);
        }
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [selectedId, retry]);
  async function submit(send: (signal: AbortSignal) => Promise<ForecastRun>) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const run = await send(controller.signal);
      if (controller.signal.aborted) return;
      setJob(run);
      setParams({ run: run.jobId });
      setRetry((value) => value + 1);
    } catch (failure) {
      if (!controller.signal.aborted) setError(mutationError(failure));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const runForecast = (input: ForecastForm) =>
    submit((signal) => demandForecastApi.create(input, signal));
  const retryForecast = (id: string) => submit((signal) => demandForecastApi.retry(id, signal));
  const visible = job?.jobId === selectedId ? job : null;
  const today = vietnamToday();
  const left = forecastsLeftToday(runs, today);
  const productName = (id: string) => {
    const product = catalog.products.find((item) => item.id === id);
    return product ? `${product.sku} · ${product.name}` : t('unknownProduct');
  };
  const openRun = (jobId: string) => {
    setParams({ run: jobId });
    setRetry((value) => value + 1);
  };

  return (
    <main className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <Card>
        <form
          onSubmit={handleSubmit(runForecast, () => notifyInvalidForm())}
          className="space-y-4"
          noValidate
        >
          <h2 className="text-base leading-6 font-semibold">{t('formTitle')}</h2>
          <div className="grid items-start gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
            <Select
              label={t('sku')}
              placeholder={t('choose')}
              options={catalog.products.map((p) => ({
                value: p.id,
                label: `${p.sku} · ${p.name}`,
              }))}
              {...register('productId')}
              disabled={busy}
              error={errors.productId ? t('chooseRequired') : undefined}
            />
            <Select
              label={t('region')}
              options={(['NORTH', 'CENTRAL', 'SOUTH'] as const).map((value) => ({
                value,
                label: t(value),
              }))}
              {...register('region')}
              error={errors?.region?.message}
              disabled={busy}
            />
            <Button
              type="submit"
              className="md:mt-[26px]"
              isLoading={busy}
              disabled={catalog.isLoading || !catalog.products.length}
            >
              {t('run')}
            </Button>
          </div>
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('regionHint')}</p>
          <p className="text-sm text-[var(--sc-text-secondary)] tabular-nums">
            {t('quotaLeft', { left, limit: FORECAST_DAILY_LIMIT })}
          </p>
          {catalog.isLoading && <p role="status">{t('loading')}</p>}
          {!catalog.isLoading && !catalog.error && !catalog.products.length && (
            <p>{t('noProducts')}</p>
          )}
          {(catalog.error || catalog.hasNextPage) && (
            <div className="flex flex-wrap gap-2">
              {catalog.error && (
                <Button type="button" variant="outline" onClick={() => void catalog.refetch()}>
                  {t('retryProducts')}
                </Button>
              )}
              {catalog.hasNextPage && (
                <Button
                  type="button"
                  variant="ghost"
                  isLoading={catalog.isLoadingMore}
                  onClick={() => void catalog.loadMore()}
                >
                  {t('moreProducts')}
                </Button>
              )}
            </div>
          )}
        </form>
      </Card>

      {error && (
        <Alert variant={error === 'notFound' ? 'info' : 'error'}>
          <p>{t(error)}</p>
          {error === 'loadError' && (
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() => setRetry((value) => value + 1)}
            >
              {t('retry')}
            </Button>
          )}
        </Alert>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {visible ? (
            <DemandForecastResult
              key={visible.jobId}
              run={visible}
              productLabel={productName(visible.productId)}
              isBusy={busy}
              onRetry={(jobId) => void retryForecast(jobId)}
            />
          ) : selectedId && !error ? (
            <Card aria-busy="true">
              <p role="status">{t('loading')}</p>
            </Card>
          ) : (
            <Card className="space-y-3">
              <h2 className="text-base leading-6 font-semibold">{t('emptyTitle')}</h2>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--sc-text-secondary)]">
                <li>{t('emptyStep1')}</li>
                <li>{t('emptyStep2')}</li>
                <li>{t('emptyStep3')}</li>
              </ol>
            </Card>
          )}
        </div>

        <Card padding="none" className="overflow-hidden">
          <h2 className="border-b border-[var(--sc-border-default)] px-5 py-4 text-base leading-6 font-semibold">
            {t('recent')}
          </h2>
          {listError && <Alert variant="error">{t('loadError')}</Alert>}
          {!listError && !runs.length && (
            <p className="px-5 py-4 text-sm text-[var(--sc-text-secondary)]">{t('noRuns')}</p>
          )}
          <ul className="max-h-[560px] divide-y divide-[var(--sc-border-default)] overflow-auto">
            {runs.map((run) => {
              const isSelected = run.jobId === selectedId;
              return (
                <li key={run.jobId}>
                  <button
                    type="button"
                    disabled={busy}
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => openRun(run.jobId)}
                    className={cn(
                      'w-full space-y-1.5 px-5 py-3 text-left transition-colors duration-[140ms] hover:bg-[var(--sc-bg-secondary)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--sc-primary)] disabled:cursor-not-allowed',
                      isSelected && 'bg-[var(--sc-accent-light)] hover:bg-[var(--sc-accent-light)]',
                    )}
                  >
                    <span className="line-clamp-2 block text-sm font-medium">
                      {productName(run.productId)}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--sc-text-secondary)]">
                      <span>{t(run.region)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {dateFormat.format(new Date(`${run.forecastStartDate}T00:00:00Z`))}
                      </span>
                      <Badge
                        status={RUN_BADGE[run.status]}
                        variant="dot"
                        size="sm"
                        label={t(
                          run.result?.fallback && !run.result.history?.length
                            ? 'badge_INSUFFICIENT_DATA'
                            : `badge_${run.status}`,
                        )}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </main>
  );
}
