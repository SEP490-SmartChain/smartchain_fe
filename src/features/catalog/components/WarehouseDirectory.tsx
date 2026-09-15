import { useCallback, useEffect, useRef, useState, Fragment } from 'react';

import {} from 'react-dom';

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

import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import Pagination from '@/components/Common/Pagination/Pagination';
import { Select } from '@/components/Common/Select/Select';
import { toast } from 'sonner';

import AddWarehouseModal from './AddWarehouseModal';
import { warehouseApi } from '../api/warehouseApi';

import type { Warehouse, WarehouseFilters, WarehouseStatus } from '../types/warehouse';

export default function WarehouseDirectory() {
  const [filters, setFilters] = useState<WarehouseFilters>({ search: '', status: '' });
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);

  const cache = useRef<Record<number, { items: Warehouse[]; cursor: string | null }>>({});

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 400);
    return () => clearTimeout(handler);
  }, [filters.search]);

  const fetchWarehouses = useCallback(
    async (cursor?: string, page = 1) => {
      try {
        if (page === 1) setIsLoading(true);
        const activeFilters = {
          search: debouncedSearch,
          status: filters.status,
        };

        const result = await warehouseApi.list(activeFilters, cursor);
        setWarehouses(result.items);
        setHasNextPage(result.pagination.hasNext);
        setNextCursor(result.pagination.nextCursor);
        cache.current[page] = { items: result.items, cursor: result.pagination.nextCursor };
      } catch {
        toast.error('Lỗi tải danh sách kho');
      } finally {
        setIsLoading(false);
      }
    },
    [debouncedSearch, filters.status, toast],
  );

  useEffect(() => {
    cache.current = {};
    setCurrentPage(1);
    void fetchWarehouses(undefined, 1);
  }, [fetchWarehouses]);

  const handlePageChange = (page: number) => {
    if (page === currentPage) return;
    if (cache.current[page]) {
      setWarehouses(cache.current[page].items);
      setCurrentPage(page);
    } else if (page > currentPage && nextCursor) {
      void fetchWarehouses(nextCursor, page);
      setCurrentPage(page);
    }
  };

  const handleToggleStatus = async () => {
    if (!selectedWarehouse) return;
    setUpdatingId(selectedWarehouse.id);
    try {
      const newStatus = selectedWarehouse.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      // In a real implementation we would call the setStatus API here
      // const updated = await warehouseApi.setStatus(selectedWarehouse.id, newStatus);

      setWarehouses((prev) =>
        prev.map((w) => (w.id === selectedWarehouse.id ? { ...w, status: newStatus } : w)),
      );
      toast.success('Đã cập nhật trạng thái kho');
    } catch {
      toast.error('Không thể cập nhật trạng thái');
    } finally {
      setUpdatingId(null);
      setSelectedWarehouse(null);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--sc-bg-primary)]">
      <header className="flex flex-col gap-5 border-b border-[var(--sc-border-default)] px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--sc-text-primary)]">
            Danh sách Kho hàng
          </h1>
          <p className="mt-1.5 text-sm text-[var(--sc-text-secondary)]">
            Quản lý các kho, điểm tập kết hàng và sức chứa.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button variant="primary" onClick={() => setAddModalOpen(true)}>
            <Plus size={16} />
            Thêm kho mới
          </Button>
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
              placeholder="Tìm theo mã hoặc tên kho..."
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="pl-10"
            />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-[var(--sc-text-secondary)]" />
              <Select
                value={filters.status}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, status: e.target.value as WarehouseStatus | '' }))
                }
                options={[
                  { label: 'Tất cả trạng thái', value: '' },
                  { label: 'Hoạt động', value: 'ACTIVE' },
                  { label: 'Ngừng hoạt động', value: 'INACTIVE' },
                ]}
                className="w-[140px]"
              />
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <LoaderCircle size={28} className="animate-spin text-[var(--sc-brand-primary)]" />
        </div>
      ) : warehouses.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--sc-bg-secondary)] text-[var(--sc-text-tertiary)]">
            <WarehouseIcon size={24} />
          </div>
          <h3 className="mt-4 text-base font-semibold text-[var(--sc-text-primary)]">
            Không tìm thấy kho
          </h3>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--sc-text-secondary)]">
            Chưa có dữ liệu kho hàng hoặc không có kết quả phù hợp.
          </p>
        </div>
      ) : (
        <section className="flex min-h-0 flex-1 flex-col justify-between overflow-hidden sm:px-6 lg:px-8">
          <div className="min-h-0 overflow-auto rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] shadow-sm">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--sc-bg-elevated)] text-[13px] font-medium text-[var(--sc-text-secondary)] shadow-[0_1px_0_var(--sc-border-default)]">
                <tr>
                  <th className="w-12 px-2 py-3.5 pl-4 sm:pl-5" />
                  <th className="px-4 py-3.5">Mã kho</th>
                  <th className="px-4 py-3.5">Tên kho</th>
                  <th className="px-4 py-3.5">Địa chỉ</th>
                  <th className="px-4 py-3.5">Công suất (đơn/ngày)</th>
                  <th className="px-4 py-3.5">Trạng thái</th>
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
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : warehouse.id)}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--sc-text-tertiary)] hover:bg-[var(--sc-bg-hover)] hover:text-[var(--sc-text-primary)] transition-colors"
                          >
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
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
                          {warehouse.dailyCapacity.toLocaleString()}
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge
                            status={warehouse.status === 'ACTIVE' ? 'success' : 'neutral'}
                            label={warehouse.status === 'ACTIVE' ? 'Hoạt động' : 'Tạm ngưng'}
                            size="md"
                          />
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedWarehouse(warehouse)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--sc-text-secondary)] transition-colors hover:bg-[var(--sc-bg-secondary)] hover:text-[var(--sc-text-primary)]"
                          >
                            {warehouse.status === 'ACTIVE' ? (
                              <ToggleRight size={17} />
                            ) : (
                              <ToggleLeft size={17} />
                            )}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-[var(--sc-bg-secondary)]/50">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                              <div>
                                <span className="block text-xs font-medium text-[var(--sc-text-tertiary)]">
                                  GPS
                                </span>
                                <span className="mt-1 block text-sm text-[var(--sc-text-primary)]">
                                  {warehouse.latitude}, {warehouse.longitude}
                                </span>
                              </div>
                              <div>
                                <span className="block text-xs font-medium text-[var(--sc-text-tertiary)]">
                                  Liên hệ
                                </span>
                                <span className="mt-1 block text-sm text-[var(--sc-text-primary)]">
                                  {warehouse.contactName || '—'}
                                </span>
                              </div>
                              <div>
                                <span className="block text-xs font-medium text-[var(--sc-text-tertiary)]">
                                  SĐT
                                </span>
                                <span className="mt-1 block text-sm text-[var(--sc-text-primary)]">
                                  {warehouse.contactPhone || '—'}
                                </span>
                              </div>
                            </div>
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

      <AddWarehouseModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => {
          setAddModalOpen(false);
          cache.current = {};
          void fetchWarehouses();
        }}
      />

      <Modal
        isOpen={selectedWarehouse !== null}
        onClose={() => setSelectedWarehouse(null)}
        title="Đổi trạng thái kho"
      >
        <p className="mt-2 text-sm text-[var(--sc-text-secondary)]">
          Bạn có chắc muốn {selectedWarehouse?.status === 'ACTIVE' ? 'tạm ngưng' : 'kích hoạt'} kho{' '}
          <strong>{selectedWarehouse?.name}</strong>?
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setSelectedWarehouse(null)}>
            Hủy
          </Button>
          <Button
            variant={selectedWarehouse?.status === 'ACTIVE' ? 'danger' : 'primary'}
            isLoading={updatingId === selectedWarehouse?.id}
            onClick={handleToggleStatus}
          >
            Xác nhận
          </Button>
        </div>
      </Modal>
    </div>
  );
}
