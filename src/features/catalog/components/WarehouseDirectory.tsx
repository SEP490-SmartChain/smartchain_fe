import { useCallback, useEffect, useRef, useState, Fragment } from 'react';

import {
  ChevronDown,
  ChevronRight,
  Filter,
  LoaderCircle,
  MapPin,
  Plus,
  Search,
  Warehouse as WarehouseIcon,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import Pagination from '@/components/Common/Pagination/Pagination';
import { Select } from '@/components/Common/Select/Select';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';

import { AddWarehouseModal } from './AddWarehouseModal';
import { WarehouseDowntimePanel } from './WarehouseDowntimePanel';
import { WarehouseStatusModal } from './WarehouseStatusModal';
import { WarehouseLayoutPanel } from './WarehouseLayoutPanel';
import { warehouseApi } from '../api/warehouseApi';

import type { Warehouse, WarehouseFilters, WarehouseStatus } from '../types/warehouse';

export function WarehouseDirectory() {
  const t = useTranslations('Warehouses');
  const locale = useLocale();
  const { can } = useAccess();
  const canManage = can('warehouses.manage');
  const canUpdate = can('warehouses.update');
  const principal = useAuthStore((state) => state.user);
  const [filters, setFilters] = useState<WarehouseFilters>({ search: '', status: '' });
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const requestRevision = useRef(0);

  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);

  const cache = useRef<
    Record<number, { items: Warehouse[]; cursor: string | null; hasNext: boolean }>
  >({});

  const invalidateRequests = useCallback(() => {
    requestRevision.current++;
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 400);
    return () => clearTimeout(handler);
  }, [filters.search]);

  const fetchWarehouses = useCallback(
    async (cursor?: string, page = 1) => {
      const revision = ++requestRevision.current;
      try {
        setIsLoading(true);
        setError(null);
        const activeFilters = {
          search: debouncedSearch,
          status: filters.status,
        };

        const result = await warehouseApi.list(activeFilters, cursor);
        if (revision !== requestRevision.current) return;
        setCurrentPage(page);
        setWarehouses(result.items);
        setHasNextPage(result.pagination.hasNext);
        setNextCursor(result.pagination.nextCursor);
        cache.current[page] = {
          items: result.items,
          cursor: result.pagination.nextCursor,
          hasNext: result.pagination.hasNext,
        };
      } catch (failure) {
        if (revision === requestRevision.current) {
          setError(failure instanceof Error ? failure : new Error(String(failure)));
        }
      } finally {
        if (revision === requestRevision.current) setIsLoading(false);
      }
    },
    [debouncedSearch, filters.status],
  );

  useEffect(() => {
    cache.current = {};
    setCurrentPage(1);
    setWarehouses([]);
    setExpandedId(null);
    setAddModalOpen(false);
    setEditingWarehouse(null);
    setSelectedWarehouse(null);
    void fetchWarehouses(undefined, 1);
    return invalidateRequests;
  }, [fetchWarehouses, invalidateRequests, principal]);

  const handlePageChange = (page: number) => {
    if (page === currentPage) return;
    if (cache.current[page]) {
      invalidateRequests();
      setWarehouses(cache.current[page].items);
      setNextCursor(cache.current[page].cursor);
      setHasNextPage(cache.current[page].hasNext);
      setIsLoading(false);
      setCurrentPage(page);
    } else if (page > currentPage && nextCursor) {
      void fetchWarehouses(nextCursor, page);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--sc-bg-primary)]">
      <header className="flex flex-col gap-5 border-b border-[var(--sc-border-default)] px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--sc-text-primary)]">
            {t('title')}
          </h1>
          <p className="mt-1.5 text-sm text-[var(--sc-text-secondary)]">{t('description')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {canManage && (
            <Button variant="primary" onClick={() => setAddModalOpen(true)}>
              <Plus size={16} />
              {t('addWarehouse')}
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-4 p-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
            />
            <Input
              type="text"
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchLabel')}
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="pl-10"
            />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-[var(--sc-text-secondary)]" />
              <Select
                aria-label={t('statusFilter')}
                value={filters.status}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, status: e.target.value as WarehouseStatus | '' }))
                }
                options={[
                  { label: t('allStatuses'), value: '' },
                  { label: t('active'), value: 'ACTIVE' },
                  { label: t('inactive'), value: 'INACTIVE' },
                ]}
                className="w-[140px]"
              />
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <Alert variant="error" title={t('loadError')}>
          <Button variant="outline" onClick={() => void fetchWarehouses()}>
            {t('retry')}
          </Button>
        </Alert>
      ) : isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <LoaderCircle size={28} className="animate-spin text-[var(--sc-primary)]" />
        </div>
      ) : warehouses.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--sc-bg-secondary)] text-[var(--sc-text-tertiary)]">
            <WarehouseIcon size={24} />
          </div>
          <h3 className="mt-4 text-base font-semibold text-[var(--sc-text-primary)]">
            {t('emptyTitle')}
          </h3>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--sc-text-secondary)]">
            {t('emptyState')}
          </p>
        </div>
      ) : (
        <section className="flex min-h-0 flex-1 flex-col justify-between overflow-hidden sm:px-6 lg:px-8">
          <div className="min-h-0 overflow-auto rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] shadow-sm">
            <table aria-label={t('tableLabel')} className="w-full min-w-[800px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--sc-bg-elevated)] text-[13px] font-medium text-[var(--sc-text-secondary)] shadow-[0_1px_0_var(--sc-border-default)]">
                <tr>
                  <th className="w-12 px-2 py-3.5 pl-4 sm:pl-5" />
                  <th className="px-4 py-3.5">{t('columnCode')}</th>
                  <th className="px-4 py-3.5">{t('columnName')}</th>
                  <th className="px-4 py-3.5">{t('columnAddress')}</th>
                  <th className="px-4 py-3.5">{t('columnCapacity')}</th>
                  <th className="px-4 py-3.5">{t('columnStatus')}</th>
                  <th className="w-16 px-4 py-3.5 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sc-border-default)]">
                {warehouses.map((warehouse) => {
                  const isExpanded = expandedId === warehouse.id;
                  return (
                    <Fragment key={warehouse.id}>
                      <tr
                        className={`group transition-colors hover:bg-[var(--sc-bg-secondary)] ${
                          isExpanded ? 'bg-[var(--sc-bg-secondary)]' : ''
                        }`}
                      >
                        <td className="px-2 py-3.5 pl-4 sm:pl-5">
                          <Button
                            variant="ghost"
                            type="button"
                            aria-label={t('toggleDetails', { code: warehouse.code })}
                            aria-expanded={isExpanded}
                            onClick={() => setExpandedId(isExpanded ? null : warehouse.id)}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--sc-text-tertiary)] hover:bg-[var(--sc-bg-secondary)] hover:text-[var(--sc-text-primary)] transition-colors"
                          >
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </Button>
                        </td>
                        <td className="px-4 py-3.5 font-medium text-[var(--sc-text-primary)]">
                          {warehouse.code}
                        </td>
                        <td className="px-4 py-3.5 text-[var(--sc-text-primary)]">
                          {warehouse.name}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 text-[var(--sc-text-secondary)]">
                            <MapPin size={14} className="shrink-0" />
                            <span className="truncate max-w-[200px]">{warehouse.address}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-[var(--sc-text-primary)]">
                          {warehouse.dailyCapacity.toLocaleString(locale)}
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge
                            status={warehouse.status === 'ACTIVE' ? 'success' : 'neutral'}
                            label={t(warehouse.status === 'ACTIVE' ? 'active' : 'inactive')}
                            size="md"
                          />
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          {canManage && (
                            <Button
                              variant="ghost"
                              type="button"
                              aria-label={t('changeStatus', { code: warehouse.code })}
                              onClick={() => setSelectedWarehouse(warehouse)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--sc-text-secondary)] transition-colors hover:bg-[var(--sc-bg-secondary)] hover:text-[var(--sc-text-primary)]"
                            >
                              {warehouse.status === 'ACTIVE' ? (
                                <ToggleRight size={17} />
                              ) : (
                                <ToggleLeft size={17} />
                              )}
                            </Button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-[var(--sc-bg-secondary)]/50">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                              <div>
                                <span className="block text-xs font-medium text-[var(--sc-text-tertiary)]">
                                  {t('gps')}
                                </span>
                                <span className="mt-1 block text-sm text-[var(--sc-text-primary)]">
                                  {warehouse.latitude}, {warehouse.longitude}
                                </span>
                              </div>
                              <div>
                                <span className="block text-xs font-medium text-[var(--sc-text-tertiary)]">
                                  {t('contactName')}
                                </span>
                                <span className="mt-1 block text-sm text-[var(--sc-text-primary)]">
                                  {warehouse.contactName || '—'}
                                </span>
                              </div>
                              <div>
                                <span className="block text-xs font-medium text-[var(--sc-text-tertiary)]">
                                  {t('contactPhone')}
                                </span>
                                <span className="mt-1 block text-sm text-[var(--sc-text-primary)]">
                                  {warehouse.contactPhone || '—'}
                                </span>
                              </div>
                            </div>
                            {canUpdate && (
                              <Button
                                className="mt-4"
                                variant="outline"
                                onClick={() => setEditingWarehouse(warehouse)}
                              >
                                {t('editWarehouse')}
                              </Button>
                            )}
                            {can('warehouses.layout.view') && (
                              <WarehouseLayoutPanel key={warehouse.id} warehouse={warehouse} />
                            )}
                            {can('warehouses.downtime.view') && (
                              <WarehouseDowntimePanel
                                warehouse={warehouse}
                                onSaved={() => {
                                  cache.current = {};
                                  void fetchWarehouses();
                                }}
                              />
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="py-4">
            <Pagination
              currentPage={currentPage}
              totalPages={hasNextPage ? currentPage + 1 : currentPage}
              onPageChange={handlePageChange}
            />
          </div>
        </section>
      )}

      {(canManage || canUpdate) && (
        <>
          <AddWarehouseModal
            isOpen={addModalOpen || editingWarehouse !== null}
            warehouse={editingWarehouse}
            onClose={() => {
              setAddModalOpen(false);
              setEditingWarehouse(null);
            }}
            onSuccess={() => {
              setAddModalOpen(false);
              setEditingWarehouse(null);
              cache.current = {};
              void fetchWarehouses();
            }}
          />

          {canManage && selectedWarehouse && (
            <WarehouseStatusModal
              warehouse={selectedWarehouse}
              onClose={() => setSelectedWarehouse(null)}
              onSaved={() => {
                setSelectedWarehouse(null);
                cache.current = {};
                void fetchWarehouses();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
