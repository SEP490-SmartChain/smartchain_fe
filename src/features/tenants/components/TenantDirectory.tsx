import { useState } from 'react';

import {
  Check,
  Copy,
  Download,
  Eye,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import { Input } from '@/components/Common/Input/Input';

import { PlatformDashboardOverview } from './PlatformDashboardOverview';
import { TenantDetailModal } from './TenantDetailModal';
import { TenantStatusModal } from './TenantStatusModal';
import { useTenantManagement } from '../hooks/useTenantManagement';
import type { TenantStatus, TenantSummary } from '../types/tenant.types';

export function TenantDirectory() {
  const t = useTranslations('AdminTenants');
  const {
    query,
    setQuery,
    tenants,
    overview,
    selectedTenant,
    setSelectedTenant,
    selectTenant,
    updateStatus,
    isLoading,
    isUpdatingStatus,
    error,
    refetch,
  } = useTenantManagement();

  const [searchInput, setSearchInput] = useState(query.search || '');
  const [selectedPlan, setSelectedPlan] = useState<string>('ALL');
  const [statusModalTenant, setStatusModalTenant] = useState<TenantSummary | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery((prev) => ({ ...prev, search: searchInput }));
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setQuery((prev) => ({ ...prev, search: '' }));
  };

  const handleStatusFilter = (status: TenantStatus | '') => {
    setQuery((prev) => ({ ...prev, status }));
  };

  const copyToClipboard = (text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedSlug(text);
    toast.success(`Đã sao chép mã: ${text}`);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const handleExportCSV = () => {
    if (tenants.length === 0) {
      toast.error('Không có dữ liệu để xuất');
      return;
    }
    const headers = [
      'ID',
      'Tên Workspace',
      'Slug',
      'Email Admin',
      'Gói cước',
      'Trạng thái',
      'Hạn mức đã dùng',
      'Tổng hạn mức',
      'Ngày tạo',
    ];
    const rows = tenants.map((tn) => [
      tn.id,
      `"${tn.name.replace(/"/g, '""')}"`,
      tn.slug,
      tn.adminEmail || '',
      tn.subscription?.planCode || 'STANDARD',
      tn.status,
      tn.quota.ordersUsed,
      tn.quota.ordersTotal,
      new Date(tn.createdAt).toLocaleDateString('vi-VN'),
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `smartchain-tenants-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Đã tải xuống danh sách khách thuê (CSV)');
  };

  const displayedTenants = tenants.filter((tn) => {
    if (selectedPlan === 'ALL') return true;
    return (tn.subscription?.planCode || 'STANDARD') === selectedPlan;
  });

  const totalCount = overview?.tenants.total ?? tenants.length;
  const activeCount =
    overview?.tenants.active ?? tenants.filter((t) => t.status === 'ACTIVE').length;
  const suspendedCount =
    overview?.tenants.suspended ?? tenants.filter((t) => t.status === 'SUSPENDED').length;

  const columns: ColumnDef<TenantSummary>[] = [
    {
      key: 'name',
      label: t('col_workspace'),
      render: (tenant) => (
        <div className="flex items-center gap-3 py-1">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--sc-primary-lighter)] text-xs font-semibold text-[var(--sc-primary-dark)]">
            {tenant.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 max-w-[240px]">
            <div
              className="truncate text-sm font-semibold text-[var(--sc-text-primary)]"
              title={tenant.name}
            >
              {tenant.name}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => copyToClipboard(tenant.slug, e)}
                title={`Sao chép mã: ${tenant.slug}`}
                className="inline-flex max-w-[190px] items-center gap-1 rounded-md border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--sc-text-secondary)] transition-colors hover:border-[var(--sc-primary)] hover:text-[var(--sc-primary)]"
              >
                <span className="truncate">{tenant.slug}</span>
                <span className="shrink-0">
                  {copiedSlug === tenant.slug ? (
                    <Check size={11} className="text-[var(--sc-success)]" />
                  ) : (
                    <Copy size={11} className="opacity-50" />
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'adminEmail',
      label: t('col_admin_email'),
      render: (tenant) => (
        <span className="truncate text-xs text-[var(--sc-text-secondary)]" title={tenant.adminEmail || ''}>
          {tenant.adminEmail || '—'}
        </span>
      ),
    },
    {
      key: 'subscription',
      label: t('col_subscription'),
      render: (tenant) => {
        const plan = tenant.subscription?.planCode || 'STANDARD';
        const status = plan === 'ENTERPRISE' ? 'info' : plan === 'PRO' ? 'success' : 'default';
        return <Badge status={status} label={plan} />;
      },
    },
    {
      key: 'quota',
      label: t('col_order_quota'),
      render: (tenant) => {
        const total = tenant.quota?.ordersTotal ?? 0;
        const used = tenant.quota?.ordersUsed ?? 0;

        if (!total || total === 0) {
          return (
            <span className="text-xs font-medium text-[var(--sc-text-tertiary)]">
              Chưa thiết lập
            </span>
          );
        }

        const percent = Math.min(Math.round((used / total) * 100), 100);
        const isCritical = percent >= 90;
        return (
          <div className="w-36 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-[var(--sc-text-secondary)]">
              <span>
                <strong>{used.toLocaleString()}</strong> / {total.toLocaleString()}
              </span>
              <span className={isCritical ? 'font-medium text-[var(--sc-error-dark)]' : 'font-medium text-[var(--sc-text-primary)]'}>
                {percent}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--sc-bg-muted)]">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isCritical ? 'bg-[var(--sc-error)]' : 'bg-[var(--sc-primary)]'
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'status',
      label: t('col_status'),
      render: (tenant) => (
        <Badge
          status={tenant.status === 'ACTIVE' ? 'success' : 'error'}
          label={tenant.status === 'ACTIVE' ? t('status_active') : t('status_suspended')}
        />
      ),
    },
    {
      key: 'createdAt',
      label: t('col_created_at'),
      render: (tenant) => (
        <span className="whitespace-nowrap text-xs text-[var(--sc-text-secondary)]">
          {new Date(tenant.createdAt).toLocaleDateString('vi-VN')}
        </span>
      ),
    },
    {
      key: 'actions',
      label: t('col_actions'),
      render: (tenant) => (
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => selectTenant(tenant.slug)}
            title={t('view_detail')}
          >
            <Eye size={13} className="mr-1 text-[var(--sc-primary)]" />
            {t('detail')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={
              tenant.status === 'ACTIVE'
                ? 'border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30'
                : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300 dark:border-emerald-900/40 dark:text-emerald-400 dark:hover:bg-emerald-950/30'
            }
            onClick={() => setStatusModalTenant(tenant)}
          >
            {tenant.status === 'ACTIVE' ? (
              <>
                <ShieldAlert size={13} className="mr-1" />
                {t('suspend')}
              </>
            ) : (
              <>
                <ShieldCheck size={13} className="mr-1" />
                {t('activate')}
              </>
            )}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header section with Clean SaaSable Pro typography */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="m-0 text-2xl font-normal leading-7 text-[var(--sc-text-primary)]">
            {t('page_title')}
          </h1>
          <p className="mb-0 mt-1 text-xs leading-4 text-[var(--sc-text-tertiary)]">
            {t('page_description')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download size={14} className="mr-1.5" />
            Xuất CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            isLoading={isLoading}
          >
            <RefreshCw size={14} className={`mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            {t('refresh')}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="error" title="Lỗi tải dữ liệu">
          {error.message}
        </Alert>
      )}

      {/* 4 Connected Metric Cards */}
      <PlatformDashboardOverview
        overview={overview}
        isLoading={isLoading}
        onSelectTenant={selectTenant}
      />

      {/* Toolbar: Search and Filter Tabs */}
      <Card className="p-4">
        <div className="flex flex-col gap-3.5 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 lg:max-w-md">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('search_placeholder')}
              className="pl-9 pr-8 text-sm"
            />
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full p-1 text-[var(--sc-text-tertiary)] hover:text-[var(--sc-text-primary)]"
              >
                <X size={14} />
              </button>
            )}
          </form>

          <div className="flex flex-wrap items-center gap-2">
            {/* Subscription Plan Filter */}
            <div className="flex items-center rounded-xl bg-[var(--sc-bg-secondary)] p-1 text-xs">
              {(['ALL', 'ENTERPRISE', 'PRO', 'STANDARD'] as const).map((plan) => (
                <button
                  key={plan}
                  type="button"
                  onClick={() => setSelectedPlan(plan)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    selectedPlan === plan
                      ? 'bg-[var(--sc-bg-surface)] text-[var(--sc-text-primary)] shadow-[var(--sc-shadow-button)]'
                      : 'text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]'
                  }`}
                >
                  {plan === 'ALL' ? 'Tất cả gói' : plan}
                </button>
              ))}
            </div>

            {/* Status Filter */}
            <div className="flex items-center rounded-xl bg-[var(--sc-bg-secondary)] p-1 text-xs">
              <button
                type="button"
                onClick={() => handleStatusFilter('')}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                  !query.status
                    ? 'bg-[var(--sc-bg-surface)] text-[var(--sc-text-primary)] shadow-[var(--sc-shadow-button)]'
                    : 'text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]'
                }`}
              >
                {t('filter_all')} ({totalCount})
              </button>
              <button
                type="button"
                onClick={() => handleStatusFilter('ACTIVE')}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                  query.status === 'ACTIVE'
                    ? 'bg-[var(--sc-bg-surface)] text-[var(--sc-success-dark)] shadow-[var(--sc-shadow-button)]'
                    : 'text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]'
                }`}
              >
                {t('status_active')} ({activeCount})
              </button>
              <button
                type="button"
                onClick={() => handleStatusFilter('SUSPENDED')}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                  query.status === 'SUSPENDED'
                    ? 'bg-[var(--sc-bg-surface)] text-[var(--sc-error-dark)] shadow-[var(--sc-shadow-button)]'
                    : 'text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]'
                }`}
              >
                {t('status_suspended')} ({suspendedCount})
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Tenant Data Table Card */}
      <Card className="overflow-hidden">
        {displayedTenants.length === 0 && !isLoading ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-[var(--sc-text-primary)]">
              Không tìm thấy khách thuê phù hợp
            </p>
            <p className="mt-1 text-xs text-[var(--sc-text-tertiary)]">
              Hãy thử tìm kiếm với từ khóa khác hoặc bỏ các bộ lọc đang chọn.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                handleClearSearch();
                setSelectedPlan('ALL');
                handleStatusFilter('');
              }}
              className="mt-4"
            >
              Đặt lại bộ lọc
            </Button>
          </div>
        ) : (
          <DataTable
            ariaLabel={t('page_title')}
            columns={columns}
            data={displayedTenants}
            isLoading={isLoading}
          />
        )}
      </Card>

      {/* Tenant Detail Modal */}
      <TenantDetailModal
        isOpen={Boolean(selectedTenant)}
        onClose={() => setSelectedTenant(null)}
        tenant={selectedTenant}
        onToggleStatusClick={() => {
          if (selectedTenant) {
            setStatusModalTenant(selectedTenant);
          }
        }}
      />

      {/* Status Change Confirmation Modal */}
      <TenantStatusModal
        isOpen={Boolean(statusModalTenant)}
        onClose={() => setStatusModalTenant(null)}
        tenant={statusModalTenant}
        onConfirm={updateStatus}
        isSubmitting={isUpdatingStatus}
      />
    </div>
  );
}
