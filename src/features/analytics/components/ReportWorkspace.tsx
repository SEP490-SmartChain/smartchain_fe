import { useEffect, useId, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Activity,
  CalendarDays,
  ArrowDownLeft,
  Clock3,
  Boxes,
  Package,
  Truck,
  BarChart3,
  Filter,
  RefreshCw,
  ShieldCheck,
  CircleDollarSign,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Alert, Badge, Button, Card, Input, Select, Tabs } from '@/components/Common';
import { useAuthStore } from '@/stores/authStore';

import { ReportVisuals } from './ReportVisuals';
import styles from './ReportVisuals.module.css';
import { reportApi } from '../api/reportApi';
import {
  reportFilterSchema,
  reportKindSchema,
  type AuditRow,
  type ReportFilters,
  type ReportKind,
  type ReportOptions,
  type ReportView,
  type TechnicalRow,
} from '../schemas/reportSchema';

const VIEW_ICONS = {
  seller: Package,
  warehouse: Boxes,
  inventory: Boxes,
  carriers: Truck,
  finance: CircleDollarSign,
  audit: ShieldCheck,
  logs: BarChart3,
  health: Activity,
};

export function ReportWorkspace({ initialView }: { initialView?: ReportKind }) {
  const revision = useAuthStore((state) => state.revision);
  return (
    <ScopedReports key={`${revision}:${initialView ?? 'overview'}`} initialView={initialView} />
  );
}
function ScopedReports({ initialView }: { initialView?: ReportKind }) {
  const t = useTranslations('Reports');
  const locale = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = reportKindSchema.safeParse(searchParams.get('view'));
  const requestedView = requested.success ? requested.data : undefined;
  const [options, setOptions] = useState<ReportOptions | null>(null),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setError(false);
    void reportApi
      .options(abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) {
          setOptions(value);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      });
    return () => abort.abort();
  }, [attempt, initialView]);
  const view =
    initialView ??
    (requestedView && options?.views.includes(requestedView) ? requestedView : options?.views[0]);
  if (error) {
    return (
      <Alert variant="error">
        {t('loadError')}{' '}
        <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
          {t('retry')}
        </Button>
      </Alert>
    );
  }
  if (!options) {
    return (
      <div role="status" className="h-60 animate-pulse rounded-2xl bg-[var(--sc-bg-secondary)] p-8">
        {t('loading')}
      </div>
    );
  }
  if (!view || !options.views.includes(view)) return <Alert variant="warning">{t('denied')}</Alert>;
  return (
    <div className="sc-page-enter space-y-6">
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.heroKicker}>
            <BarChart3 size={14} aria-hidden="true" />
            {t('eyebrow')}
          </p>
          <h1>{t('views.' + view)}</h1>
          <p>{initialView ? t('subtitle') : t('dashboardSubtitle')}</p>
        </div>
        <div className={styles.heroMeta}>
          <strong>
            <CalendarDays size={16} aria-hidden="true" />
            {new Date().toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', {
              timeZone: 'Asia/Ho_Chi_Minh',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </strong>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck size={12} aria-hidden="true" />
            {t('scoped')}
          </span>
        </div>
      </header>
      {!initialView && options.views.length > 1 && (
        <Tabs
          label={t('viewLabel')}
          variant="pills"
          className={styles.reportTabs}
          activeId={view}
          tabs={options.views.map((id) => {
            const Icon = VIEW_ICONS[id];
            return {
              id,
              label: t('views.' + id),
              icon: <Icon size={15} strokeWidth={1.7} aria-hidden="true" />,
            };
          })}
          onChange={(id) => {
            const result = reportKindSchema.safeParse(id);
            if (result.success && options.views.includes(result.data)) {
              const next = new URLSearchParams(searchParams);
              next.set('view', result.data);
              setSearchParams(next);
            }
          }}
        />
      )}
      <ReportPanel key={view} view={view} options={options} />
    </div>
  );
}
function ReportPanel({ view, options }: { view: ReportKind; options: ReportOptions }) {
  const t = useTranslations('Reports'),
    locale = useLocale();
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const defaults: ReportFilters = {
    from: new Date(Date.parse(today) - 29 * 86400000).toISOString().slice(0, 10),
    to: today,
    warehouseId: options.warehouseRequiredViews.includes(view)
      ? (options.warehouses[0]?.id ?? '')
      : '',
    actorId: '',
    action: '',
    entityId: '',
    kind: '',
  };
  const form = useForm<ReportFilters>({
    resolver: zodResolver(reportFilterSchema),
    defaultValues: defaults,
  });
  const [filters, setFilters] = useState(defaults),
    [revision, setRevision] = useState(0),
    [cursor, setCursor] = useState<string | undefined>(),
    [next, setNext] = useState<string | null>(null),
    [back, setBack] = useState<(string | undefined)[]>([]),
    [data, setData] = useState<ReportView | null>(null),
    [rows, setRows] = useState<(AuditRow | TechnicalRow)[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  const [isFiltersExpanded, setFiltersExpanded] = useState(false);
  const filterId = useId();
  const filterToggle = useRef<HTMLButtonElement>(null);
  const isLog = view === 'audit' || view === 'logs';
  const needsWarehouse = options.warehouseRequiredViews.includes(view);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError(false);
    setData(null);
    setRows([]);
    setNext(null);
    if (needsWarehouse && !filters.warehouseId) {
      setLoading(false);
      return () => abort.abort();
    }
    if (view === 'audit' || view === 'logs') {
      void reportApi
        .logs(view, filters, cursor, abort.signal)
        .then((value) => {
          if (!abort.signal.aborted) {
            setRows(value.items);
            setNext(value.pagination.nextCursor);
          }
        })
        .catch(() => {
          if (!abort.signal.aborted) setError(true);
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    } else {
      void reportApi
        .read(view, filters, abort.signal)
        .then((value) => {
          if (!abort.signal.aborted) setData(value);
        })
        .catch(() => {
          if (!abort.signal.aborted) setError(true);
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }
    return () => abort.abort();
  }, [view, filters, revision, cursor, needsWarehouse]);
  const format = (value: string | null, unit?: string): string => {
    if (value === null) return '—';
    const numeric = /^-?\d+$/.test(value) ? BigInt(value) : Number(value);
    const text = numeric.toLocaleString(
      locale === 'vi' ? 'vi-VN' : 'en-US',
      typeof numeric === 'number' ? { maximumFractionDigits: 2 } : undefined,
    );
    return unit === 'VND' ? `${text} VND` : unit === 'percent' ? `${text}%` : text;
  };
  return (
    <div className="space-y-5">
      <Card className={styles.toolbar}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--sc-primary)]" aria-hidden="true" />
            <h2 className="m-0 text-sm font-semibold">
              {view === 'health' ? t('views.health') : t('filterTitle')}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <span
              className={styles.updatedAt}
              title={
                data
                  ? new Date(data.generatedAt).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US', {
                      timeZone: 'Asia/Ho_Chi_Minh',
                    })
                  : t('businessTime')
              }
            >
              <Clock3 size={12} aria-hidden="true" />
              {data
                ? t('updatedCompact', {
                    time: new Date(data.generatedAt).toLocaleTimeString(
                      locale === 'vi' ? 'vi-VN' : 'en-US',
                      {
                        timeZone: 'Asia/Ho_Chi_Minh',
                        hour: '2-digit',
                        minute: '2-digit',
                      },
                    ),
                  })
                : t('businessTime')}
            </span>
            {view !== 'health' && (
              <Button
                ref={filterToggle}
                className={styles.filterToggle}
                variant="ghost"
                size="sm"
                aria-label={t('filterToggle')}
                aria-expanded={isFiltersExpanded}
                aria-controls={filterId}
                onClick={() => setFiltersExpanded((value) => !value)}
              >
                <Filter size={16} aria-hidden="true" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={loading}
              onClick={() => setRevision((value) => value + 1)}
            >
              <RefreshCw size={14} aria-hidden="true" />
              {t('refresh')}
            </Button>
          </div>
        </div>
        {view !== 'health' && (
          <form
            id={filterId}
            data-expanded={isFiltersExpanded}
            onSubmit={form.handleSubmit((value) => {
              setFiltersExpanded(false);
              filterToggle.current?.focus();
              setCursor(undefined);
              setBack([]);
              setFilters(value);
              setRevision((value) => value + 1);
            })}
            className={styles.filterForm + ' grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4'}
          >
            <Input
              type="date"
              label={t('from')}
              {...form.register('from')}
              error={form.formState.errors.from ? t('invalidRange') : undefined}
            />
            <Input
              type="date"
              label={t('to')}
              {...form.register('to')}
              error={form.formState.errors.to ? t('invalidRange') : undefined}
            />
            {view !== 'audit' && (
              <Select
                label={t('warehouse')}
                placeholder={needsWarehouse ? t('chooseWarehouse') : t('allWarehouses')}
                isPlaceholderDisabled={needsWarehouse}
                {...form.register('warehouseId')}
                options={[
                  ...options.warehouses.map((row) => ({
                    value: row.id,
                    label: `${row.code} · ${row.name}`,
                  })),
                ]}
              />
            )}
            {isLog && (
              <Input
                label={t('actor')}
                {...form.register('actorId')}
                error={form.formState.errors.actorId ? t('invalidId') : undefined}
              />
            )}
            {view === 'audit' && (
              <>
                <Input
                  label={t('action')}
                  {...form.register('action')}
                  error={form.formState.errors.action ? t('invalidFilter') : undefined}
                />
                <Input
                  label={t('entity')}
                  {...form.register('entityId')}
                  error={form.formState.errors.entityId ? t('invalidId') : undefined}
                />
              </>
            )}
            {view === 'logs' && (
              <Select
                label={t('kind')}
                placeholder={t('allKinds')}
                isPlaceholderDisabled={false}
                {...form.register('kind')}
                options={[
                  { value: 'API', label: t('api') },
                  { value: 'SCAN', label: t('scan') },
                ]}
              />
            )}
            <Button type="submit" disabled={loading}>
              <Filter size={15} aria-hidden="true" />
              {t('apply')}
            </Button>
          </form>
        )}
      </Card>
      {needsWarehouse && !filters.warehouseId && (
        <Alert variant="warning">{t('chooseWarehouse')}</Alert>
      )}
      {error && (
        <Alert variant="error">
          {t('loadError')}{' '}
          <Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>
            {t('retry')}
          </Button>
        </Alert>
      )}
      {loading && (
        <div role="status" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((id) => (
            <div
              key={id}
              className="h-36 animate-pulse rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]"
            />
          ))}
          <span className="sr-only">{t('loading')}</span>
        </div>
      )}
      {!loading && !error && data && <ReportVisuals report={data} />}
      {!loading && !error && data && view === 'health' && (
        <>
          <div className="grid items-start gap-5 xl:grid-cols-2">
            {data.sections
              .filter((section) => section.evidence || section.id.startsWith('queue:'))
              .map((section) => (
                <div key={section.id} className="space-y-4">
                  {section.evidence && (
                    <Card>
                      <h3 className="m-0 mb-2 text-sm font-semibold">{t('failureEvidence')}</h3>
                      <p className="mb-4 text-xs leading-5 text-[var(--sc-text-secondary)]">
                        {t('failureNote')}
                      </p>
                      {!section.evidence.length ? (
                        <p className="text-sm text-[var(--sc-text-tertiary)]">{t('empty')}</p>
                      ) : (
                        <div className="divide-y divide-[var(--sc-border-default)]">
                          {section.evidence.map((item) => (
                            <details key={item.id} className="py-3 text-xs">
                              <summary className="cursor-pointer font-medium text-[var(--sc-text-primary)]">
                                {t.has('groups.' + item.state)
                                  ? t('groups.' + item.state)
                                  : item.state}{' '}
                                · {t('attempts')}: {item.attempts}
                              </summary>
                              <dl className="mt-3 grid gap-2 break-all rounded-lg bg-[var(--sc-bg-secondary)] p-3">
                                <div>
                                  <dt>{t('businessReference')}</dt>
                                  <dd className="m-0 font-mono">{item.businessId}</dd>
                                </div>
                                <div>
                                  <dt>{t('evidence')}</dt>
                                  <dd className="m-0 font-mono">
                                    {item.source} / {item.id}
                                  </dd>
                                </div>
                                <div>
                                  <dt>{t('recordedAt')}</dt>
                                  <dd className="m-0">
                                    {new Date(item.at).toLocaleString(
                                      locale === 'vi' ? 'vi-VN' : 'en-US',
                                      { timeZone: 'Asia/Ho_Chi_Minh' },
                                    )}
                                  </dd>
                                </div>
                                {item.nextAttemptAt && (
                                  <div>
                                    <dt>{t('nextAttempt')}</dt>
                                    <dd className="m-0">
                                      {new Date(item.nextAttemptAt).toLocaleString(
                                        locale === 'vi' ? 'vi-VN' : 'en-US',
                                        { timeZone: 'Asia/Ho_Chi_Minh' },
                                      )}
                                    </dd>
                                  </div>
                                )}
                              </dl>
                            </details>
                          ))}
                        </div>
                      )}
                    </Card>
                  )}
                  {section.id.startsWith('queue:') && (
                    <Card>
                      <h3 className="m-0 mb-4 break-all font-mono text-sm">
                        {section.id.slice(6)}
                      </h3>
                      <div className="grid grid-cols-4 gap-2">
                        {section.metrics.map((metric) => (
                          <div key={metric.key}>
                            <p className="mb-2 text-xs text-[var(--sc-text-tertiary)]">
                              {t(`metrics.${metric.key}`)}
                            </p>
                            <strong className="text-xl tabular-nums">{format(metric.value)}</strong>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                </div>
              ))}
          </div>
        </>
      )}
      {!loading && !error && isLog && (
        <Card>
          <div className="mb-4 flex items-start justify-between gap-4">
            <h3 className="m-0 font-semibold">
              {t(view === 'audit' ? 'auditTitle' : 'attemptTitle')}
            </h3>
            <Badge status="default" label={t('readOnly')} />
          </div>
          <p className="mb-5 text-xs leading-5 text-[var(--sc-text-secondary)]">
            {t(view === 'audit' ? 'auditNote' : 'technicalNote')}
          </p>
          {!rows.length ? (
            <div className="py-12 text-center text-sm text-[var(--sc-text-tertiary)]">
              {t('empty')}
            </div>
          ) : (
            <div className="divide-y divide-[var(--sc-border-default)]">
              {rows.map((row) => (
                <div key={row.id} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-sm font-medium">
                      <Activity size={15} className="text-[var(--sc-primary)]" aria-hidden="true" />
                      {'action' in row ? row.action : `${row.method} ${row.route}`}
                    </span>
                    <span className="text-xs text-[var(--sc-text-tertiary)]">
                      {new Date('at' in row ? row.at : row.createdAt).toLocaleString(
                        locale === 'vi' ? 'vi-VN' : 'en-US',
                        {
                          timeZone: 'Asia/Ho_Chi_Minh',
                        },
                      )}
                    </span>
                  </div>
                  <details className="mt-2 text-xs text-[var(--sc-text-secondary)]">
                    <summary className="cursor-pointer py-1 text-[var(--sc-primary)]">
                      {t('evidence')}
                    </summary>
                    <dl className="mt-3 grid gap-2 break-all rounded-lg bg-[var(--sc-bg-secondary)] p-4">
                      <div>
                        <dt className="font-medium">{t('actor')}</dt>
                        <dd className="m-0 font-mono">{row.actorId ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="font-medium">{t('correlation')}</dt>
                        <dd className="m-0 font-mono">{row.correlationId ?? '—'}</dd>
                      </div>
                      {'changes' in row ? (
                        <>
                          <div>
                            {row.entityType}: {row.entityId}
                          </div>
                          {row.changes.map((change) => (
                            <div key={change.field} className="flex flex-wrap gap-2">
                              <strong>{change.field}</strong>
                              <span className="inline-flex items-center gap-1">
                                <ArrowDownLeft size={12} aria-hidden="true" />
                                {change.before ?? '—'}
                              </span>
                              <span>→ {change.after ?? '—'}</span>
                            </div>
                          ))}
                        </>
                      ) : (
                        <div>
                          {row.statusCode} · {row.durationMs} ms · {t(`outcomes.${row.outcome}`)}
                        </div>
                      )}
                    </dl>
                  </details>
                </div>
              ))}
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={loading || !back.length}
              onClick={() => {
                setCursor(back.at(-1));
                setBack((value) => value.slice(0, -1));
              }}
            >
              {t('previous')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loading || !next}
              onClick={() => {
                setBack((value) => [...value, cursor]);
                setCursor(next ?? undefined);
              }}
            >
              {t('next')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
