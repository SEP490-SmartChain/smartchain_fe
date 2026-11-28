import { useCallback, useEffect, useMemo, useState } from 'react';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card, CardHeader } from '@/components/Common/Card/Card';
import { Select } from '@/components/Common/Select/Select';
import { Tabs } from '@/components/Common/Tabs/Tabs';

import { rateQuotesApi, type RateQuoteComparison, type RateQuoteRow } from '../api/rateQuotesApi';
import {
  balancedServiceId,
  formatDays,
  formatDelta,
  formatWeight,
  sellerQuoteVnd,
  tierHighlights,
  zoneKey,
  type DeliveryTierFilter,
} from '../utils/rateDisplay';

interface RateQuoteComparisonProps {
  /** Changes whenever a price update finishes, so the table reloads. */
  refreshToken?: string;
  markupVnd?: string;
}

const TIER_OPTIONS = ['ALL', 'ECONOMY', 'BALANCED', 'EXPRESS'] as const;

/** Only quotes collected around the same time may be called the cheapest. */
function cheapestServiceId(row: RateQuoteRow, comparable: ReadonlySet<string>): string | null {
  const priced = row.quotes.filter(
    (cell) =>
      cell.isDeliverable &&
      cell.priceVnd !== null &&
      Number.isSafeInteger(cell.priceVnd) &&
      cell.priceVnd > 0 &&
      comparable.has(cell.serviceId),
  );
  if (priced.length < 2) {
    return null;
  }
  return priced.reduce((best, cell) => (cell.priceVnd! < best.priceVnd! ? cell : best)).serviceId;
}

/** The quickest comparable service; only marked when at least two services have an estimate. */
function fastestServiceId(row: RateQuoteRow, comparable: ReadonlySet<string>): string | null {
  const timed = row.quotes.filter(
    (cell) =>
      cell.isDeliverable &&
      cell.priceVnd !== null &&
      Number.isSafeInteger(cell.priceVnd) &&
      cell.priceVnd > 0 &&
      cell.deliveryDays !== null &&
      comparable.has(cell.serviceId),
  );
  if (timed.length < 2) {
    return null;
  }
  return timed.reduce((best, cell) => (cell.deliveryDays! < best.deliveryDays! ? cell : best))
    .serviceId;
}

export function RateQuoteComparisonTable({
  refreshToken = '',
  markupVnd,
}: RateQuoteComparisonProps) {
  const locale = useLocale();
  const t = useTranslations('RateIntelligence');
  const vnd = new Intl.NumberFormat(locale, { style: 'currency', currency: 'VND' });
  const [data, setData] = useState<RateQuoteComparison | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [province, setProvince] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [tier, setTier] = useState<DeliveryTierFilter>('ALL');

  const load = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setHasError(false);
    try {
      setData(await rateQuotesApi.latest(signal));
    } catch {
      if (!signal?.aborted) {
        setHasError(true);
      }
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshToken]);

  const warehouses = useMemo(() => data?.warehouses ?? [], [data]);
  // Prices depend on where a parcel leaves from, so the table shows one origin warehouse at a time.
  const activeWarehouseId =
    warehouses.find((warehouse) => warehouse.id === warehouseId)?.id ?? warehouses[0]?.id ?? '';
  const warehouseRows = useMemo(
    () =>
      (data?.rows ?? []).filter(
        (row) => !activeWarehouseId || row.originWarehouseId === activeWarehouseId,
      ),
    [data, activeWarehouseId],
  );
  const provinces = useMemo(
    () => [...new Set(warehouseRows.map((row) => row.provinceName))],
    [warehouseRows],
  );
  const rows = useMemo(
    () => warehouseRows.filter((row) => !province || row.provinceName === province),
    [warehouseRows, province],
  );
  const zoneLabel = (code: string) => {
    const key = zoneKey(code);
    return key ? t(`zone${key}`) : code;
  };
  const columns = useMemo(() => data?.columns ?? [], [data]);
  const { isCheapestShown, isFastestShown } = tierHighlights(tier);
  const comparable = useMemo(
    () =>
      new Set(columns.filter((column) => column.isComparable).map((column) => column.serviceId)),
    [columns],
  );

  return (
    <Card padding="none">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--sc-border-default)] p-5">
        <CardHeader className="mb-0" title={t('quotesTitle')} description={t('quotesGuide')} />
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-44">
            <Select
              label={t('quotesTier')}
              value={tier}
              options={TIER_OPTIONS.map((value) => ({ value, label: t(`quotesTier_${value}`) }))}
              onChange={(event) =>
                setTier(TIER_OPTIONS.find((value) => value === event.target.value) ?? 'ALL')
              }
            />
          </div>
          {provinces.length > 1 ? (
            <div className="min-w-48">
              <Select
                label={t('quotesProvince')}
                value={province}
                placeholder={t('quotesAllProvinces')}
                isPlaceholderDisabled={false}
                options={provinces.map((name) => ({ value: name, label: name }))}
                onChange={(event) => setProvince(event.target.value)}
              />
            </div>
          ) : null}
        </div>
      </div>

      {warehouses.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--sc-border-default)] px-5 py-3">
          <span className="text-sm font-medium text-[var(--sc-text-primary)]">
            {t('quotesFromWarehouse')}
          </span>
          <Tabs
            variant="pills"
            label={t('quotesFromWarehouse')}
            activeId={activeWarehouseId}
            onChange={(id) => {
              setWarehouseId(id);
              setProvince('');
            }}
            tabs={warehouses.map((warehouse) => ({ id: warehouse.id, label: warehouse.name }))}
          />
        </div>
      ) : null}

      {isLoading && !data ? (
        <p className="p-6 text-sm text-[var(--sc-text-secondary)]">{t('loading')}</p>
      ) : hasError ? (
        <div className="space-y-3 p-6">
          <Alert variant="error">{t('loadError')}</Alert>
          <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
            {t('reload')}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="p-6 text-sm text-[var(--sc-text-secondary)]">{t('quotesEmpty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table
            aria-label={t('quotesTitle')}
            className="min-w-full divide-y divide-[var(--sc-border-default)] text-left text-sm"
          >
            <thead className="bg-[var(--sc-bg-secondary)] text-xs text-[var(--sc-text-secondary)]">
              <tr>
                <th scope="col" className="whitespace-nowrap px-4 py-3 font-medium">
                  {t('quotesProvince')}
                </th>
                <th scope="col" className="whitespace-nowrap px-4 py-3 font-medium">
                  {t('quotesWeight')}
                </th>
                {columns.map((column) => (
                  <th key={column.serviceId} scope="col" className="px-4 py-3 font-medium">
                    <span className="block text-sm text-[var(--sc-text-primary)]">
                      {column.carrierName}
                    </span>
                    <span className="block font-normal">{column.serviceName}</span>
                    {column.updatedAt ? (
                      <span className="block font-normal">
                        {new Date(column.updatedAt).toLocaleString()}
                      </span>
                    ) : null}
                    <span className="mt-1 flex flex-wrap gap-1">
                      {column.isComparable ? null : (
                        <Badge status="warning" size="sm" label={t('quotesStale')} />
                      )}
                      {column.isSample ? (
                        <Badge status="default" size="sm" label={t('sampleLabel')} />
                      ) : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sc-border-default)]">
              {rows.map((row) => {
                const cheapest = isCheapestShown ? cheapestServiceId(row, comparable) : null;
                const fastest = isFastestShown ? fastestServiceId(row, comparable) : null;
                const balanced =
                  tier === 'BALANCED' ? balancedServiceId(row.quotes, comparable) : null;
                return (
                  <tr key={row.key}>
                    <td className="whitespace-nowrap px-4 py-3">{row.provinceName}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatWeight(row.weightG)}
                      {row.isCod ? ` · ${t('routeCod')}` : ''}
                    </td>
                    {columns.map((column) => {
                      const cell = row.quotes.find((quote) => quote.serviceId === column.serviceId);
                      const isCheapest = cell !== undefined && cell.serviceId === cheapest;
                      const isBalanced = cell !== undefined && cell.serviceId === balanced;
                      const salePriceVnd = sellerQuoteVnd(cell, markupVnd);
                      return (
                        <td
                          key={column.serviceId}
                          className={`whitespace-nowrap px-4 py-3 ${isCheapest || isBalanced ? 'bg-[var(--sc-success-bg)]' : ''}`}
                        >
                          {!cell || cell.priceVnd === null ? (
                            <span className="text-[var(--sc-text-secondary)]">
                              {cell && !cell.isDeliverable
                                ? t('quotesNotDeliverable')
                                : t('quotesNoPrice')}
                            </span>
                          ) : (
                            <>
                              <span className="font-medium text-[var(--sc-text-primary)]">
                                {t('quoteCarrierPrice', {
                                  amount: vnd.format(BigInt(cell.priceVnd)),
                                })}
                              </span>
                              {isCheapest ? (
                                <span className="ml-2 text-xs font-medium text-[var(--sc-success-dark)]">
                                  {t('quotesCheapest')}
                                </span>
                              ) : null}
                              {isBalanced ? (
                                <span className="ml-2 text-xs font-medium text-[var(--sc-success-dark)]">
                                  {t('quotesBalanced')}
                                </span>
                              ) : null}
                              {salePriceVnd !== null && markupVnd !== undefined ? (
                                <span className="mt-1 grid gap-1 text-xs text-[var(--sc-text-secondary)]">
                                  <span>
                                    {t('quoteMarkup', { amount: vnd.format(BigInt(markupVnd)) })}
                                  </span>
                                  <span className="font-medium text-[var(--sc-text-primary)]">
                                    {t('quoteSellerPrice', { amount: vnd.format(salePriceVnd) })}
                                  </span>
                                </span>
                              ) : null}
                              {cell.zone ? (
                                <span className="mt-1 block">
                                  <Badge
                                    status="info"
                                    size="sm"
                                    label={t('quotesZone', { zone: zoneLabel(cell.zone) })}
                                  />
                                </span>
                              ) : null}
                              <span className="mt-1 block text-xs text-[var(--sc-text-secondary)]">
                                {cell.expectedDeliveryAt
                                  ? t('quotesArrival', {
                                      date: new Intl.DateTimeFormat(locale, {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                        timeZone: 'Asia/Ho_Chi_Minh',
                                      }).format(new Date(cell.expectedDeliveryAt)),
                                    })
                                  : cell.deliveryDays === null
                                    ? t('quotesNoEta')
                                    : t('quotesEta', { days: formatDays(cell.deliveryDays) })}
                                {cell.serviceId === fastest ? (
                                  <span className="ml-2 font-medium text-[var(--sc-success-dark)]">
                                    {t('quotesFastest')}
                                  </span>
                                ) : null}
                              </span>
                              {cell.deltaPct !== null && cell.deltaPct !== 0 ? (
                                <span
                                  className={`mt-1 flex items-center gap-1 text-xs ${
                                    cell.deltaPct > 0
                                      ? 'text-[var(--sc-error-dark)]'
                                      : 'text-[var(--sc-success-dark)]'
                                  }`}
                                >
                                  {cell.deltaPct > 0 ? (
                                    <ArrowUp aria-hidden="true" size={12} />
                                  ) : (
                                    <ArrowDown aria-hidden="true" size={12} />
                                  )}
                                  {formatDelta(cell.deltaPct)}
                                </span>
                              ) : null}
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
