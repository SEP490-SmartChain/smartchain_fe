import { useEffect, useRef, useState } from 'react';

import { Controller, useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowUpRight, CalendarDays, FileText, Filter, RefreshCw, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { MonthPicker } from '@/components/Common/DatePicker/MonthPicker';
import { SearchableSelect } from '@/components/Common/Select/SearchableSelect';
import { Select } from '@/components/Common/Select/Select';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';
import { useLocaleStore } from '@/stores/localeStore';

import { InvoiceDetail } from './InvoiceDetail';
import { commercialApi } from '../api/commercialApi';
import { invoiceApi, type FeeInvoice } from '../api/invoiceApi';
import { invoiceFiltersSchema, closeInvoicePeriodSchema } from '../schemas/invoiceSchema';

import type { z } from 'zod';

type Filters = z.infer<typeof invoiceFiltersSchema>;

function InvoiceList({ tenantId, filters }: { tenantId?: string; filters: Filters }) {
  const t = useTranslations('Invoices');
  const locale = useLocaleStore((s) => s.locale);
  const { can } = useAccess();
  const [items, setItems] = useState<FeeInvoice[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<string | null>(null),
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
  const money = (value: string) =>
    `${BigInt(value).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')} VND`;
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB').format(
      new Date(`${value}T12:00:00Z`),
    );
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
  const close = closeForm.handleSubmit(async (input) => {
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
  });
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3" aria-busy={loading}>
        {[
          { label: t('documents'), value: String(items.length), icon: FileText, emphasis: false },
          {
            label: t('documentTotal'),
            value: money(
              items.reduce((sum, item) => sum + BigInt(item.totalVnd), BigInt(0)).toString(),
            ),
            icon: CalendarDays,
            emphasis: false,
          },
          {
            label: t('outstanding'),
            value: money(
              items.reduce((sum, item) => sum + BigInt(item.outstandingVnd), BigInt(0)).toString(),
            ),
            icon: Wallet,
            emphasis: true,
          },
        ].map((card) => (
          <div
            key={card.label}
            className={`relative overflow-hidden rounded-2xl border p-5 ${card.emphasis ? 'border-[var(--sc-primary)] bg-[var(--sc-primary)] text-white' : 'border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)]'}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p
                className={`text-sm ${card.emphasis ? 'text-white/90' : 'text-[var(--sc-text-secondary)]'}`}
              >
                {card.label}
              </p>
              <card.icon
                size={19}
                className={card.emphasis ? 'text-white/80' : 'text-[var(--sc-primary)]'}
                aria-hidden
              />
            </div>
            <p className="mt-4 break-words text-2xl font-semibold tracking-tight tabular-nums">
              {loading && !items.length ? '—' : card.value}
            </p>
            <p
              className={`mt-2 text-xs ${card.emphasis ? 'text-white/80' : 'text-[var(--sc-text-secondary)]'}`}
            >
              {t('loadedOnly')}
            </p>
          </div>
        ))}
      </div>
      {tenantId && can('invoice.period.close') && (
        <form
          onSubmit={close}
          className="grid items-end gap-4 rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-5 sm:grid-cols-[minmax(0,1fr)_auto]"
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
                error={fieldState.error ? t('invalidMonth') : undefined}
              />
            )}
          />
          <Button type="submit" variant="outline" isLoading={closeForm.formState.isSubmitting}>
            {t('closePeriod')}
          </Button>
          <p className="text-xs leading-5 text-[var(--sc-text-secondary)] sm:col-span-2">
            {t('closeHelp')}
          </p>
        </form>
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
      <div className="overflow-hidden rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)]">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--sc-border-default)] p-5">
          <div>
            <h2 className="text-lg font-semibold">{t('listTitle')}</h2>
            <p className="mt-1 text-sm text-[var(--sc-text-secondary)]">{t('listHelp')}</p>
          </div>
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
        {loading && (
          <p role="status" className="p-5 text-sm">
            {t('loading')}
          </p>
        )}
        {!loading && !error && !items.length && (
          <div className="px-6 py-14 text-center">
            <FileText className="mx-auto mb-4 text-[var(--sc-text-secondary)]" size={32} />
            <h3 className="font-semibold">{t('empty')}</h3>
            <p className="mt-2 text-sm text-[var(--sc-text-secondary)]">{t('emptyHelp')}</p>
          </div>
        )}
        {items.length > 0 && (
          <>
            <div className="divide-y divide-[var(--sc-border-default)] md:hidden">
              {items.map((item) => (
                <article key={item.id} className="space-y-4 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--sc-primary)]">
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
                  <p className="text-sm font-medium" title={item.invoiceNo}>
                    {item.invoiceNo.endsWith(item.id)
                      ? `${item.invoiceNo.slice(0, -item.id.length)}${item.id.slice(0, 8).toUpperCase()}`
                      : item.invoiceNo}
                  </p>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-[var(--sc-text-secondary)]">{t('period')}</dt>
                      <dd className="mt-1">{item.periodKey}</dd>
                    </div>
                    <div className="text-right">
                      <dt className="text-xs text-[var(--sc-text-secondary)]">{t('total')}</dt>
                      <dd className="mt-1 font-semibold tabular-nums">{money(item.totalVnd)}</dd>
                    </div>
                  </dl>
                  <p className="text-xs text-[var(--sc-text-secondary)]">
                    {item.documentType === 'SERVICE'
                      ? t('ledgerDocument')
                      : t('due', { date: date(item.dueOn) })}
                  </p>
                  <Button
                    className="w-full"
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
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-left text-sm" aria-label={t('listTitle')}>
                <thead className="bg-[var(--sc-bg-secondary)] text-xs text-[var(--sc-text-secondary)]">
                  <tr>
                    {['invoice', 'kind', 'period', 'total', 'status', 'actions'].map((key) => (
                      <th key={key} className="px-5 py-3 font-medium">
                        {t(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-t border-[var(--sc-border-default)] transition-colors hover:bg-[var(--sc-bg-secondary)] motion-reduce:transition-none"
                    >
                      <td className="px-5 py-5 font-medium">
                        <span
                          className="inline-flex items-center gap-2 whitespace-nowrap"
                          title={item.invoiceNo}
                        >
                          <FileText
                            size={17}
                            className="shrink-0 text-[var(--sc-primary)]"
                            aria-hidden
                          />
                          {item.invoiceNo.endsWith(item.id)
                            ? `${item.invoiceNo.slice(0, -item.id.length)}${item.id.slice(0, 8).toUpperCase()}`
                            : item.invoiceNo}
                        </span>
                        <p className="mt-1 text-xs font-normal text-[var(--sc-text-secondary)]">
                          {item.documentType === 'SERVICE'
                            ? t('ledgerDocument')
                            : t('due', { date: date(item.dueOn) })}
                        </p>
                      </td>
                      <td className="px-5 py-4">{t(`kinds.${item.documentType}`)}</td>
                      <td className="whitespace-nowrap px-5 py-4">{item.periodKey}</td>
                      <td className="whitespace-nowrap px-5 py-4 font-medium tabular-nums">
                        {money(item.totalVnd)}
                      </td>
                      <td className="px-5 py-4">
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
                      <td className="px-5 py-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelected(item.id);
                          }}
                        >
                          {t('details')}
                          <ArrowUpRight size={15} aria-hidden />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {cursor && (
          <div className="p-4 text-center">
            <Button
              variant="ghost"
              disabled={loading}
              onClick={() => {
                void more();
              }}
            >
              {t('more')}
            </Button>
          </div>
        )}
      </div>
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
  const t = useTranslations('Invoices');
  const scope = useAuthStore((s) => s.user?.actorScope);
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]),
    [selected, setSelected] = useState(''),
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
  return (
    <section className="space-y-6">
      <div>
        <div className="flex items-start gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--sc-primary)]">
              {t('eyebrow')}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--sc-text-secondary)]">
              {t('description')}
            </p>
          </div>
        </div>
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
        {scope === 'PLATFORM' && !fixedTenant && (
          <div className="mt-5">
            <SearchableSelect
              label={t('seller')}
              placeholder={t('selectSeller')}
              searchPlaceholder={t('searchSeller')}
              value={selected}
              options={sellers.map((seller) => ({ value: seller.id, label: seller.name }))}
              onChange={(val) => {
                setSelected(val);
              }}
            />
          </div>
        )}
        <form
          onSubmit={form.handleSubmit(setFilters)}
          className="mt-6 grid items-end gap-3 rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]"
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
          />
          <Button type="submit" variant="outline">
            <Filter size={16} aria-hidden />
            {t('apply')}
          </Button>
          <Button
            type="button"
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
      </div>
      {scope === 'TENANT' || target ? (
        <InvoiceList
          key={`${target ?? 'own'}:${filters.month}:${filters.documentType}`}
          tenantId={target}
          filters={filters}
        />
      ) : (
        <Alert variant="info">{t('selectSeller')}</Alert>
      )}
    </section>
  );
}
