import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Filter,
  Layers,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Truck,
  XCircle,
} from 'lucide-react';

import { Alert, Button } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';

import { useCarrierCredentials } from '../hooks/useCarrierCredentials';
import type { CarrierCredential, DeploymentEnvironment } from '../types/carrierCredential.types';
import { CarrierCredentialCard } from './CarrierCredentialCard';
import { CarrierCredentialModal } from './CarrierCredentialModal';
import { CarrierDeleteModal } from './CarrierDeleteModal';

export function CarrierConnectionsManager() {
  const { can } = useAccess();
  const canManage = can('carriers.credentials.manage');

  const {
    credentials,
    availableCarriers,
    isLoading,
    error,
    filters,
    setFilters,
    pingingId,
    pingResults,
    reload,
    createCredential,
    updateCredential,
    deleteCredential,
    testPing,
  } = useCarrierCredentials();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCredential, setEditingCredential] = useState<CarrierCredential | null>(null);
  const [deletingCredential, setDeletingCredential] = useState<CarrierCredential | null>(null);

  // Thống kê nhanh trạng thái kết nối
  const totalCount = credentials.length;
  const connectedCount = credentials.filter((c) => c.status === 'CONNECTED').length;
  const unverifiedCount = credentials.filter((c) => c.status === 'UNVERIFIED').length;
  const failedCount = credentials.filter((c) => c.status === 'FAILED').length;

  // Đếm theo bộ lọc môi trường
  const prodCount = credentials.filter((c) => c.environment === 'PRODUCTION').length;
  const sandboxCount = credentials.filter((c) => c.environment === 'SANDBOX').length;

  const connectedPercent = totalCount > 0 ? Math.round((connectedCount / totalCount) * 100) : 0;

  const handleOpenCreate = () => {
    setEditingCredential(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cred: CarrierCredential) => {
    setEditingCredential(cred);
    setIsModalOpen(true);
  };

  const handleOpenDelete = (cred: CarrierCredential) => {
    setDeletingCredential(cred);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Thao tác chính */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-6 shadow-xs">
        {/* Subtle decorative glow */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-teal-500/5 blur-3xl" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-[var(--sc-primary)] ring-1 ring-teal-200/60 shadow-2xs">
                <Truck size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-[var(--sc-text-primary)]">
                  Kết nối Hãng Vận Chuyển
                </h2>
                <p className="text-xs text-[var(--sc-text-tertiary)]">
                  Cấu hình API Key & điều phối đối tác vận tải 3PL
                </p>
              </div>
            </div>
            <p className="text-sm text-[var(--sc-text-secondary)] leading-relaxed max-w-2xl pt-1">
              Quản lý thông tin xác thực API của các hãng giao vận (GHN, GHTK, Viettel Post...). Hệ
              thống sử dụng các khóa này để tự động tính phí vận chuyển, phân loại đơn và theo dõi
              hành trình giao nhận.
            </p>
          </div>

          {canManage && (
            <div className="flex shrink-0 items-center gap-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={reload}
                disabled={isLoading}
                title="Tải lại danh sách"
                aria-label="Tải lại danh sách"
                className="h-10 px-3.5 rounded-xl hover:border-[var(--sc-primary)] hover:text-[var(--sc-primary)]"
              >
                <RefreshCw
                  size={15}
                  className={isLoading ? 'animate-spin text-[var(--sc-primary)]' : ''}
                />
              </Button>
              <Button
                type="button"
                onClick={handleOpenCreate}
                className="h-10 gap-2 px-4 rounded-xl shadow-xs bg-[var(--sc-primary)] hover:bg-[var(--sc-primary-hover)] font-semibold active:scale-[0.98] transition-all"
              >
                <Plus size={16} />
                <span>Thêm kết nối mới</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Thẻ chỉ số tổng quan (Stat Overview Cards - Linear / Studio Tier) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Tổng kết nối */}
        <div className="group relative overflow-hidden rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Tổng kết nối</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 ring-1 ring-slate-200/60">
              <Layers size={14} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-3xl font-extrabold tracking-tight text-slate-900">{totalCount}</p>
            <span className="text-xs text-slate-500 font-medium">cấu hình</span>
          </div>
          {/* Thanh tỷ lệ sẵn sàng */}
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${connectedPercent}%` }}
            />
          </div>
        </div>

        {/* Đã kết nối */}
        <div className="group relative overflow-hidden rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/40 to-transparent p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Đã kết nối
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-700 ring-1 ring-emerald-300/60">
              <CheckCircle2 size={14} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-3xl font-extrabold tracking-tight text-emerald-700">
              {connectedCount}
            </p>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-200">
              {connectedPercent}% sẵn sàng
            </span>
          </div>
          <p className="mt-3 text-[11px] text-emerald-700/80 font-medium">
            Sẵn sàng định tuyến & tính cước
          </p>
        </div>

        {/* Chưa kiểm tra */}
        <div className="group relative overflow-hidden rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/40 to-transparent p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Chưa kiểm tra
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100/80 text-amber-700 ring-1 ring-amber-300/60">
              <Clock size={14} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-3xl font-extrabold tracking-tight text-amber-700">
              {unverifiedCount}
            </p>
            <span className="text-xs text-amber-700 font-medium">cần ping test</span>
          </div>
          <p className="mt-3 text-[11px] text-amber-700/80 font-medium">Cần bấm kiểm tra kết nối</p>
        </div>

        {/* Lỗi kết nối */}
        <div className="group relative overflow-hidden rounded-2xl border border-red-200/70 bg-gradient-to-br from-red-50/40 to-transparent p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-800 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              Lỗi kết nối
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100/80 text-red-700 ring-1 ring-red-300/60">
              <XCircle size={14} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-3xl font-extrabold tracking-tight text-red-600">{failedCount}</p>
            <span className="text-xs text-red-600 font-medium">cần khắc phục</span>
          </div>
          <p className="mt-3 text-[11px] text-red-700/80 font-medium">
            Token hết hạn hoặc sai Shop ID
          </p>
        </div>
      </div>

      {/* 3. Thanh Bộ Lọc Kép (Dual Segmented Control Filter Bar) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-3 shadow-xs">
        {/* Lọc Môi trường */}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs font-semibold text-slate-500 pl-1">
            <Filter size={13} /> Môi trường:
          </span>
          <div className="flex items-center rounded-xl bg-slate-100/90 p-1 ring-1 ring-slate-200/60">
            {(
              [
                { id: 'ALL', label: 'Tất cả', count: totalCount },
                { id: 'PRODUCTION', label: 'PRODUCTION', count: prodCount },
                { id: 'SANDBOX', label: 'SANDBOX', count: sandboxCount },
              ] as const
            ).map((tab) => {
              const isSelected =
                tab.id === 'ALL' ? !filters.environment : filters.environment === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      environment: tab.id === 'ALL' ? undefined : (tab.id as DeploymentEnvironment),
                    }))
                  }
                  className={`cursor-pointer flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-white text-[var(--sc-primary)] shadow-xs ring-1 ring-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                      isSelected
                        ? 'bg-teal-50 text-[var(--sc-primary)] font-bold'
                        : 'bg-slate-200/70 text-slate-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Lọc Trạng thái */}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs font-semibold text-slate-500 pl-1">
            <SlidersHorizontal size={13} /> Trạng thái:
          </span>
          <div className="flex items-center rounded-xl bg-slate-100/90 p-1 ring-1 ring-slate-200/60">
            {(
              [
                { id: 'ALL', label: 'Tất cả' },
                { id: 'CONNECTED', label: 'Đã kết nối' },
                { id: 'UNVERIFIED', label: 'Chưa kiểm tra' },
                { id: 'FAILED', label: 'Lỗi' },
              ] as const
            ).map((tab) => {
              const isSelected = tab.id === 'ALL' ? !filters.status : filters.status === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      status: tab.id === 'ALL' ? undefined : tab.id,
                    }))
                  }
                  className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-white text-[var(--sc-primary)] shadow-xs ring-1 ring-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Lỗi tải dữ liệu */}
      {error && (
        <Alert variant="error" title="Không thể tải danh sách kết nối hãng">
          {error.message}
        </Alert>
      )}

      {/* 4. Danh sách Thẻ Card / Loading / Empty state */}
      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="h-72 animate-pulse rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-5"
            />
          ))}
        </div>
      ) : credentials.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-12 text-center shadow-xs">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-[var(--sc-primary)] ring-1 ring-teal-200/60 shadow-2xs">
            <Truck size={30} />
          </div>
          <h3 className="mt-4 text-base font-bold text-[var(--sc-text-primary)]">
            Chưa có kết nối hãng vận chuyển nào
          </h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--sc-text-secondary)] leading-relaxed">
            Thêm API Token từ Giao Hàng Tiết Kiệm (GHTK), Giao Hàng Nhanh (GHN) hoặc Viettel Post để
            kích hoạt tự động tính phí vận chuyển và đẩy đơn vận tải.
          </p>
          {canManage && (
            <div className="mt-6">
              <Button
                type="button"
                onClick={handleOpenCreate}
                className="gap-2 bg-[var(--sc-primary)] hover:bg-[var(--sc-primary-hover)] px-5 rounded-xl shadow-xs font-semibold"
              >
                <Plus size={16} />
                <span>Thêm kết nối đầu tiên</span>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {credentials.map((cred) => (
            <CarrierCredentialCard
              key={cred.id}
              credential={cred}
              isPinging={pingingId === cred.id}
              lastPingResult={pingResults[cred.id]}
              canManage={canManage}
              onTestPing={testPing}
              onEdit={handleOpenEdit}
              onDelete={handleOpenDelete}
            />
          ))}
        </div>
      )}

      {/* Modal Thêm mới / Chỉnh sửa */}
      <CarrierCredentialModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        editingCredential={editingCredential}
        availableCarriers={availableCarriers}
        onCreate={createCredential}
        onUpdate={updateCredential}
      />

      {/* Modal Xác nhận Gỡ kết nối */}
      <CarrierDeleteModal
        isOpen={Boolean(deletingCredential)}
        onClose={() => setDeletingCredential(null)}
        credential={deletingCredential}
        onDelete={deleteCredential}
      />
    </div>
  );
}
