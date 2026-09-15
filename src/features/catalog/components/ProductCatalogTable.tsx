import { useMemo, useState } from 'react';

import { Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import { Input } from '@/components/Common/Input/Input';
import { Select } from '@/components/Common/Select/Select';

import { useProducts } from '../hooks/useProducts';

import type { Product, ProductFilters } from '../types/product.types';

const INITIAL_FILTERS: ProductFilters = { search: '', isActive: '' };
const PAGE_SIZE = 10;

export function ProductCatalogTable() {
  const t = useTranslations('ProductCatalog');
  const locale = useLocale();
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);
  const { products, error, isLoading, hasNextPage, refetch, loadMore } = useProducts(filters);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'VND',
        maximumFractionDigits: 0,
      }),
    [locale],
  );

  const loadedPageCount = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const totalPages = loadedPageCount + (hasNextPage ? 1 : 0);
  const visibleProducts = products.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleFilter = (name: keyof ProductFilters, value: string) => {
    setCurrentPage(1);
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const handlePageChange = async (page: number) => {
    if (page > loadedPageCount && hasNextPage) await loadMore();
    setCurrentPage(page);
  };

  const columns: ColumnDef<Product>[] = [
    { key: 'sku', label: t('columnSku') },
    { key: 'name', label: t('columnName') },
    {
      key: 'weightG',
      label: t('columnWeight'),
      render: (row) => t('weightValue', { weight: row.weightG }),
    },
    {
      key: 'dimensions',
      label: t('columnDimensions'),
      render: (row) => `${row.lengthCm} × ${row.widthCm} × ${row.heightCm} cm`,
    },
    {
      key: 'declaredValue',
      label: t('columnDeclaredValue'),
      render: (row) => currencyFormatter.format(Number(row.declaredValue)),
    },
    {
      key: 'isActive',
      label: t('columnStatus'),
      render: (row) => (
        <Badge
          status={row.isActive ? 'success' : 'default'}
          label={row.isActive ? t('active') : t('inactive')}
          size="md"
        />
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

      {error ? (
        <Alert variant="error" title={t('loadError')}>
          <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
            {t('retry')}
          </Button>
        </Alert>
      ) : (
        <section className="sc-surface overflow-hidden" aria-label={t('tableLabel')}>
          <div className="grid gap-3 border-b border-[var(--sc-border-default)] p-4 sm:grid-cols-[1fr_200px]">
            <Input
              type="search"
              aria-label={t('searchLabel')}
              placeholder={t('searchHere')}
              value={filters.search}
              leftIcon={<Search size={16} aria-hidden="true" />}
              onChange={(event) => handleFilter('search', event.target.value)}
            />
            <Select
              aria-label={t('statusFilter')}
              value={filters.isActive}
              placeholder={t('allStatuses')}
              isPlaceholderDisabled={false}
              options={[
                { value: 'true', label: t('active') },
                { value: 'false', label: t('inactive') },
              ]}
              onChange={(event) => handleFilter('isActive', event.target.value)}
            />
          </div>

          <DataTable
            ariaLabel={t('tableLabel')}
            columns={columns}
            data={visibleProducts}
            isLoading={isLoading}
            getRowKey={(row) => row.id}
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
