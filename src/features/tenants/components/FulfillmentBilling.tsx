import { useEffect, useRef, useState } from 'react';

import { Controller, useForm } from 'react-hook-form';
import { useLocation } from 'react-router-dom';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowUpRight, CalendarDays, FileText, Filter, RefreshCw, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';
import { MonthPicker } from '@/components/Common/DatePicker/MonthPicker';
import { SearchableSelect } from '@/components/Common/Select/SearchableSelect';
import { Select } from '@/components/Common/Select/Select';
import { useRealtimeSync } from '@/features/realtime-notifications';
import { useAccess } from '@/hooks/useAccess';
import { notifyInvalidForm } from '@/lib/errorNotifications';
import { notificationTarget } from '@/lib/notificationTarget';
import { useAuthStore } from '@/stores/authStore';
import { useLocaleStore } from '@/stores/localeStore';

import { InvoiceDetail } from './InvoiceDetail';
import { commercialApi } from '../api/commercialApi';
import { invoiceApi, type FeeInvoice } from '../api/invoiceApi';
import { closeInvoicePeriodSchema, invoiceFiltersSchema } from '../schemas/invoiceSchema';

import type { z } from 'zod';

type Filters = z.infer<typeof invoiceFiltersSchema>;

function InvoiceList({
  tenantId,
  filters,
  initialId,
  compact,
  headerActions,
  filterBar,
}: {
  tenantId?: string;
  filters: Filters;
  initialId: string | null;
  compact: boolean;
  headerActions?: React.ReactNode;
  filterBar?: React.ReactNode;
}) {
  const t = useTranslations('Invoices');
  const dateText = useTranslations('DateValidation');
  const locale = useLocaleStore((s) => s.locale);
  const { can } = useAccess();
  const [items, setItems] = useState<FeeInvoice[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<string | null>(initialId),
    [revision, setRevision] = useState(0),
    [notice, setNotice] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const closeForm = useForm<z.infer<typeof closeInvoicePeriodSchema>>({
    resolver: zodResolver(closeInvoicePeriodSchema),
    defaultValues: { month: '' },
  });

  useEffect(() => {
    const abort = new AbortController();
    request.current = abort;
    setLoading(true);
    setError(null);
    void invoiceApi
      .list({ ...filters, tenantId, limit: 20 }, abort.signal)
      .then((page) => {
        if (!abort.signal.aborted) {
          setItems(page.items);
          setCursor(page.pagination.nextCursor);
        }
      })
      .catch((failure) => {
        if (!abort.signal.aborted) {
          setError(failure instanceof Error ? failure.message : t('loadError'));
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => {
      abort.abort();
    };
  }, [tenantId, filters, revision, t]);
  useRealtimeSync(['commercial.billing', 'commercial.onboarding'], () => {
    setRevision((value) => value + 1);
  });

  const money = (value: string) =>
    `${BigInt(value).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')} VND`;
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB').format(
      new Date(`${value}T12:00:00Z`),
    );
  const formatPeriod = (periodKey: string) =>
    periodKey.startsWith('INITIAL') ? t('kinds.ONBOARDING') : periodKey;

  const more = async () => {
    const current = request.current;
    if (!cursor || loading || !current) return;
    setLoading(true);
    try {
      const page = await invoiceApi.list(
        { ...filters, tenantId, cursor, limit: 20 },
        current.signal,
      );
      if (!current.signal.aborted) {
        setItems((old) => [...old, ...page.items]);
        setCursor(page.pagination.nextCursor);
      }
    } catch (failure) {
      if (!current.signal.aborted) {
        setError(failure instanceof Error ? failure.message : t('loadError'));
      }
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  };

  const close = closeForm.handleSubmit(
    async (input) => {
      const current = request.current;
      if (!tenantId || !current) return;
      setError(null);
      setNotice(null);
      try {
        const result = await invoiceApi.close(tenantId, input.month, current.signal);
        if (!current.signal.aborted) {
          setNotice(t('closed', { count: result.invoiceIds.length }));
          setRevision((value) => value + 1);
        }
      } catch (failure) {
        if (!current.signal.aborted) {
          setError(failure instanceof Error ? failure.message : t('loadError'));
        }
      }
    },
    () => notifyInvalidForm(),
  );

  const totalAmount = items.reduce((sum, item) => sum + BigInt(item.totalVnd), BigInt(0));
  const outstandingAmount = items.reduce(
    (sum, item) => sum + BigInt(item.outstandingVnd),
    BigInt(0),
  );

  return (
    <div className="space-y-3.5">
      {/* Unified Card 1: Header & 3-Column Summary Metrics */}
      {!compact && (
        <Card
          padding="none"
          className="border border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--sc-border-default)] px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary)]">
                <FileText size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h1 className="m-0 text-base font-semibold text-[var(--sc-text-primary)] sm:text-lg">
                  {t('title')}
                </h1>
                <p className="mb-0 mt-0.5 text-xs text-[var(--sc-text-secondary)]">
                  {t('description')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {headerActions}
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => {
                  setRevision((value) => value + 1);
                }}
              >
                <RefreshCw size={14} aria-hidden />
                {t('refresh')}
              </Button>
            </div>
          </div>

          <div
            className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0"
            aria-busy={loading}
          >
            <div className="px-5 py-4 sm:px-6">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--sc-text-secondary)]">
                <FileText size={14} className="text-[var(--sc-primary)]" aria-hidden />
                <span>{t('documents')}</span>
              </div>
              <p className="mb-0 mt-1.5 text-xl font-bold tabular-nums text-[var(--sc-text-primary)]">
                {loading && !items.length ? '—' : String(items.length)}
              </p>
              <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">{t('loadedOnly')}</p>
            </div>

            <div className="px-5 py-4 sm:px-6">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--sc-text-secondary)]">
                <CalendarDays size={14} className="text-[var(--sc-primary)]" aria-hidden />
                <span>{t('documentTotal')}</span>
              </div>
              <p className="mb-0 mt-1.5 text-xl font-bold tabular-nums text-[var(--sc-text-primary)]">
                {loading && !items.length ? '—' : money(totalAmount.toString())}
              </p>
              <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">{t('loadedOnly')}</p>
            </div>

            <div className="px-5 py-4 sm:px-6">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--sc-text-secondary)]">
                <Wallet
                  size={14}
                  className={
                    outstandingAmount > BigInt(0)
                      ? 'text-[var(--sc-warning)]'
                      : 'text-[var(--sc-primary)]'
                  }
                  aria-hidden
                />
                <span>{t('outstanding')}</span>
              </div>
              <p
                className={`mb-0 mt-1.5 text-xl font-bold tabular-nums ${
                  outstandingAmount > BigInt(0)
                    ? 'text-[var(--sc-warning-dark)]'
                    : 'text-[var(--sc-primary)]'
                }`}
              >
                {loading && !items.length ? '—' : money(outstandingAmount.toString())}
              </p>
              <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">{t('loadedOnly')}</p>
            </div>
          </div>

          {tenantId && can('invoice.period.close') && (
            <form
              onSubmit={close}
              className="grid items-end gap-3 border-t border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/30 px-5 py-3.5 sm:grid-cols-[minmax(0,260px)_auto_1fr] sm:px-6"
            >
              <Controller
                control={closeForm.control}
                name="month"
                render={({ field, fieldState }) => (
                  <MonthPicker
                    label={t('closeMonth')}
                    placeholder={t('chooseMonth')}
                    value={field.value}
                    onChange={field.onChange}
                    error={fieldState.error ? dateText('closedMonth') : undefined}
                  />
                )}
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                isLoading={closeForm.formState.isSubmitting}
              >
                {t('closePeriod')}
              </Button>
              <p className="m-0 text-xs leading-5 text-[var(--sc-text-secondary)]">
                {t('closeHelp')}
              </p>
            </form>
          )}
        </Card>
      )}

      {notice && <Alert variant="success">{notice}</Alert>}
      {error && (
        <Alert variant="error">
          {error}
          <Button
            variant="ghost"
            onClick={() => {
              setRevision((value) => value + 1);
            }}
          >
            {t('retry')}
          </Button>
        </Alert>
      )}

      {/* Unified Card 2: Filter Toolbar & Invoice Table */}
      <Card
        padding="none"
        className="border border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sc-border-default)] px-5 py-3.5 sm:px-6">
          <div>
            <h2 className="m-0 text-base font-semibold text-[var(--sc-text-primary)]">
              {t('listTitle')}
            </h2>
            {!compact && (
              <p className="mb-0 mt-0.5 text-xs text-[var(--sc-text-secondary)]">{t('listHelp')}</p>
            )}
          </div>
          {compact && (
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => {
                setRevision((value) => value + 1);
              }}
            >
              <RefreshCw size={14} aria-hidden />
              {t('refresh')}
            </Button>
          )}
        </div>

        {filterBar && (
          <div className="border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/30 px-5 py-3.5 sm:px-6">
            {filterBar}
          </div>
        )}

        {loading && (
          <p role="status" className="m-0 px-5 py-6 text-sm text-[var(--sc-text-secondary)]">
            {t('loading')}
          </p>
        )}
        {!loading && !error && !items.length && (
          <div className={compact ? 'px-4 py-6 text-center' : 'px-6 py-12 text-center'}>
            <FileText className="mx-auto mb-3 text-[var(--sc-text-secondary)]" size={28} />
            <h3 className="m-0 text-sm font-semibold">{t('empty')}</h3>
            <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">{t('emptyHelp')}</p>
          </div>
        )}
        {items.length > 0 && (
          <>
            <div
              className={`divide-y divide-[var(--sc-border-default)] ${compact ? '' : 'md:hidden'}`}
            >
              {items.map((item) => (
                <article
                  key={item.id}
                  className={compact ? 'space-y-2 px-4 py-3' : 'space-y-3 p-5'}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="m-0 text-xs font-semibold text-[var(--sc-primary)]">
                      {t(`kinds.${item.documentType}`)}
                    </p>
                    <Badge
                      status={
                        item.documentStatus === 'DRAFT'
                          ? 'default'
                          : item.paymentStatus === 'PAID'
                            ? 'success'
                            : item.paymentStatus === 'EXPIRED'
                              ? 'error'
                              : item.paymentStatus === 'LEDGER'
                                ? 'info'
                                : 'warning'
                      }
                      label={t(
                        `states.${item.documentStatus === 'DRAFT' ? 'DRAFT' : item.paymentStatus}`,
                      )}
                    />
                  </div>
                  <p className="m-0 text-sm font-medium" title={item.invoiceNo}>
                    {item.invoiceNo.endsWith(item.id)
                      ? `${item.invoiceNo.slice(0, -item.id.length)}${item.id.slice(0, 8).toUpperCase()}`
                      : item.invoiceNo}
                  </p>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-[var(--sc-text-secondary)]">{t('period')}</dt>
                      <dd className="mt-0.5">{formatPeriod(item.periodKey)}</dd>
                    </div>
                    <div className="text-right">
                      <dt className="text-xs text-[var(--sc-text-secondary)]">{t('total')}</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums">{money(item.totalVnd)}</dd>
                    </div>
                  </dl>
                  <p className="m-0 text-xs text-[var(--sc-text-secondary)]">
                    {item.documentType === 'SERVICE'
                      ? t('ledgerDocument')
                      : t('due', { date: date(item.dueOn) })}
                  </p>
                  <Button
                    className={compact ? undefined : 'w-full'}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelected(item.id);
                    }}
                  >
                    {t('details')}
                    <ArrowUpRight size={15} aria-hidden />
                  </Button>
                </article>
              ))}
            </div>
            {!compact && (
              <div className="hidden overflow-x-auto md:block">
                <table
                  className="w-full min-w-[720px] text-left text-sm"
                  aria-label={t('listTitle')}
                >
                  <thead className="border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/60 text-xs font-semibold uppercase tracking-wider text-[var(--sc-text-secondary)]">
                    <tr>
                      {['invoice', 'kind', 'period', 'total', 'status', 'actions'].map((key) => (
                        <th key={key} className="px-5 py-3">
                          {t(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--sc-border-default)]">
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        className="transition-colors hover:bg-[var(--sc-bg-secondary)]/30 motion-reduce:transition-none"
                      >
                        <td className="px-5 py-3.5 font-medium">
                          <span
                            className="inline-flex items-center gap-2 whitespace-nowrap text-[var(--sc-text-primary)]"
                            title={item.invoiceNo}
                          >
                            <FileText
                              size={16}
                              className="shrink-0 text-[var(--sc-primary)]"
                              aria-hidden
                            />
                            {item.invoiceNo.endsWith(item.id)
                              ? `${item.invoiceNo.slice(0, -item.id.length)}${item.id.slice(0, 8).toUpperCase()}`
                              : item.invoiceNo}
                          </span>
                          <p className="mb-0 mt-0.5 text-xs font-normal text-[var(--sc-text-secondary)]">
                            {item.documentType === 'SERVICE'
                              ? t('ledgerDocument')
                              : t('due', { date: date(item.dueOn) })}
                          </p>
                        </td>
                        <td className="px-5 py-3.5 text-xs font-medium text-[var(--sc-text-secondary)]">
                          {t(`kinds.${item.documentType}`)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-xs text-[var(--sc-text-secondary)]">
                          {formatPeriod(item.periodKey)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 font-semibold tabular-nums">
                          {money(item.totalVnd)}
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge
                            status={
                              item.documentStatus === 'DRAFT'
                                ? 'default'
                                : item.paymentStatus === 'PAID'
                                  ? 'success'
                                  : item.paymentStatus === 'EXPIRED'
                                    ? 'error'
                                    : item.paymentStatus === 'LEDGER'
                                      ? 'info'
                                      : 'warning'
                            }
                            label={t(
                              `states.${item.documentStatus === 'DRAFT' ? 'DRAFT' : item.paymentStatus}`,
                            )}
                          />
                        </td>
                        <td className="px-5 py-3.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelected(item.id);
                            }}
                          >
                            {t('details')}
                            <ArrowUpRight size={14} aria-hidden />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {cursor && (
          <div className="border-t border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/40 px-5 py-2.5 text-right">
            <Button
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => {
                void more();
              }}
            >
              {t('more')}
            </Button>
          </div>
        )}
      </Card>

      {selected && (
        <InvoiceDetail
          key={selected}
          id={selected}
          tenantId={tenantId}
          onClose={() => {
            setSelected(null);
          }}
          onChanged={async () => {
            setRevision((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}

export function FulfillmentBilling({ tenantId: fixedTenant }: { tenantId?: string }) {
  const linkedInvoice = notificationTarget(useLocation().search, 'invoiceId');
  const t = useTranslations('Invoices');
  const scope = useAuthStore((s) => s.user?.actorScope);
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]),
    [selected, setSelected] = useState(
      () => sessionStorage.getItem('orca_platform_selected_seller') || '',
    ),
    [error, setError] = useState<string | null>(null),
    [retry, setRetry] = useState(0),
    [filters, setFilters] = useState<Filters>({ month: '', documentType: '' });
  const form = useForm<Filters>({
    resolver: zodResolver(invoiceFiltersSchema),
    defaultValues: filters,
  });

  useEffect(() => {
    const abort = new AbortController();
    if (scope === 'PLATFORM' && !fixedTenant) {
      void commercialApi
        .financialSellers(abort.signal)
        .then((rows) => {
          if (!abort.signal.aborted) {
            setSellers(rows);
            setSelected((prev) => {
              if (prev && rows.some((r) => r.id === prev)) return prev;
              const preferred =
                rows.find((r) => r.id === 'd9ff7a86-17fd-49ff-b3fa-bdb60afc94bb')?.id ||
                rows[0]?.id ||
                '';
              if (preferred) sessionStorage.setItem('orca_platform_selected_seller', preferred);
              return preferred;
            });
            setError(null);
          }
        })
        .catch((failure) => {
          if (!abort.signal.aborted) {
            setError(failure instanceof Error ? failure.message : t('loadError'));
          }
        });
    }
    return () => {
      abort.abort();
    };
  }, [scope, fixedTenant, t, retry]);

  const target = fixedTenant ?? (scope === 'PLATFORM' ? selected : undefined);

  const sellerSelector =
    scope === 'PLATFORM' && !fixedTenant ? (
      <div className="w-64">
        <SearchableSelect
          placeholder={t('selectSeller')}
          searchPlaceholder={t('searchSeller')}
          value={selected}
          options={sellers.map((seller) => ({ value: seller.id, label: seller.name }))}
          onChange={(val) => {
            setSelected(val);
            if (val) sessionStorage.setItem('orca_platform_selected_seller', val);
          }}
        />
      </div>
    ) : null;

  const filterForm = (
    <form
      onSubmit={form.handleSubmit(setFilters, () => notifyInvalidForm())}
      className={`grid items-end gap-3 ${
        fixedTenant ? 'sm:grid-cols-2' : 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]'
      }`}
    >
      <Controller
        control={form.control}
        name="month"
        render={({ field, fieldState }) => (
          <MonthPicker
            label={t('month')}
            placeholder={t('chooseMonth')}
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error ? t('invalidMonth') : undefined}
          />
        )}
      />
      <Select
        label={t('kind')}
        placeholder={t('allKinds')}
        options={['', 'ONBOARDING', 'PLAN', 'SERVICE', 'ADJUSTMENT'].map((value) => ({
          value,
          label: value ? t(`kinds.${value}`) : t('allKinds'),
        }))}
        {...form.register('documentType')}
        error={form.formState.errors?.documentType?.message}
      />
      <Button type="submit" size="sm" variant="outline">
        <Filter size={15} aria-hidden />
        {t('apply')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => {
          const empty: Filters = { month: '', documentType: '' };
          form.reset(empty);
          setFilters(empty);
        }}
      >
        {t('reset')}
      </Button>
    </form>
  );

  return (
    <section className="space-y-3.5">
      {error && (
        <Alert variant="error">
          {error}
          <Button
            variant="ghost"
            onClick={() => {
              setRetry((value) => value + 1);
            }}
          >
            {t('retry')}
          </Button>
        </Alert>
      )}
      {scope === 'TENANT' || target ? (
        <InvoiceList
          key={`${target ?? 'own'}:${filters.month}:${filters.documentType}:${linkedInvoice ?? ''}`}
          initialId={linkedInvoice}
          tenantId={target}
          filters={filters}
          compact={Boolean(fixedTenant)}
          headerActions={sellerSelector}
          filterBar={filterForm}
        />
      ) : (
        <Card
          padding="none"
          className="border border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sc-border-default)] px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary)]">
                <FileText size={18} aria-hidden="true" />
              </span>
              <div>
                <h1 className="m-0 text-base font-semibold text-[var(--sc-text-primary)] sm:text-lg">
                  {t('title')}
                </h1>
                <p className="mb-0 mt-0.5 text-xs text-[var(--sc-text-secondary)]">
                  {t('description')}
                </p>
              </div>
            </div>
            {sellerSelector}
          </div>
          <div className="px-5 py-8 text-center text-sm text-[var(--sc-text-secondary)] sm:px-6">
            {t('selectSeller')}
          </div>
        </Card>
      )}
    </section>
  );
}
