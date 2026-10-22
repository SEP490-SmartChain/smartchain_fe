import { useEffect, useId, useState } from 'react';

import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Clock3,
  Filter,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Alert, Badge, Button, Card, Input, Select, Tabs } from '@/components/Common';
import { useAuthStore } from '@/stores/authStore';

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

export function ReportWorkspace({ initialView }: { initialView?: ReportKind }) {
  const revision = useAuthStore((state) => state.revision);
  return (
    <ScopedReports key={`${revision}:${initialView ?? 'overview'}`} initialView={initialView} />
  );
}
function ScopedReports({ initialView }: { initialView?: ReportKind }) {
  const t = useTranslations('Reports');
  const [options, setOptions] = useState<ReportOptions | null>(null),
    [view, setView] = useState<ReportKind | undefined>(initialView),
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
          setView((previous) => previous ?? value.views[0]);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      });
    return () => abort.abort();
  }, [attempt]);
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
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[var(--sc-primary)]">
            <Activity size={14} aria-hidden="true" />
            {t('eyebrow')}
          </p>
          <h1 className="m-0 text-3xl font-semibold text-[var(--sc-text-primary)]">{t('title')}</h1>
          <p className="mb-0 mt-2 max-w-2xl text-sm text-[var(--sc-text-secondary)]">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-4 py-2 text-xs text-[var(--sc-text-secondary)]">
          <ShieldCheck size={16} className="text-[var(--sc-primary)]" aria-hidden="true" />
          {t('scoped')}
        </div>
      </header>
      {!initialView && (
        <Tabs
          label={t('viewLabel')}
          activeId={view}
          tabs={options.views.map((id) => ({ id, label: t(`views.${id}`) }))}
          onChange={(id) => {
            const result = reportKindSchema.safeParse(id);
            if (result.success) setView(result.data);
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
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="m-0 text-base font-semibold">{t(`views.${view}`)}</h2>
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
        {view !== 'health' && (
          <form
            onSubmit={form.handleSubmit((value) => {
              setCursor(undefined);
              setBack([]);
              setFilters(value);
              setRevision((value) => value + 1);
            })}
            className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4"
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
        <p className="mb-0 mt-4 flex items-center gap-2 text-xs text-[var(--sc-text-tertiary)]">
          <Clock3 size={13} aria-hidden="true" />
          {data
            ? t('updated', {
                time: new Date(data.generatedAt).toLocaleString(
                  locale === 'vi' ? 'vi-VN' : 'en-US',
                  { timeZone: 'Asia/Ho_Chi_Minh' },
                ),
              })
            : t('businessTime')}
        </p>
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
      {!loading && !error && data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.sections.flatMap((section) =>
              section.metrics.slice(0, section.id.startsWith('queue:') ? 0 : 8).map((metric) => (
                <Card
                  key={`${section.id}:${metric.key}`}
                  className="flex min-h-36 flex-col justify-between"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="m-0 text-xs font-medium text-[var(--sc-text-secondary)]">
                      {t.has(`metrics.${metric.key}`) ? t(`metrics.${metric.key}`) : t('metric')}
                    </p>
                    <ArrowUpRight
                      size={15}
                      className="text-[var(--sc-primary)]"
                      aria-hidden="true"
                    />
                  </div>
                  <strong className="mt-4 block break-words text-2xl font-semibold tabular-nums text-[var(--sc-text-primary)]">
                    {format(metric.value, metric.unit)}
                  </strong>
                  <p className="mb-0 mt-3 text-xs leading-5 text-[var(--sc-text-tertiary)]">
                    {t.has(`basis.${metric.basis}`)
                      ? t(`basis.${metric.basis}`)
                      : t('recordedBasis')}
                  </p>
                  {metric.href && (
                    <Link
                      to={metric.href}
                      className="mt-2 text-xs font-medium text-[var(--sc-primary)]"
                    >
                      {t('details')} ↗
                    </Link>
                  )}
                </Card>
              )),
            )}
          </div>
          {data.sections.some((section) => section.status !== 'AVAILABLE') && (
            <Alert variant="warning">{t('partial')}</Alert>
          )}
          <div className="grid items-start gap-5 xl:grid-cols-2">
            {data.sections
              .filter(
                (section) =>
                  section.series?.length ||
                  section.groups ||
                  section.evidence ||
                  section.id.startsWith('queue:'),
              )
              .map((section) => (
                <div key={section.id} className="space-y-4">
                  {section.series && section.series.length > 0 && <Trend series={section.series} />}
                  {section.groups && (
                    <Card>
                      <div className="mb-5 flex items-center justify-between">
                        <h3 className="m-0 text-sm font-semibold">
                          {t.has(`sections.${section.id}`)
                            ? t(`sections.${section.id}`)
                            : section.id}
                        </h3>
                        <Badge
                          status={section.status === 'AVAILABLE' ? 'success' : 'warning'}
                          label={t(`status.${section.status}`)}
                        />
                      </div>
                      {!section.groups.length ? (
                        <p className="text-sm text-[var(--sc-text-tertiary)]">{t('empty')}</p>
                      ) : (
                        <div className="space-y-4">
                          {section.groups.map((group) => {
                            const max =
                              section.groups?.reduce(
                                (value, row) =>
                                  BigInt(row.value) > value ? BigInt(row.value) : value,
                                BigInt(1),
                              ) ?? BigInt(1);
                            const width =
                              Number(
                                ((BigInt(group.value) < BigInt(0)
                                  ? BigInt(0)
                                  : BigInt(group.value)) *
                                  BigInt(10000)) /
                                  max,
                              ) / 100;
                            return (
                              <div key={group.key}>
                                <div className="mb-2 flex items-center justify-between gap-4 text-xs">
                                  <span
                                    className="min-w-0 truncate text-[var(--sc-text-secondary)]"
                                    title={group.key}
                                  >
                                    {t.has(`groups.${group.key}`)
                                      ? t(`groups.${group.key}`)
                                      : group.key}
                                  </span>
                                  <strong className="tabular-nums">{format(group.value)}</strong>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--sc-bg-secondary)]">
                                  <div
                                    className="h-full rounded-full bg-[var(--sc-primary)]"
                                    style={{ width: `${Math.min(100, width)}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Card>
                  )}
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
                        { timeZone: 'Asia/Ho_Chi_Minh' },
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
function Trend({ series }: { series: { key: string; value: string }[] }) {
  const t = useTranslations('Reports');
  const id = useId();
  const max = series.reduce(
    (value, row) => (BigInt(row.value) > value ? BigInt(row.value) : value),
    BigInt(1),
  );
  const points = series
    .map(
      (row, index) =>
        `${series.length > 1 ? (index / (series.length - 1)) * 640 : 320},${160 - Number((BigInt(row.value) * BigInt(14000)) / max) / 100}`,
    )
    .join(' ');
  return (
    <Card>
      <div className="mb-5 flex items-center justify-between">
        <h3 className="m-0 text-sm font-semibold">{t('trend')}</h3>
        <span className="text-xs text-[var(--sc-text-tertiary)]">{t('businessTime')}</span>
      </div>
      <svg viewBox="0 0 640 180" role="img" aria-label={t('trend')} className="h-48 w-full">
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--sc-primary)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--sc-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[20, 65, 110, 160].map((y) => (
          <line key={y} x1="0" x2="640" y1={y} y2={y} stroke="var(--sc-border-default)" />
        ))}
        <polygon points={`0,180 ${points} 640,180`} fill={`url(#${id})`} />
        <polyline
          points={points}
          fill="none"
          stroke="var(--sc-primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex justify-between text-xs text-[var(--sc-text-tertiary)]">
        <span>{series[0]?.key}</span>
        <span>{series.at(-1)?.key}</span>
      </div>
    </Card>
  );
}
