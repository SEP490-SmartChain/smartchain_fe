import { useState } from 'react';

import {
  CheckCircle2,
  Clock,
  Layers,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Truck,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert, Button } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';

import { CarrierCredentialCard } from './CarrierCredentialCard';
import { CarrierCredentialModal } from './CarrierCredentialModal';
import { CarrierDeleteModal } from './CarrierDeleteModal';
import { useCarrierCredentials } from '../hooks/useCarrierCredentials';

import type { CarrierCredential } from '../types/carrierCredential.types';

export function CarrierConnectionsManager() {
  const t = useTranslations('CarrierCredentials');
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
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-[var(--sc-primary-alpha-08)] blur-3xl" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--sc-primary-lighter)] text-[var(--sc-primary)] ring-1 ring-[var(--sc-primary-alpha-20)] shadow-2xs">
                <Truck size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-[var(--sc-text-primary)]">
                  {t('manager.title')}
                </h2>
                <p className="text-xs text-[var(--sc-text-tertiary)]">{t('manager.subtitle')}</p>
              </div>
            </div>
            <p className="text-sm text-[var(--sc-text-secondary)] leading-relaxed max-w-2xl pt-1">
              {t('manager.description')}
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
                title={t('manager.reload')}
                aria-label={t('manager.reload')}
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
                <span>{t('manager.addNew')}</span>
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
            <span className="text-xs font-semibold text-[var(--sc-text-secondary)]">
              {t('stats.total')}
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)] ring-1 ring-[var(--sc-border-default)]">
              <Layers size={14} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-3xl font-extrabold tracking-tight text-[var(--sc-text-primary)]">
              {totalCount}
            </p>
            <span className="text-xs text-[var(--sc-text-secondary)] font-medium">
              {t('stats.totalUnit')}
            </span>
          </div>
          {/* Thanh tỷ lệ sẵn sàng */}
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--sc-bg-secondary)]">
            <div
              className="h-full rounded-full bg-[var(--sc-success)] transition-all duration-500"
              style={{ width: `${connectedPercent}%` }}
            />
          </div>
        </div>

        {/* Đã kết nối */}
        <div className="group relative overflow-hidden rounded-2xl border border-[var(--sc-success-border)] bg-gradient-to-br from-[var(--sc-success-bg)]/40 to-transparent p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--sc-success-dark)] flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[var(--sc-success)] animate-pulse" />
              {t('stats.connected')}
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--sc-success-bg)] text-[var(--sc-success-dark)] ring-1 ring-[var(--sc-success-border)]">
              <CheckCircle2 size={14} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-3xl font-extrabold tracking-tight text-[var(--sc-success-dark)]">
              {connectedCount}
            </p>
            <span className="text-xs font-bold text-[var(--sc-success-dark)] bg-[var(--sc-success-bg)] px-2 py-0.5 rounded-full border border-[var(--sc-success-border)]">
              {t('stats.readyPercent', { percent: connectedPercent })}
            </span>
          </div>
          <p className="mt-3 text-[11px] text-[var(--sc-success-dark)]/80 font-medium">
            {t('stats.connectedHint')}
          </p>
        </div>

        {/* Chưa kiểm tra */}
        <div className="group relative overflow-hidden rounded-2xl border border-[var(--sc-warning-border)] bg-gradient-to-br from-[var(--sc-warning-bg)]/40 to-transparent p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--sc-warning-dark)] flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[var(--sc-warning)]" />
              {t('stats.unverified')}
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--sc-warning-bg)] text-[var(--sc-warning-dark)] ring-1 ring-[var(--sc-warning-border)]">
              <Clock size={14} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-3xl font-extrabold tracking-tight text-[var(--sc-warning-dark)]">
              {unverifiedCount}
            </p>
            <span className="text-xs text-[var(--sc-warning-dark)] font-medium">
              {t('stats.unverifiedBadge')}
            </span>
          </div>
          <p className="mt-3 text-[11px] text-[var(--sc-warning-dark)]/80 font-medium">
            {t('stats.unverifiedHint')}
          </p>
        </div>

        {/* Lỗi kết nối */}
        <div className="group relative overflow-hidden rounded-2xl border border-[var(--sc-error-border)] bg-gradient-to-br from-[var(--sc-error-bg)]/40 to-transparent p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--sc-error-dark)] flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[var(--sc-error)]" />
              {t('stats.failed')}
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--sc-error-bg)] text-[var(--sc-error-dark)] ring-1 ring-[var(--sc-error-border)]">
              <XCircle size={14} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-3xl font-extrabold tracking-tight text-[var(--sc-error)]">
              {failedCount}
            </p>
            <span className="text-xs text-[var(--sc-error)] font-medium">
              {t('stats.failedBadge')}
            </span>
          </div>
          <p className="mt-3 text-[11px] text-[var(--sc-error-dark)]/80 font-medium">
            {t('stats.failedHint')}
          </p>
        </div>
      </div>

      {/* 3. Thanh Bộ Lọc Kép (Dual Segmented Control Filter Bar) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-3 shadow-xs">
        {/* Lọc Trạng thái */}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs font-semibold text-[var(--sc-text-secondary)] pl-1">
            <SlidersHorizontal size={13} /> {t('filter.status')}
          </span>
          <div className="flex items-center rounded-xl bg-[var(--sc-bg-secondary)] p-1 ring-1 ring-[var(--sc-border-default)]">
            {(
              [
                { id: 'ALL', label: t('filter.all') },
                { id: 'CONNECTED', label: t('filter.connected') },
                { id: 'UNVERIFIED', label: t('filter.unverified') },
                { id: 'FAILED', label: t('filter.failed') },
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
                      ? 'bg-[var(--sc-bg-surface)] text-[var(--sc-primary)] shadow-xs ring-1 ring-[var(--sc-border-default)]'
                      : 'text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]'
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
        <Alert variant="error" title={t('manager.loadError')}>
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
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--sc-primary-lighter)] text-[var(--sc-primary)] ring-1 ring-[var(--sc-primary-alpha-20)] shadow-2xs">
            <Truck size={30} />
          </div>
          <h3 className="mt-4 text-base font-bold text-[var(--sc-text-primary)]">
            {t('manager.emptyTitle')}
          </h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--sc-text-secondary)] leading-relaxed">
            {t('manager.emptyDescription')}
          </p>
          {canManage && (
            <div className="mt-6">
              <Button
                type="button"
                onClick={handleOpenCreate}
                className="gap-2 bg-[var(--sc-primary)] hover:bg-[var(--sc-primary-hover)] px-5 rounded-xl shadow-xs font-semibold"
              >
                <Plus size={16} />
                <span>{t('manager.addFirst')}</span>
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
