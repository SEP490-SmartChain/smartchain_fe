import { useMemo, useState } from 'react';

import { Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import { Input } from '@/components/Common/Input/Input';
import { Select } from '@/components/Common/Select/Select';
import { useDebounce } from '@/hooks/useDebounce';
import { isSyncDelayed } from '@/lib/syncDelay';

import { StockSummaryCards } from './StockSummaryCards';
import { useInventoryStocks } from '../hooks/useInventoryStocks';
import { useWarehouseOptions } from '../hooks/useWarehouseOptions';

import type { InventoryStockFilters, InventoryStockLevel } from '../types/inventoryStock.types';

const PAGE_SIZE = 10;
/** Khớp giới hạn `search` của `GET /v1/inventory/stocks` (tối đa 100 ký tự). */
const SEARCH_MAX_LENGTH = 100;
/** `inventory_stocks` là bảng nóng nhất hệ thống: chỉ truy vấn khi người dùng ngừng gõ. */
const SEARCH_DEBOUNCE_MS = 400;

export function StockLevelsPanel() {
  const t = useTranslations('Inventory');
  const locale = useLocale();
  const [searchInput, setSearchInput] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const debouncedSearch = useDebounce(searchInput, SEARCH_DEBOUNCE_MS);
  const filters = useMemo<InventoryStockFilters>(
    () => ({ search: debouncedSearch, warehouseId }),
    [debouncedSearch, warehouseId],
  );
  const { stockLevels, error, isLoading, hasNextPage, refetch, loadMore } =
    useInventoryStocks(filters);
  const { warehouses, error: warehouseError } = useWarehouseOptions();

  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const dateTimeFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }),
    [locale],
  );
  const warehouseOptions = useMemo(
    () =>
      warehouses.map((warehouse) => ({
        value: warehouse.id,
        label: `${warehouse.code} — ${warehouse.name}`,
      })),
    [warehouses],
  );

  const loadedPageCount = Math.max(1, Math.ceil(stockLevels.length / PAGE_SIZE));
  const totalPages = loadedPageCount + (hasNextPage ? 1 : 0);
  const visibleStockLevels = stockLevels.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const hasActiveFilters = filters.search.trim() !== '' || filters.warehouseId !== '';

  const handleSearchChange = (value: string) => {
    setCurrentPage(1);
    setSearchInput(value);
  };

  const handleWarehouseChange = (value: string) => {
    setCurrentPage(1);
    setWarehouseId(value);
  };

  const handlePageChange = async (page: number) => {
    if (page > loadedPageCount && hasNextPage) await loadMore();
    setCurrentPage(page);
  };

  const columns: ColumnDef<InventoryStockLevel>[] = [
    { key: 'sku', label: t('columnSku') },
    { key: 'productName', label: t('columnProductName') },
    {
      key: 'warehouse',
      label: t('columnWarehouse'),
      render: (row) => (
        <span className="flex flex-col">
          <span className="font-medium">{row.warehouseCode}</span>
          <span className="text-xs text-[var(--sc-text-secondary)]">{row.warehouseName}</span>
        </span>
      ),
    },
    {
      key: 'availableQty',
      label: t('columnAvailable'),
      render: (row) => numberFormatter.format(row.availableQty),
    },
    {
      key: 'reservedQty',
      label: t('columnReserved'),
      render: (row) => numberFormatter.format(row.reservedQty),
    },
    {
      key: 'onHandQty',
      label: t('columnOnHand'),
      render: (row) => numberFormatter.format(row.onHandQty),
    },
    {
      key: 'lastSyncedAt',
      label: t('columnLastSync'),
      render: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          <time dateTime={row.lastSyncedAt}>
            {dateTimeFormatter.format(new Date(row.lastSyncedAt))}
          </time>
          {isSyncDelayed(row.lastSyncedAt) && <Badge status="warning" label={t('syncDelayed')} />}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="m-0 text-lg font-medium leading-6 text-[var(--sc-text-primary)]">
          {t('title')}
        </h1>
      </header>

      <StockSummaryCards />

      {error ? (
        <Alert variant="error" title={t('loadError')}>
          <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
            {t('retry')}
          </Button>
        </Alert>
      ) : (
        <section className="sc-surface overflow-hidden" aria-label={t('tableLabel')}>
          <div className="grid gap-3 border-b border-[var(--sc-border-default)] p-4 sm:grid-cols-[1fr_260px]">
            <Input
              type="search"
              aria-label={t('searchLabel')}
              placeholder={t('searchPlaceholder')}
              value={searchInput}
              maxLength={SEARCH_MAX_LENGTH}
              leftIcon={<Search size={16} aria-hidden="true" />}
              onChange={(event) => handleSearchChange(event.target.value)}
            />
            <Select
              aria-label={t('warehouseFilter')}
              value={warehouseId}
              placeholder={warehouseError ? t('warehouseLoadError') : t('allWarehouses')}
              isPlaceholderDisabled={false}
              disabled={warehouseError !== null}
              options={warehouseOptions}
              onChange={(event) => handleWarehouseChange(event.target.value)}
            />
          </div>

          <DataTable
            ariaLabel={t('tableLabel')}
            columns={columns}
            data={visibleStockLevels}
            isLoading={isLoading}
            getRowKey={(row) => row.id}
            emptyMessage={hasActiveFilters ? t('emptyFiltered') : t('emptyState')}
            pagination={{
              currentPage: Math.min(currentPage, totalPages),
              totalPages,
              onPageChange: (page) => void handlePageChange(page),
            }}
          />
        </section>
      )}
    </div>
  );
}
