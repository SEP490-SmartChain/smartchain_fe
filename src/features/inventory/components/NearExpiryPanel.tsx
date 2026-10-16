import { useMemo, useState } from 'react';

import { CalendarClock, RefreshCw, Search, Settings2, ShieldAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import { Input } from '@/components/Common/Input/Input';
import { useAccess } from '@/hooks/useAccess';
import { useDebounce } from '@/hooks/useDebounce';

import { InventoryNotificationSettingsCard } from './InventoryNotificationSettingsCard';
import { InventoryReadError } from './InventoryReadError';
import { InventoryState } from './InventoryState';
import { useInventoryExpiry } from '../hooks/useInventoryExpiry';

import type { NearExpiryPosition } from '../api/inventoryExpiryApi';

export function NearExpiryPanel({ warehouseId }: { warehouseId: string }) {
  const t = useTranslations('InventoryExpiry');
  const common = useTranslations('Inventory');
  const detail = useTranslations('InventoryDetail');
  const locale = useLocale();
  const { can } = useAccess();
  const [search, setSearch] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const debouncedSearch = useDebounce(search, 400);
  const filters = useMemo(
    () => ({ warehouseId, search: debouncedSearch.trim() }),
    [warehouseId, debouncedSearch],
  );
  const { items, error, isLoading, isLoadingMore, hasNext, refetch, loadMore } = useInventoryExpiry(
    filters,
    true,
  );
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const date = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }),
    [locale],
  );
  const columns: ColumnDef<NearExpiryPosition>[] = [
    {
      key: 'sku',
      label: common('product'),
      render: (row) => (
        <div className="min-w-40">
          <span className="font-medium">{row.sku}</span>
          <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">{row.productName}</p>
        </div>
      ),
    },
    {
      key: 'lotCode',
      label: t('lotLocation'),
      render: (row) => (
        <div className="min-w-32">
          <span className="font-medium">{row.lotCode}</span>
          <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">
            {row.warehouseCode} · {row.binCode}
          </p>
        </div>
      ),
    },
    {
      key: 'expiresOn',
      label: t('expiry'),
      render: (row) => (
        <div className="min-w-32">
          <span>{row.expiresOn ? date.format(new Date(row.expiresOn)) : t('missingExpiry')}</span>
          <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">
            {row.remainingDays === null
              ? t('remainingUnknown')
              : row.remainingDays < 0
                ? t('expiredDays', { count: Math.abs(row.remainingDays) })
                : row.remainingDays === 0
                  ? t('expiresToday')
                  : t('daysLeft', { count: row.remainingDays })}
          </p>
        </div>
      ),
    },
    {
      key: 'isBlocked',
      label: t('eligibility'),
      render: (row) => (
        <div className="min-w-40 space-y-1.5">
          <Badge
            status={row.isBlocked ? 'error' : 'warning'}
            label={t(row.isBlocked ? 'blocked' : 'saleable')}
          />
          <p className="m-0 text-xs text-[var(--sc-text-secondary)]">
            {detail.has(`lotState.${row.lotStatus}`)
              ? detail(`lotState.${row.lotStatus}`)
              : row.lotStatus}
          </p>
        </div>
      ),
    },
    {
      key: 'availableQty',
      label: t('physicalAvailable'),
      render: (row) => (
        <div className="text-right tabular-nums">
          <span className="font-semibold">{number.format(row.availableQty)}</span>
          <p className="mb-0 mt-1 whitespace-nowrap text-xs text-[var(--sc-text-secondary)]">
            {t('reservedUnits', { count: row.reservedQty })}
          </p>
        </div>
      ),
    },
    {
      key: 'minOutboundDays',
      label: t('minimumDays'),
      render: (row) => (
        <span className="block whitespace-nowrap text-right tabular-nums">
          {t('dayCount', { count: row.minOutboundDays })}
        </span>
      ),
    },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-semibold">{t('title')}</h2>
          <p className="mb-0 mt-1 text-sm text-[var(--sc-text-secondary)]">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('inventory.notifications.manage') && (
            <Button
              variant="outline"
              size="sm"
              aria-expanded={showSettings}
              aria-controls="inventory-notification-settings"
              onClick={() => setShowSettings((value) => !value)}
            >
              <Settings2 size={15} aria-hidden="true" />
              {t('settingsAction')}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={isLoading || isLoadingMore}
            onClick={() => void refetch()}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {common('refresh')}
          </Button>
        </div>
      </div>
      {showSettings && can('inventory.notifications.manage') && (
        <div id="inventory-notification-settings">
          <InventoryNotificationSettingsCard />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex gap-3 rounded-xl border border-[var(--sc-warning-border)] bg-[var(--sc-warning-bg)] p-4 text-[var(--sc-warning-dark)]">
          <CalendarClock size={19} aria-hidden="true" className="shrink-0" />
          <div>
            <p className="m-0 text-sm font-semibold">{t('warningTitle')}</p>
            <p className="mb-0 mt-1 text-xs leading-5">{t('warningHint')}</p>
          </div>
        </div>
        <div className="flex gap-3 rounded-xl border border-[var(--sc-error-border)] bg-[var(--sc-error-bg)] p-4 text-[var(--sc-error-dark)]">
          <ShieldAlert size={19} aria-hidden="true" className="shrink-0" />
          <div>
            <p className="m-0 text-sm font-semibold">{t('blockedTitle')}</p>
            <p className="mb-0 mt-1 text-xs leading-5">{t('blockedHint')}</p>
          </div>
        </div>
      </div>
      <section className="sc-surface overflow-hidden" aria-label={t('title')}>
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--sc-border-default)] p-4">
          <div className="min-w-0 flex-1 sm:max-w-md">
            <Input
              type="search"
              aria-label={t('search')}
              placeholder={t('searchPlaceholder')}
              value={search}
              maxLength={100}
              leftIcon={<Search size={16} aria-hidden="true" />}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {search && (
            <Button variant="ghost" size="sm" onClick={() => setSearch('')}>
              {common('clearFilters')}
            </Button>
          )}
        </div>
        {error ? (
          <div className="p-4">
            <InventoryReadError
              error={error}
              title={items.length ? common('loadMoreError') : t('loadError')}
              onRetry={() => void (items.length ? loadMore() : refetch())}
            />
          </div>
        ) : null}
        {(!error || items.length > 0) && (
          <div aria-busy={isLoading || isLoadingMore}>
            <DataTable
              ariaLabel={t('title')}
              columns={columns}
              data={items}
              isLoading={isLoading}
              getRowKey={(row) => row.id}
              emptyMessage={
                <InventoryState
                  compact
                  title={search.trim() ? common('emptyFiltered') : t('empty')}
                  description={search.trim() ? common('emptyFilteredHint') : t('emptyHint')}
                  action={
                    search ? (
                      <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                        {common('clearFilters')}
                      </Button>
                    ) : undefined
                  }
                />
              }
            />
          </div>
        )}
        {!isLoading && items.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sc-border-default)] px-4 py-3">
            <span role="status" className="text-xs text-[var(--sc-text-secondary)]">
              {common('loadedRows', { count: items.length })}
            </span>
            {hasNext && (
              <Button
                size="sm"
                variant="outline"
                isLoading={isLoadingMore}
                onClick={() => void loadMore()}
              >
                {t('loadMore')}
              </Button>
            )}
          </div>
        )}
      </section>
      <p className="m-0 text-xs leading-5 text-[var(--sc-text-secondary)]">{t('explanation')}</p>
    </div>
  );
}
