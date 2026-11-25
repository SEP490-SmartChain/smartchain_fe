import { useCallback, useEffect, useRef, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import DataTable from '@/components/Common/DataTable/DataTable';
import { useAuthStore } from '@/stores/authStore';
import { useLocaleStore } from '@/stores/localeStore';

import { carrierSettlementApi } from '../api/carrierSettlementApi';

type AgingPage = Awaited<ReturnType<typeof carrierSettlementApi.codAging>>;

export function CodAgingReport() {
  const t = useTranslations('SettlementMoney');
  const revision = useAuthStore((state) => state.revision);
  const locale = useLocaleStore((state) => state.locale);
  const [page, setPage] = useState<AgingPage | null>(null);
  const [sellerNames, setSellerNames] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const fallback = t('error');
  const load = useCallback(
    async (after: string | null) => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      setIsLoading(true);
      setError(null);
      try {
        const [result, names] = await Promise.all([
          carrierSettlementApi.codAging(after, abort.signal),
          // Names only label the rows; the report still works if the directory is unavailable.
          after
            ? Promise.resolve(null)
            : carrierSettlementApi.sellerNames(abort.signal).catch(() => null),
        ]);
        if (!abort.signal.aborted && revision === useAuthStore.getState().revision) {
          if (names) setSellerNames(names);
          setPage((current) => ({
            ...result,
            items: after ? [...(current?.items ?? []), ...result.items] : result.items,
          }));
        }
      } catch (failure) {
        if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : fallback);
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    },
    [fallback, revision],
  );
  useEffect(() => {
    setPage(null);
    void load(null);
    return () => controller.current?.abort();
  }, [load]);
  const numberLocale = locale === 'vi' ? 'vi-VN' : 'en-US';
  const day = (value: string) =>
    new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      dateStyle: 'medium',
    }).format(new Date(value));
  const items = page?.items ?? [];
  return (
    <details className="group rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
        <span>{t('agingTitle')}</span>
        {page && (
          <span className="text-sm font-medium text-[var(--sc-text-secondary)]">
            {t('agingCount', { count: items.length })}
          </span>
        )}
      </summary>
      <div className="mt-4 space-y-3">
        <p className="max-w-3xl text-sm leading-6 text-[var(--sc-text-secondary)]">
          {t('agingHelp')}
        </p>
        {error ? (
          <Alert variant="error">
            {error}
            <Button variant="ghost" onClick={() => void load(null)}>
              {t('retry')}
            </Button>
          </Alert>
        ) : (
          <DataTable
            ariaLabel={t('agingTitle')}
            data={items}
            isLoading={isLoading && !page}
            getRowKey={(row) => `${row.carrierCode}:${row.tenantId}`}
            emptyMessage={t('agingEmpty')}
            columns={[
              {
                key: 'tenantId',
                label: t('seller'),
                render: (row) => sellerNames.get(row.tenantId) ?? t('unknownSeller'),
              },
              { key: 'carrierCode', label: t('carrier') },
              {
                key: 'shipmentCount',
                label: t('parcels'),
                render: (row) => row.shipmentCount.toLocaleString(numberLocale),
              },
              {
                key: 'codVnd',
                label: t('agingAmount'),
                render: (row) => (
                  <span className="tabular-nums">
                    {`${BigInt(row.codVnd).toLocaleString(numberLocale)} VND`}
                  </span>
                ),
              },
              {
                key: 'oldestDeliveredAt',
                label: t('oldestDelivered'),
                render: (row) => day(row.oldestDeliveredAt),
              },
            ]}
          />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={isLoading} onClick={() => void load(null)}>
            {t('retry')}
          </Button>
          {page?.pagination.nextCursor && (
            <Button
              variant="outline"
              isLoading={isLoading}
              onClick={() => void load(page.pagination.nextCursor)}
            >
              {t('more')}
            </Button>
          )}
        </div>
      </div>
    </details>
  );
}
