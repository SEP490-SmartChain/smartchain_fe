import { useMemo } from 'react';

import { useNavigate } from 'react-router-dom';

import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Alert } from '@/components/Common';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';

import { useRunningLow } from '../hooks/useRunningLow';

import type { RunningLowItem } from '../types/inventoryStock.types';

interface RunningLowCardProps {
  warehouseId?: string;
}

export function RunningLowCard({ warehouseId }: RunningLowCardProps) {
  const t = useTranslations('Inventory');
  const locale = useLocale();
  const navigate = useNavigate();
  const { items, error, isLoading, refetch } = useRunningLow();

  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  const filteredItems = useMemo(() => {
    if (!warehouseId) return items;
    return items.filter((item) => item.warehouseId === warehouseId);
  }, [items, warehouseId]);

  const criticalCount = useMemo(
    () => filteredItems.filter((item) => item.urgencyLevel === 'CRITICAL').length,
    [filteredItems],
  );

  const columns: ColumnDef<RunningLowItem>[] = [
    {
      key: 'sku',
      label: t('product'),
      render: (row) => (
        <div className="min-w-40">
          <span className="font-medium">{row.sku}</span>
          <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">{row.productName}</p>
        </div>
      ),
    },
    {
      key: 'warehouse',
      label: t('columnWarehouse'),
      render: (row) => (
        <div className="min-w-28">
          <span className="font-medium">{row.warehouseCode}</span>
          <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">{row.warehouseName}</p>
        </div>
      ),
    },
    {
      key: 'availableStock',
      label: t('columnAvailable'),
      render: (row) => (
        <span className="block text-right font-medium tabular-nums">
          {number.format(row.availableStock)}
        </span>
      ),
    },
    {
      key: 'dailyVelocity',
      label: t('columnDailyVelocity'),
      render: (row) => (
        <span className="block text-right tabular-nums text-[var(--sc-text-secondary)]">
          {t('unitsPerDay', { rate: row.dailyVelocity.toFixed(1) })}
        </span>
      ),
    },
    {
      key: 'daysOfStockLeft',
      label: t('columnDaysOfCover'),
      render: (row) => (
        <span className="block text-right font-semibold tabular-nums text-[var(--sc-warning-dark)]">
          {t('daysCoverUnit', { days: number.format(row.daysOfStockLeft) })}
        </span>
      ),
    },
    {
      key: 'urgencyLevel',
      label: t('columnUrgency'),
      render: (row) => (
        <Badge
          status={row.urgencyLevel === 'CRITICAL' ? 'error' : 'warning'}
          label={row.urgencyLevel === 'CRITICAL' ? t('urgencyCritical') : t('urgencyWarning')}
        />
      ),
    },
    {
      key: 'suggestedReplenishmentQty',
      label: t('columnSuggestedReplenishment'),
      render: (row) => (
        <span className="block text-right font-bold tabular-nums text-[var(--sc-primary-dark)]">
          +{number.format(row.suggestedReplenishmentQty)}
        </span>
      ),
    },
    {
      key: 'action',
      label: '',
      render: () => (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => navigate('/asns')}>
            {t('replenishAction')}
          </Button>
        </div>
      ),
    },
  ];

  if (isLoading) {
    return (
      <section className="sc-surface p-4" aria-label={t('runningLowTitle')}>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-8 w-8 animate-pulse rounded-lg bg-[var(--sc-bg-secondary)]"
          />
          <div className="space-y-1">
            <span
              aria-hidden="true"
              className="block h-4 w-40 animate-pulse rounded bg-[var(--sc-bg-secondary)]"
            />
            <span
              aria-hidden="true"
              className="block h-3 w-64 animate-pulse rounded bg-[var(--sc-bg-secondary)]"
            />
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <Alert variant="error" title={t('runningLowLoadError')}>
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          {t('refresh')}
        </Button>
      </Alert>
    );
  }

  if (filteredItems.length === 0) {
    return (
      <section
        className="sc-surface flex items-center justify-between p-4"
        aria-label={t('runningLowTitle')}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--sc-success-bg)] text-[var(--sc-success-dark)]">
            <ShieldCheck size={20} aria-hidden="true" />
          </div>
          <div>
            <h3 className="m-0 text-sm font-semibold">{t('runningLowEmpty')}</h3>
            <p className="m-0 text-xs text-[var(--sc-text-secondary)]">
              {t('runningLowEmptyHint')}
            </p>
          </div>
        </div>
        <Button size="sm" variant="ghost" aria-label={t('refresh')} onClick={() => void refetch()}>
          <RefreshCw size={14} aria-hidden="true" />
        </Button>
      </section>
    );
  }

  return (
    <section
      className="sc-surface overflow-hidden border-l-4 border-l-[var(--sc-warning)]"
      aria-label={t('runningLowTitle')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sc-border-default)] p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--sc-warning-bg)] text-[var(--sc-warning-dark)]">
            <AlertTriangle size={20} aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-base font-semibold">{t('runningLowTitle')}</h2>
              <Badge
                status={criticalCount > 0 ? 'error' : 'warning'}
                label={t('runningLowUrgentCount', { count: filteredItems.length })}
              />
            </div>
            <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">
              {t('runningLowDescription')}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          <RefreshCw size={14} aria-hidden="true" />
          {t('refresh')}
        </Button>
      </div>
      <DataTable
        ariaLabel={t('runningLowTitle')}
        columns={columns}
        data={filteredItems}
        getRowKey={(row) => `${row.productId}:${row.warehouseId}`}
      />
    </section>
  );
}
