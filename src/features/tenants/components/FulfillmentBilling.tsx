import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
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
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: t('documents'), value: String(items.length) },
          {
            label: t('documentTotal'),
            value: money(
              items.reduce((sum, item) => sum + BigInt(item.totalVnd), BigInt(0)).toString(),
            ),
          },
          {
            label: t('outstanding'),
            value: money(
              items.reduce((sum, item) => sum + BigInt(item.outstandingVnd), BigInt(0)).toString(),
            ),
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-5"
          >
            <p className="text-sm text-[var(--sc-text-secondary)]">{card.label}</p>
            <p className="mt-3 break-words text-xl font-semibold tabular-nums">{card.value}</p>
            <p className="mt-2 text-xs text-[var(--sc-text-secondary)]">{t('loadedOnly')}</p>
          </div>
        ))}
      </div>
      {tenantId && can('invoice.period.close') && (
        <form
          onSubmit={close}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--sc-border-default)] p-4"
        >
          <Input
            type="month"
            label={t('closeMonth')}
            error={closeForm.formState.errors.month ? t('invalidMonth') : undefined}
            {...closeForm.register('month')}
          />
          <Button type="submit" variant="outline" isLoading={closeForm.formState.isSubmitting}>
            {t('closePeriod')}
          </Button>
          <p className="text-xs text-[var(--sc-text-secondary)]">{t('closeHelp')}</p>
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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" aria-label={t('listTitle')}>
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
                  <tr key={item.id} className="border-t border-[var(--sc-border-default)]">
                    <td className="max-w-72 break-all px-5 py-4 font-medium">
                      {item.invoiceNo}
                      <p className="mt-1 text-xs font-normal text-[var(--sc-text-secondary)]">
                        {t('due', { date: item.dueOn })}
                      </p>
                    </td>
                    <td className="px-5 py-4">{t(`kinds.${item.documentType}`)}</td>
                    <td className="whitespace-nowrap px-5 py-4">{item.periodKey}</td>
                    <td className="whitespace-nowrap px-5 py-4 font-medium tabular-nums">
                      {money(item.totalVnd)}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex whitespace-nowrap rounded-full bg-[var(--sc-bg-secondary)] px-3 py-1 text-xs font-medium">
                        {t(
                          `states.${item.documentStatus === 'DRAFT' ? 'DRAFT' : item.paymentStatus}`,
                        )}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelected(item.id);
                        }}
                      >
                        {t('details')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
      <div className="rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-[var(--sc-accent-light)] p-3 text-[var(--sc-primary)]">
            <FileText size={24} />
          </div>
          <div>
            <h2 className="text-xl font-semibold">{t('title')}</h2>
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
            <Select
              label={t('seller')}
              placeholder={t('selectSeller')}
              value={selected}
              options={sellers.map((seller) => ({ value: seller.id, label: seller.name }))}
              onChange={(event) => {
                setSelected(event.target.value);
              }}
            />
          </div>
        )}
        <form
          onSubmit={form.handleSubmit(setFilters)}
          className="mt-5 flex flex-wrap items-end gap-3"
        >
          <Input
            type="month"
            label={t('month')}
            error={form.formState.errors.month ? t('invalidMonth') : undefined}
            {...form.register('month')}
          />
          <Select
            label={t('kind')}
            options={['', 'ONBOARDING', 'PLAN', 'SERVICE', 'ADJUSTMENT'].map((value) => ({
              value,
              label: value ? t(`kinds.${value}`) : t('allKinds'),
            }))}
            {...form.register('documentType')}
          />
          <Button type="submit" variant="outline">
            {t('apply')}
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
