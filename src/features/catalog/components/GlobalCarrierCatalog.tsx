import { useState } from 'react';

import {
  Eye,
  LayoutGrid,
  List,
  RefreshCw,
  Search,
  Server,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import { Input } from '@/components/Common/Input/Input';

import { CarrierDetailModal } from './CarrierDetailModal';
import { useCarrierCatalog } from '../hooks/useCarrierCatalog';
import type { CarrierSummary } from '../types/carrierCatalog.types';

type ViewMode = 'grid' | 'table';

const CARRIER_TAGS: Record<string, string[]> = {
  GHN: ['COD toàn quốc', 'Giao hỏa tốc 2h', 'Đối soát 24h'],
  GHTK: ['Tối ưu cước phí', 'Bay hỏa tốc', 'Tracking thời gian thực'],
  VIETTELPOST: ['Mạng lưới 63 tỉnh', 'Bưu điện quốc gia', 'Bảo hiểm 100%'],
  SPX: ['Đồng bộ Shopee', 'Fulfillment Hub', 'Giao chuẩn TMĐT'],
  NINJAVAN: ['Cross-Border SEA', 'API Webhook', 'Giao 3 lần'],
  JNT: ['Vận hành 24/7', 'Phủ sóng toàn quốc', 'Giao tiết kiệm'],
};

export function GlobalCarrierCatalog() {
  const t = useTranslations('AdminCarriers');
  const {
    query,
    setQuery,
    carriers,
    selectedCarrier,
    setSelectedCarrier,
    selectCarrier,
    isLoading,
    isFallbackData,
    error,
    refetch,
  } = useCarrierCatalog();

  const [searchInput, setSearchInput] = useState(query.search || '');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery((prev) => ({ ...prev, search: searchInput }));
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setQuery((prev) => ({ ...prev, search: '' }));
  };

  const handleActiveFilter = (isActive?: boolean) => {
    setQuery((prev) => ({ ...prev, isActive }));
  };

  const columns: ColumnDef<CarrierSummary>[] = [
    {
      key: 'code',
      label: t('col_carrier'),
      render: (carrier) => (
        <div className="flex items-center gap-3 py-1">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-lighter)] text-xs font-semibold text-[var(--sc-primary-dark)]">
            {carrier.code.slice(0, 3)}
          </div>
          <div>
            <div className="font-medium text-[var(--sc-text-primary)]">
              {carrier.name}
            </div>
            <div className="font-mono text-xs text-[var(--sc-text-tertiary)]">
              {carrier.code}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'endpointsCount',
      label: t('col_endpoints'),
      render: (carrier) => (
        <div className="flex items-center gap-1.5 text-xs text-[var(--sc-text-secondary)]">
          <Server size={14} className="text-[var(--sc-primary)]" />
          <span className="font-medium text-[var(--sc-text-primary)]">
            {carrier.endpointsCount}
          </span>
          <span>{t('endpoints_count')}</span>
        </div>
      ),
    },
    {
      key: 'servicesCount',
      label: t('col_services'),
      render: (carrier) => (
        <div className="flex items-center gap-1.5 text-xs text-[var(--sc-text-secondary)]">
          <Truck size={14} className="text-[var(--sc-primary)]" />
          <span className="font-medium text-[var(--sc-text-primary)]">
            {carrier.servicesCount}
          </span>
          <span>{t('services_count')}</span>
        </div>
      ),
    },
    {
      key: 'connectedTenantsCount',
      label: t('col_connected_tenants'),
      render: (carrier) => (
        <div className="flex items-center gap-1.5 text-xs text-[var(--sc-text-secondary)]">
          <Users size={14} className="text-[var(--sc-text-tertiary)]" />
          <span>{carrier.connectedTenantsCount} doanh nghiệp</span>
        </div>
      ),
    },
    {
      key: 'isActive',
      label: t('col_status'),
      render: (carrier) => (
        <Badge
          status={carrier.isActive ? 'success' : 'default'}
          label={carrier.isActive ? t('status_active') : t('status_inactive')}
        />
      ),
    },
    {
      key: 'actions',
      label: t('col_actions'),
      render: (carrier) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => selectCarrier(carrier.id)}
        >
          <Eye size={13} className="mr-1.5 text-[var(--sc-primary)]" />
          {t('view_detail')}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
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
          {/* View mode toggle */}
          <div className="flex items-center rounded-xl bg-[var(--sc-bg-secondary)] p-1 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium transition-all ${
                viewMode === 'grid'
                  ? 'bg-[var(--sc-bg-surface)] text-[var(--sc-primary)] shadow-[var(--sc-shadow-button)]'
                  : 'text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]'
              }`}
              title="Grid view"
            >
              <LayoutGrid size={15} />
              <span>Thẻ</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium transition-all ${
                viewMode === 'table'
                  ? 'bg-[var(--sc-bg-surface)] text-[var(--sc-primary)] shadow-[var(--sc-shadow-button)]'
                  : 'text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]'
              }`}
              title="Table view"
            >
              <List size={15} />
              <span>Bảng</span>
            </button>
          </div>

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

      {/* Fallback Banner */}
      {(isFallbackData || error) && (
        <Alert variant="info" title="Danh mục hãng vận chuyển 3PL">
          Hiển thị cấu hình danh mục tích hợp cho GHN, GHTK, Viettel Post, Ninja Van, Shopee Express và J&T Express.
        </Alert>
      )}

      {/* Control Toolbar */}
      <Card className="p-4">
        <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 sm:max-w-md">
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

          {/* Filter Pills */}
          <div className="flex items-center rounded-xl bg-[var(--sc-bg-secondary)] p-1 text-xs">
            <button
              type="button"
              onClick={() => handleActiveFilter(undefined)}
              className={`rounded-lg px-3 py-1.5 font-medium transition-all ${
                query.isActive === undefined
                  ? 'bg-[var(--sc-bg-surface)] text-[var(--sc-text-primary)] shadow-[var(--sc-shadow-button)]'
                  : 'text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]'
              }`}
            >
              {t('filter_all')} ({carriers.length})
            </button>
            <button
              type="button"
              onClick={() => handleActiveFilter(true)}
              className={`rounded-lg px-3 py-1.5 font-medium transition-all ${
                query.isActive === true
                  ? 'bg-[var(--sc-bg-surface)] text-[var(--sc-success-dark)] shadow-[var(--sc-shadow-button)]'
                  : 'text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]'
              }`}
            >
              {t('status_active')}
            </button>
            <button
              type="button"
              onClick={() => handleActiveFilter(false)}
              className={`rounded-lg px-3 py-1.5 font-medium transition-all ${
                query.isActive === false
                  ? 'bg-[var(--sc-bg-surface)] text-[var(--sc-text-primary)] shadow-[var(--sc-shadow-button)]'
                  : 'text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]'
              }`}
            >
              {t('status_inactive')}
            </button>
          </div>
        </div>
      </Card>

      {/* View Content */}
      {viewMode === 'grid' ? (
        /* GRID CARDS VIEW */
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {carriers.map((carrier) => {
            const tags = CARRIER_TAGS[carrier.code] || ['Vận chuyển tiêu chuẩn', 'Tích hợp API'];
            return (
              <Card
                key={carrier.id}
                className="sc-card-enter flex flex-col justify-between p-5"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--sc-primary-lighter)] text-sm font-semibold text-[var(--sc-primary-dark)]">
                        {carrier.code.slice(0, 3)}
                      </div>
                      <div>
                        <h3 className="m-0 text-base font-medium leading-5 text-[var(--sc-text-primary)]">
                          {carrier.name}
                        </h3>
                        <span className="font-mono text-xs text-[var(--sc-text-tertiary)]">
                          {carrier.code}
                        </span>
                      </div>
                    </div>

                    <Badge
                      status={carrier.isActive ? 'success' : 'default'}
                      label={carrier.isActive ? t('status_active') : t('status_inactive')}
                    />
                  </div>

                  {/* Capability Tags */}
                  <div className="mt-3.5 flex flex-wrap gap-1.5">
                    {tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="rounded-md border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] px-2 py-0.5 text-[11px] text-[var(--sc-text-secondary)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Metrics grid inside card */}
                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-3 text-center">
                    <div>
                      <div className="text-base font-medium text-[var(--sc-text-primary)]">
                        {carrier.endpointsCount}
                      </div>
                      <div className="mt-0.5 text-[10px] text-[var(--sc-text-tertiary)] uppercase">
                        Cổng API
                      </div>
                    </div>
                    <div className="border-x border-[var(--sc-border-default)]">
                      <div className="text-base font-medium text-[var(--sc-text-primary)]">
                        {carrier.servicesCount}
                      </div>
                      <div className="mt-0.5 text-[10px] text-[var(--sc-text-tertiary)] uppercase">
                        Gói dịch vụ
                      </div>
                    </div>
                    <div>
                      <div className="text-base font-medium text-[var(--sc-text-primary)]">
                        {carrier.connectedTenantsCount}
                      </div>
                      <div className="mt-0.5 text-[10px] text-[var(--sc-text-tertiary)] uppercase">
                        Doanh nghiệp
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 border-t border-[var(--sc-border-default)] pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-center"
                    onClick={() => selectCarrier(carrier.id)}
                  >
                    <Eye size={14} className="mr-1.5 text-[var(--sc-primary)]" />
                    {t('view_detail')} & Cổng kết nối
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <Card className="overflow-hidden">
          <DataTable
            ariaLabel={t('page_title')}
            columns={columns}
            data={carriers}
            isLoading={isLoading}
          />
        </Card>
      )}

      {/* Carrier Detail Modal */}
      <CarrierDetailModal
        isOpen={Boolean(selectedCarrier)}
        onClose={() => setSelectedCarrier(null)}
        carrier={selectedCarrier}
      />
    </div>
  );
}
