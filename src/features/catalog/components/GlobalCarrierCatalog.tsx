import { useState } from 'react';

import { Eye, LayoutGrid, List, RefreshCw, Search, Truck, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import { Input } from '@/components/Common/Input/Input';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';

import { CarrierDetailModal } from './CarrierDetailModal';
import { CarrierEditor } from './CarrierManagementForms';
import { useCarrierCatalog } from '../hooks/useCarrierCatalog';

import type { CarrierSummary } from '../types/carrierCatalog.types';

type ViewMode = 'grid' | 'table';

export function GlobalCarrierCatalog() {
  const t = useTranslations('AdminCarriers');
  const { can } = useAccess();
  const actor = useAuthStore((state) => state.user);
  const [creating, setCreating] = useState(false);
  const {
    query,
    setQuery,
    carriers,
    selectedCarrier,
    setSelectedCarrier,
    selectCarrier,
    isLoading,
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
            <div className="font-medium text-[var(--sc-text-primary)]">{carrier.name}</div>
            <div className="font-mono text-xs text-[var(--sc-text-tertiary)]">{carrier.code}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'servicesCount',
      label: t('col_services'),
      render: (carrier) => (
        <div className="flex items-center gap-1.5 text-xs text-[var(--sc-text-secondary)]">
          <Truck size={14} className="text-[var(--sc-primary)]" />
          <span className="font-medium text-[var(--sc-text-primary)]">{carrier.servicesCount}</span>
          <span>{t('services_count')}</span>
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
        <Button size="sm" variant="outline" onClick={() => selectCarrier(carrier.id)}>
          <Eye size={13} className="mr-1.5 text-[var(--sc-primary)]" />
          {t('view_detail')}
        </Button>
      ),
    },
  ];

  if (!can('platform.carriers.manage')) return null;
  return (
    <Card className="space-y-5 p-5">
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

        <div className="flex flex-wrap items-center gap-2">
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
              title={t('gridView')}
            >
              <LayoutGrid size={15} />
              <span>{t('gridView')}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium transition-all ${
                viewMode === 'table'
                  ? 'bg-[var(--sc-bg-surface)] text-[var(--sc-primary)] shadow-[var(--sc-shadow-button)]'
                  : 'text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]'
              }`}
              title={t('tableView')}
            >
              <List size={15} />
              <span>{t('tableView')}</span>
            </button>
          </div>

          <Button variant="outline" size="sm" onClick={() => refetch()} isLoading={isLoading}>
            <RefreshCw size={14} className={`mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            {t('refresh')}
          </Button>
          <Button onClick={() => setCreating(true)}>{t('createCarrier')}</Button>
        </div>
      </div>

      {error && (
        <Alert variant="error" title={t('loadError')}>
          {error.message}
        </Alert>
      )}

      {/* Control Toolbar */}
      <div>
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
                aria-label={t('clearSearch')}
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
      </div>

      {/* View Content */}
      {viewMode === 'grid' ? (
        carriers.length === 0 && !isLoading ? (
          <Card className="p-8 text-center text-sm text-[var(--sc-text-tertiary)]">
            {t('emptyCarriers')}
          </Card>
        ) : (
          /* GRID CARDS VIEW */
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {carriers.map((carrier) => {
              return (
                <Card key={carrier.id} className="sc-card-enter flex flex-col justify-between p-5">
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
                  </div>

                  <div className="mt-5 border-t border-[var(--sc-border-default)] pt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-center"
                      onClick={() => selectCarrier(carrier.id)}
                    >
                      <Eye size={14} className="mr-1.5 text-[var(--sc-primary)]" />
                      {t('manageServices')}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )
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

      {creating && (
        <CarrierEditor
          key={actor?.userId}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void refetch();
          }}
        />
      )}
      {/* Carrier Detail Modal */}
      <CarrierDetailModal
        isOpen={Boolean(selectedCarrier)}
        onClose={() => setSelectedCarrier(null)}
        key={`${actor?.userId}:${selectedCarrier?.id}`}
        carrier={selectedCarrier}
        onChanged={async () => {
          if (selectedCarrier) await selectCarrier(selectedCarrier.id);
          await refetch();
        }}
      />
    </Card>
  );
}
