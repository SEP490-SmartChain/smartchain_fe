import { useMemo, useState } from 'react';

import { RefreshCw, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/Common/Button/Button';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import { Input } from '@/components/Common/Input/Input';
import { useDebounce } from '@/hooks/useDebounce';

import { InventoryReadError } from './InventoryReadError';
import { InventoryState } from './InventoryState';
import { RunningLowCard } from './RunningLowCard';
import { StockSummaryCards } from './StockSummaryCards';
import { useInventoryStocks } from '../hooks/useInventoryStocks';

import type { InventoryStockFilters, InventoryStockLevel } from '../types/inventoryStock.types';

export function StockLevelsPanel({ warehouseId }: { warehouseId: string }) {
  const t = useTranslations('Inventory');
  const locale = useLocale();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 400);
  const filters = useMemo<InventoryStockFilters>(
    () => ({ search, warehouseId }),
    [search, warehouseId],
  );
  const { stockLevels, error, isLoading, isLoadingMore, hasNextPage, refetch, loadMore } =
    useInventoryStocks(filters);
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const columns: ColumnDef<InventoryStockLevel>[] = [
    {
      key: 'sku',
      label: t('product'),
      render: (row) => (
        <div className="min-w-44">
          <span className="font-medium">{row.sku}</span>
          <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">{row.productName}</p>
        </div>
      ),
    },
    {
      key: 'warehouse',
      label: t('columnWarehouse'),
      render: (row) => (
        <div className="min-w-32">
          <span className="font-medium">{row.warehouseCode}</span>
          <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">{row.warehouseName}</p>
        </div>
      ),
    },
    {
      key: 'onHandQty',
      label: t('columnOnHand'),
      render: (row) => (
        <span className="block text-right font-medium tabular-nums">
          {number.format(row.onHandQty)}
        </span>
      ),
    },
    {
      key: 'reservedQty',
      label: t('columnReserved'),
      render: (row) => (
        <span className="block text-right tabular-nums">{number.format(row.reservedQty)}</span>
      ),
    },
    {
      key: 'availableQty',
      label: t('columnAvailable'),
      render: (row) => (
        <span className="block text-right font-semibold tabular-nums text-[var(--sc-primary-dark)]">
          {number.format(row.availableQty)}
        </span>
      ),
    },
  ];
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="m-0 text-xs text-[var(--sc-text-secondary)]">{t('summaryScope')}</p>
        <StockSummaryCards />
      </div>
      <RunningLowCard warehouseId={warehouseId} />
      <section className="sc-surface overflow-hidden" aria-label={t('tableLabel')}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sc-border-default)] p-4">
          <div>
            <h2 className="m-0 text-base font-semibold">{t('tableTitle')}</h2>
            <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">
              {t('stockExplanation')}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={isLoading || isLoadingMore}
            onClick={() => void refetch()}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {t('refresh')}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--sc-border-default)] p-4">
          <div className="min-w-0 flex-1 sm:max-w-md">
            <Input
              type="search"
              aria-label={t('searchLabel')}
              placeholder={t('searchPlaceholder')}
              value={searchInput}
              maxLength={100}
              leftIcon={<Search size={16} aria-hidden="true" />}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          {searchInput && (
            <Button variant="ghost" size="sm" onClick={() => setSearchInput('')}>
              {t('clearFilters')}
            </Button>
          )}
        </div>
        {error ? (
          <div className="p-4">
            <InventoryReadError
              error={error}
              title={stockLevels.length ? t('loadMoreError') : t('loadError')}
              onRetry={() => void (stockLevels.length ? loadMore() : refetch())}
            />
          </div>
        ) : null}
        {(!error || stockLevels.length > 0) && (
          <div aria-busy={isLoading || isLoadingMore}>
            <DataTable
              ariaLabel={t('tableLabel')}
              columns={columns}
              data={stockLevels}
              isLoading={isLoading}
              getRowKey={(row) => row.id}
              emptyMessage={
                <InventoryState
                  compact
                  title={t(search.trim() ? 'emptyFiltered' : 'emptyState')}
                  description={t(search.trim() ? 'emptyFilteredHint' : 'emptyStockHint')}
                  action={
                    searchInput ? (
                      <Button variant="outline" size="sm" onClick={() => setSearchInput('')}>
                        {t('clearFilters')}
                      </Button>
                    ) : undefined
                  }
                />
              }
            />
            {!isLoading && stockLevels.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sc-border-default)] px-4 py-3">
                <span role="status" className="text-xs text-[var(--sc-text-secondary)]">
                  {t('loadedRows', { count: stockLevels.length })}
                </span>
                {hasNextPage && (
                  <Button
                    variant="outline"
                    size="sm"
                    isLoading={isLoadingMore}
                    onClick={() => void loadMore()}
                  >
                    {t('loadMore')}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
