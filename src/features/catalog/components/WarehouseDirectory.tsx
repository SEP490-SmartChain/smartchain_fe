import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import {
  ChevronDown,
  ChevronUp,
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
import { PageHeader } from '@/components/Common/PageHeader/PageHeader';
import Pagination from '@/components/Common/Pagination/Pagination';
import { Select } from '@/components/Common/Select/Select';
import { useAccess } from '@/hooks/useAccess';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { AddWarehouseModal } from './AddWarehouseModal';
import { WarehouseDetails } from './WarehouseDetails';
import { WarehouseStatusModal } from './WarehouseStatusModal';
import { warehouseApi } from '../api/warehouseApi';

import type {
  Warehouse,
  WarehouseFilters,
  WarehousePage,
  WarehouseStatus,
} from '../types/warehouse';

interface WarehouseDirectoryProps {
  headerAction?: ReactNode;
}

function subscribeToViewport(onChange: () => void) {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

function getVisibleColumnCount() {
  return 2 + [640, 768, 1024, 1280].filter((width) => window.innerWidth >= width).length;
}

function getServerColumnCount() {
  return 6;
}

export function WarehouseDirectory({ headerAction }: WarehouseDirectoryProps = {}) {
  const t = useTranslations('Warehouses');
  const locale = useLocale();
  const { can } = useAccess();
  const canManage = can('warehouses.manage');
  const canUpdate = can('warehouses.update');
  const principal = useAuthStore((state) => state.user);
  const visibleColumnCount = useSyncExternalStore(
    subscribeToViewport,
    getVisibleColumnCount,
    getServerColumnCount,
  );
  const [filters, setFilters] = useState<WarehouseFilters>({ search: '', status: '' });
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRevision = useRef(0);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);

  const cache = useRef<Record<number, WarehousePage>>({});
  const pageCursors = useRef<Record<number, string | undefined>>({});

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
    async (cursor?: string, page = 1, background = false) => {
      const revision = ++requestRevision.current;
      try {
        if (!background) setIsLoading(true);
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
        cache.current[page] = result;
        pageCursors.current[page] = cursor;
      } catch (failure) {
        if (revision === requestRevision.current) {
          setWarehouses([]);
          setHasNextPage(false);
          setNextCursor(null);
          setError(failure instanceof ApiError ? failure.message : t('loadError'));
        }
      } finally {
        if (revision === requestRevision.current) setIsLoading(false);
      }
    },
    [debouncedSearch, filters.status, t],
  );

  useEffect(() => {
    cache.current = {};
    pageCursors.current = {};
    setCurrentPage(1);
    setWarehouses([]);
    setDetailId(null);
    setAddModalOpen(false);
    setEditingWarehouse(null);
    setSelectedWarehouse(null);
    void fetchWarehouses(undefined, 1);
    return invalidateRequests;
  }, [fetchWarehouses, invalidateRequests, principal]);

  const handlePageChange = (page: number) => {
    if (page === currentPage) return;
    setDetailId(null);
    if (cache.current[page]) {
      invalidateRequests();
      setWarehouses(cache.current[page].items);
      setNextCursor(cache.current[page].pagination.nextCursor);
      setHasNextPage(cache.current[page].pagination.hasNext);
      setError(null);
      setIsLoading(false);
      setCurrentPage(page);
    } else if (page > currentPage && nextCursor) {
      void fetchWarehouses(nextCursor, page);
    } else if (page in pageCursors.current) {
      void fetchWarehouses(pageCursors.current[page], page);
    }
  };

  const closeDetails = () => {
    setDetailId(null);
    detailTrigger.current?.focus();
  };

  const toggleDetails = (id: string, trigger: HTMLButtonElement) => {
    if (detailId === id) {
      closeDetails();
      return;
    }
    detailTrigger.current = trigger;
    setDetailId(id);
  };

  const refreshWarehouses = () => {
    cache.current = {};
    void fetchWarehouses(pageCursors.current[currentPage], currentPage, true);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--sc-bg-primary)]">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actionsClassName="shrink-0"
        actions={
          canManage &&
          (headerAction ?? (
            <Button variant="primary" onClick={() => setAddModalOpen(true)}>
              <Plus size={16} />
              {t('addWarehouse')}
            </Button>
          ))
        }
      />

      <div className="flex flex-col gap-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-md">
            <Input
              type="text"
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchLabel')}
              leftIcon={<Search size={18} aria-hidden="true" />}
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
          </div>
          <div className="w-full shrink-0 sm:w-60">
            <div className="flex items-center gap-2">
              <Filter
                size={16}
                aria-hidden="true"
                className="shrink-0 text-[var(--sc-text-secondary)]"
              />
              <Select
                aria-label={t('statusFilter')}
                placeholder={t('allStatuses')}
                isPlaceholderDisabled={false}
                value={filters.status}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, status: e.target.value as WarehouseStatus | '' }))
                }
                options={[
                  { label: t('active'), value: 'ACTIVE' },
                  { label: t('inactive'), value: 'INACTIVE' },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <Alert variant="error" title={t('loadError')}>
          <p>{error}</p>
          <Button variant="outline" onClick={() => void fetchWarehouses(undefined, 1)}>
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
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 overflow-auto rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] shadow-sm">
            <table aria-label={t('tableLabel')} className="w-full table-fixed text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--sc-bg-elevated)] text-[13px] font-medium text-[var(--sc-text-secondary)] shadow-[0_1px_0_var(--sc-border-default)]">
                <tr>
                  <th className="hidden w-36 px-4 py-3.5 sm:table-cell">{t('columnCode')}</th>
                  <th className="px-4 py-3.5">{t('columnName')}</th>
                  <th className="hidden px-4 py-3.5 lg:table-cell">{t('columnAddress')}</th>
                  <th className="hidden w-40 px-4 py-3.5 xl:table-cell">{t('columnCapacity')}</th>
                  <th className="hidden w-36 px-4 py-3.5 md:table-cell">{t('columnStatus')}</th>
                  <th className="w-36 px-4 py-3.5 text-right sm:w-48">{t('columnActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sc-border-default)]">
                {warehouses.map((warehouse) => {
                  const isExpanded = detailId === warehouse.id;
                  const detailsId = `warehouse-details-${warehouse.id}`;
                  return (
                    <Fragment key={warehouse.id}>
                      <tr
                        className={
                          isExpanded
                            ? 'bg-[var(--sc-primary-alpha-08)]'
                            : 'transition-colors hover:bg-[var(--sc-bg-secondary)]'
                        }
                      >
                        <td className="hidden px-4 py-3.5 font-medium text-[var(--sc-text-primary)] sm:table-cell">
                          {warehouse.code}
                        </td>
                        <td className="px-4 py-3.5 text-[var(--sc-text-primary)]">
                          <Button
                            variant="ghost"
                            type="button"
                            aria-expanded={isExpanded}
                            aria-controls={detailsId}
                            onClick={(event) => toggleDetails(warehouse.id, event.currentTarget)}
                            className="h-auto justify-start whitespace-normal p-0 text-left text-[var(--sc-primary-dark)] hover:translate-y-0 hover:bg-transparent hover:underline"
                          >
                            {warehouse.name}
                          </Button>
                          <p className="mt-1 text-xs text-[var(--sc-text-secondary)] sm:hidden">
                            {warehouse.code}
                          </p>
                          <span className="mt-2 inline-block md:hidden">
                            <Badge
                              status={warehouse.status === 'ACTIVE' ? 'success' : 'neutral'}
                              label={t(warehouse.status === 'ACTIVE' ? 'active' : 'inactive')}
                            />
                          </span>
                        </td>
                        <td className="hidden px-4 py-3.5 lg:table-cell">
                          <div className="flex items-center gap-1.5 text-[var(--sc-text-secondary)]">
                            <MapPin size={14} className="shrink-0" />
                            <span className="truncate" title={warehouse.address}>
                              {warehouse.address}
                            </span>
                          </div>
                        </td>
                        <td className="hidden px-4 py-3.5 text-[var(--sc-text-primary)] xl:table-cell">
                          {warehouse.dailyCapacity.toLocaleString(locale)}
                        </td>
                        <td className="hidden px-4 py-3.5 md:table-cell">
                          <Badge
                            status={warehouse.status === 'ACTIVE' ? 'success' : 'neutral'}
                            label={t(warehouse.status === 'ACTIVE' ? 'active' : 'inactive')}
                            size="md"
                          />
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              aria-label={t(isExpanded ? 'collapseWarehouse' : 'viewDetails', {
                                code: warehouse.code,
                              })}
                              aria-expanded={isExpanded}
                              aria-controls={detailsId}
                              onClick={(event) => toggleDetails(warehouse.id, event.currentTarget)}
                            >
                              {t(isExpanded ? 'collapseDetails' : 'viewDetailsAction')}
                              {isExpanded ? (
                                <ChevronUp size={14} aria-hidden="true" />
                              ) : (
                                <ChevronDown size={14} aria-hidden="true" />
                              )}
                            </Button>
                            {canManage && (
                              <Button
                                variant="ghost"
                                type="button"
                                aria-label={t('changeStatus', { code: warehouse.code })}
                                onClick={() => setSelectedWarehouse(warehouse)}
                                className="h-8 w-8 shrink-0 p-0 text-[var(--sc-text-secondary)] hover:bg-[var(--sc-bg-secondary)] hover:text-[var(--sc-text-primary)]"
                              >
                                {warehouse.status === 'ACTIVE' ? (
                                  <ToggleRight size={17} aria-hidden="true" className="shrink-0" />
                                ) : (
                                  <ToggleLeft size={17} aria-hidden="true" className="shrink-0" />
                                )}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={visibleColumnCount} className="p-0">
                            <WarehouseDetails
                              key={`${warehouse.id}-${principal?.userId}-${principal?.actorScope}-${principal?.tenantId}-${principal?.roles.join(',')}`}
                              id={detailsId}
                              warehouse={warehouse}
                              onClose={closeDetails}
                              onEdit={() => setEditingWarehouse(warehouse)}
                              onSaved={refreshWarehouses}
                            />
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
              refreshWarehouses();
            }}
          />

          {canManage && selectedWarehouse && (
            <WarehouseStatusModal
              warehouse={selectedWarehouse}
              onClose={() => setSelectedWarehouse(null)}
              onSaved={() => {
                setSelectedWarehouse(null);
                refreshWarehouses();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
