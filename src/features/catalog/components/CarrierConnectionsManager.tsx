import { useState } from 'react';

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  Layers,
  Plus,
  RefreshCw,
  Truck,
  XCircle,
} from 'lucide-react';

import { Alert, Button, Card } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';

import { useCarrierCredentials } from '../hooks/useCarrierCredentials';
import type {
  CarrierCredential,
  DeploymentEnvironment,
} from '../types/carrierCredential.types';
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
  const [editingCredential, setEditingCredential] =
    useState<CarrierCredential | null>(null);
  const [deletingCredential, setDeletingCredential] =
    useState<CarrierCredential | null>(null);

  // Thống kê nhanh trạng thái kết nối
  const totalCount = credentials.length;
  const connectedCount = credentials.filter(
    (c) => c.status === 'CONNECTED',
  ).length;
  const unverifiedCount = credentials.filter(
    (c) => c.status === 'UNVERIFIED',
  ).length;
  const failedCount = credentials.filter((c) => c.status === 'FAILED').length;

  // Đếm theo bộ lọc môi trường
  const prodCount = credentials.filter((c) => c.environment === 'PRODUCTION').length;
  const sandboxCount = credentials.filter((c) => c.environment === 'SANDBOX').length;

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
      {/* Header & Thao tác thêm mới */}
      <div className="rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-[var(--sc-primary)] border border-teal-100">
                <Truck size={20} />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-[var(--sc-text-primary)]">
                Kết nối Hãng Vận Chuyển
              </h2>
            </div>
            <p className="text-sm text-[var(--sc-text-secondary)] leading-relaxed max-w-2xl">
              Cấu hình thông tin xác thực API (Token, Secret) của các đơn vị 3PL (GHN, GHTK, Viettel Post...) 
              để tự động hóa quá trình tính cước, phân phối đơn hàng và theo dõi hành trình giao nhận.
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
                className="h-10 px-3 hover:border-[var(--sc-primary)] hover:text-[var(--sc-primary)]"
              >
                <RefreshCw
                  size={15}
                  className={isLoading ? 'animate-spin' : ''}
                />
              </Button>
              <Button
                type="button"
                onClick={handleOpenCreate}
                className="h-10 gap-2 px-4 shadow-sm bg-[var(--sc-primary)] hover:bg-[var(--sc-primary-hover)] font-medium"
              >
                <Plus size={16} />
                <span>Thêm kết nối mới</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Thẻ chỉ số tổng quan (Stat Cards) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Tổng kết nối */}
        <div className="group rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--sc-text-secondary)]">
              Tổng kết nối
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Layers size={16} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-2xl font-bold tracking-tight text-[var(--sc-text-primary)]">
              {totalCount}
            </p>
            <span className="text-[11px] text-[var(--sc-text-tertiary)]">cấu hình</span>
          </div>
        </div>

        {/* Đã kết nối */}
        <div className="group rounded-2xl border border-emerald-100 bg-emerald-50/30 p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800">
              Đã kết nối (Sẵn sàng)
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-2xl font-bold tracking-tight text-emerald-600">
              {connectedCount}
            </p>
            <span className="text-[11px] font-medium text-emerald-700">
              {totalCount > 0 ? `${Math.round((connectedCount / totalCount) * 100)}%` : '0%'}
            </span>
          </div>
        </div>

        {/* Chưa kiểm tra */}
        <div className="group rounded-2xl border border-amber-100 bg-amber-50/30 p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800">
              Chưa kiểm tra
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <Clock size={16} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-2xl font-bold tracking-tight text-amber-600">
              {unverifiedCount}
            </p>
            <span className="text-[11px] text-amber-700">cần kiểm tra</span>
          </div>
        </div>

        {/* Lỗi kết nối */}
        <div className="group rounded-2xl border border-red-100 bg-red-50/30 p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-800">
              Lỗi kết nối
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600">
              <XCircle size={16} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-2xl font-bold tracking-tight text-red-600">
              {failedCount}
            </p>
            <span className="text-[11px] text-red-700">cần kiểm tra</span>
          </div>
        </div>
      </div>

      {/* Bộ lọc Môi trường & Trạng thái */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-3.5 shadow-xs">
        {/* Lọc Môi trường */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="flex items-center gap-1.5 font-medium text-[var(--sc-text-secondary)] mr-1">
            <Filter size={13} className="text-[var(--sc-text-tertiary)]" /> Môi trường:
          </span>
          {(
            [
              { id: 'ALL', label: 'Tất cả', count: totalCount },
              { id: 'PRODUCTION', label: 'PRODUCTION', count: prodCount },
              { id: 'SANDBOX', label: 'SANDBOX', count: sandboxCount },
            ] as const
          ).map((tab) => {
            const isSelected =
              tab.id === 'ALL'
                ? !filters.environment
                : filters.environment === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    environment:
                      tab.id === 'ALL'
                        ? undefined
                        : (tab.id as DeploymentEnvironment),
                  }))
                }
                className={`cursor-pointer inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-[var(--sc-primary)] text-white shadow-xs'
                    : 'bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)] hover:bg-slate-200/80 hover:text-[var(--sc-text-primary)]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-[var(--sc-bg-surface)] text-[var(--sc-text-secondary)]'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Lọc Trạng thái */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium text-[var(--sc-text-secondary)] mr-1">
            Trạng thái:
          </span>
          {(
            [
              { id: 'ALL', label: 'Tất cả' },
              { id: 'CONNECTED', label: 'Đã kết nối' },
              { id: 'UNVERIFIED', label: 'Chưa kiểm tra' },
              { id: 'FAILED', label: 'Lỗi' },
            ] as const
          ).map((tab) => {
            const isSelected =
              tab.id === 'ALL' ? !filters.status : filters.status === tab.id;
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
                className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-[var(--sc-primary)] text-white shadow-xs'
                    : 'bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)] hover:bg-slate-200/80 hover:text-[var(--sc-text-primary)]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lỗi tải dữ liệu */}
      {error && (
        <Alert variant="error" title="Không thể tải danh sách kết nối hãng">
          {error.message}
        </Alert>
      )}

      {/* Danh sách Card / Loading / Empty state */}
      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="h-64 animate-pulse rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-5"
            />
          ))}
        </div>
      ) : credentials.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-12 text-center shadow-xs">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-[var(--sc-primary)] border border-teal-100">
            <Truck size={30} />
          </div>
          <h3 className="mt-4 text-base font-semibold text-[var(--sc-text-primary)]">
            Chưa có kết nối hãng vận chuyển nào
          </h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--sc-text-secondary)] leading-relaxed">
            Thêm API Key từ Giao Hàng Nhanh (GHN), Giao Hàng Tiết Kiệm (GHTK) hoặc Viettel Post
            để kích hoạt tự động tính cước và đồng bộ vận đơn.
          </p>
          {canManage && (
            <div className="mt-6">
              <Button
                type="button"
                onClick={handleOpenCreate}
                className="gap-2 bg-[var(--sc-primary)] hover:bg-[var(--sc-primary-hover)] px-5 shadow-xs"
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
