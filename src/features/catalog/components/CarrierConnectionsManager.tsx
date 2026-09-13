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

import { Alert, Button, Card, CardHeader } from '@/components/Common';
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
      <Card>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 className="text-lg font-semibold text-[var(--sc-text-primary)]">
              Kết nối Hãng Vận Chuyển (3PL Carrier Integrations)
            </h2>
            <p className="mt-1 text-sm text-[var(--sc-text-secondary)]">
              Cấu hình thông tin xác thực API (Token, Secret) của GHTK, GHN,
              Viettel Post, J&T để kích hoạt tính năng tính cước tự động, điều
              phối vận đơn và theo dõi hành trình.
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
              >
                <RefreshCw
                  size={15}
                  className={isLoading ? 'animate-spin' : ''}
                />
              </Button>
              <Button type="button" onClick={handleOpenCreate} className="gap-2">
                <Plus size={16} />
                <span>Thêm kết nối mới</span>
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Thẻ chỉ số tổng quan (Stat Cards) */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--sc-text-secondary)]">
              Tổng kết nối
            </span>
            <Layers size={16} className="text-[var(--sc-primary)]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--sc-text-primary)]">
            {totalCount}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--sc-text-secondary)]">
              Đã kết nối (Sẵn sàng)
            </span>
            <CheckCircle2 size={16} className="text-[var(--sc-success)]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--sc-success)]">
            {connectedCount}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--sc-text-secondary)]">
              Chưa kiểm tra
            </span>
            <Clock size={16} className="text-[var(--sc-warning,#d97706)]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--sc-warning,#d97706)]">
            {unverifiedCount}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--sc-text-secondary)]">
              Lỗi kết nối
            </span>
            <XCircle size={16} className="text-[var(--sc-error)]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--sc-error)]">
            {failedCount}
          </p>
        </div>
      </div>

      {/* Bộ lọc Môi trường & Trạng thái */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1 font-medium text-[var(--sc-text-secondary)] mr-1">
            <Filter size={13} /> Môi trường:
          </span>
          {(['ALL', 'SANDBOX', 'PRODUCTION'] as const).map((env) => {
            const isSelected =
              env === 'ALL'
                ? !filters.environment
                : filters.environment === env;
            return (
              <button
                key={env}
                type="button"
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    environment:
                      env === 'ALL'
                        ? undefined
                        : (env as DeploymentEnvironment),
                  }))
                }
                className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  isSelected
                    ? 'bg-[var(--sc-primary)] text-white shadow-xs'
                    : 'bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)] hover:bg-[var(--sc-bg-tertiary,#e2e8f0)]'
                }`}
              >
                {env === 'ALL' ? 'Tất cả' : env}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-[var(--sc-text-secondary)] mr-1">
            Trạng thái:
          </span>
          {(['ALL', 'CONNECTED', 'UNVERIFIED', 'FAILED'] as const).map((st) => {
            const isSelected =
              st === 'ALL' ? !filters.status : filters.status === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    status: st === 'ALL' ? undefined : st,
                  }))
                }
                className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  isSelected
                    ? 'bg-[var(--sc-primary)] text-white shadow-xs'
                    : 'bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)] hover:bg-[var(--sc-bg-tertiary,#e2e8f0)]'
                }`}
              >
                {st === 'ALL'
                  ? 'Tất cả'
                  : st === 'CONNECTED'
                    ? 'Đã kết nối'
                    : st === 'UNVERIFIED'
                      ? 'Chưa kiểm tra'
                      : 'Lỗi'}
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="h-64 animate-pulse rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-5"
            />
          ))}
        </div>
      ) : credentials.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]">
            <Truck size={32} className="text-[var(--sc-text-secondary)]" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-[var(--sc-text-primary)]">
            Chưa có cấu hình hãng vận chuyển nào
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--sc-text-secondary)]">
            Thêm API Key từ Giao Hàng Tiết Kiệm (GHTK), Giao Hàng Nhanh (GHN),
            Viettel Post để bắt đầu tính cước và tạo vận đơn tự động.
          </p>
          {canManage && (
            <div className="mt-6">
              <Button type="button" onClick={handleOpenCreate} className="gap-2">
                <Plus size={16} />
                <span>Thêm kết nối đầu tiên</span>
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* Modal Xác nhận Gỡ kết nối (Soft Delete) */}
      <CarrierDeleteModal
        isOpen={Boolean(deletingCredential)}
        onClose={() => setDeletingCredential(null)}
        credential={deletingCredential}
        onDelete={deleteCredential}
      />
    </div>
  );
}
