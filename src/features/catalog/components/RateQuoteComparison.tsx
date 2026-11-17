import { useCallback, useEffect, useMemo, useState } from 'react';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card, CardHeader } from '@/components/Common/Card/Card';
import { Select } from '@/components/Common/Select/Select';
import { Tabs } from '@/components/Common/Tabs/Tabs';

import { rateQuotesApi, type RateQuoteComparison, type RateQuoteRow } from '../api/rateQuotesApi';
import { formatDays, formatDelta, formatVnd, formatWeight, zoneKey } from '../utils/rateDisplay';

interface RateQuoteComparisonProps {
  /** Changes whenever a price update finishes, so the table reloads. */
  refreshToken?: string;
}

/** A carrier quote this far from the purchase tariff suggests the tariff needs checking. */
const CARD_DRIFT_WARNING_PCT = 10;

/** Only quotes collected around the same time may be called the cheapest. */
function cheapestServiceId(row: RateQuoteRow, comparable: ReadonlySet<string>): string | null {
  const priced = row.quotes.filter(
    (cell) => cell.isDeliverable && cell.priceVnd !== null && comparable.has(cell.serviceId),
  );
  if (priced.length < 2) {
    return null;
  }
  return priced.reduce((best, cell) => (cell.priceVnd! < best.priceVnd! ? cell : best)).serviceId;
}

/** The quickest comparable service; only marked when at least two services have an estimate. */
function fastestServiceId(row: RateQuoteRow, comparable: ReadonlySet<string>): string | null {
  const timed = row.quotes.filter(
    (cell) => cell.isDeliverable && cell.deliveryDays !== null && comparable.has(cell.serviceId),
  );
  if (timed.length < 2) {
    return null;
  }
  return timed.reduce((best, cell) => (cell.deliveryDays! < best.deliveryDays! ? cell : best))
    .serviceId;
}

export function RateQuoteComparisonTable({ refreshToken = '' }: RateQuoteComparisonProps) {
  const t = useTranslations('RateIntelligence');
  const [data, setData] = useState<RateQuoteComparison | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [province, setProvince] = useState('');
  const [warehouseId, setWarehouseId] = useState('');

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
  const comparable = useMemo(
    () =>
      new Set(columns.filter((column) => column.isComparable).map((column) => column.serviceId)),
    [columns],
  );

  return (
    <Card padding="none">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--sc-border-default)] p-5">
        <CardHeader className="mb-0" title={t('quotesTitle')} description={t('quotesGuide')} />
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
                const cheapest = cheapestServiceId(row, comparable);
                const fastest = fastestServiceId(row, comparable);
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
                      return (
                        <td
                          key={column.serviceId}
                          className={`whitespace-nowrap px-4 py-3 ${isCheapest ? 'bg-[var(--sc-success-bg)]' : ''}`}
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
                                {formatVnd(cell.priceVnd)} đ
                              </span>
                              {isCheapest ? (
                                <span className="ml-2 text-xs font-medium text-[var(--sc-success-dark)]">
                                  {t('quotesCheapest')}
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
                                {cell.deliveryDays === null
                                  ? t('quotesNoEta')
                                  : t('quotesEta', { days: formatDays(cell.deliveryDays) })}
                                {cell.serviceId === fastest ? (
                                  <span className="ml-2 font-medium text-[var(--sc-success-dark)]">
                                    {t('quotesFastest')}
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-1 block text-xs text-[var(--sc-text-secondary)]">
                                {cell.cardPriceVnd === null ? (
                                  t('quotesNoCard')
                                ) : (
                                  <>
                                    {t('quotesCard', { price: formatVnd(cell.cardPriceVnd) })}
                                    {cell.cardDeltaPct !== null && cell.cardDeltaPct !== 0 ? (
                                      <span
                                        className={`ml-1 font-medium ${
                                          Math.abs(cell.cardDeltaPct) >= CARD_DRIFT_WARNING_PCT
                                            ? 'text-[var(--sc-warning-dark)]'
                                            : ''
                                        }`}
                                      >
                                        (
                                        {t('quotesCardDelta', {
                                          delta: formatDelta(cell.cardDeltaPct),
                                        })}
                                        )
                                      </span>
                                    ) : null}
                                  </>
                                )}
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
