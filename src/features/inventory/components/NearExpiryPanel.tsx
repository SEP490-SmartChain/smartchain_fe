import { useMemo, useState } from 'react';

import { useLocale, useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import { Input } from '@/components/Common/Input/Input';
import { Select } from '@/components/Common/Select/Select';
import { useAccess } from '@/hooks/useAccess';
import { useDebounce } from '@/hooks/useDebounce';

import { InventoryNotificationSettingsCard } from './InventoryNotificationSettingsCard';
import { useInventoryExpiry } from '../hooks/useInventoryExpiry';
import { useWarehouseOptions } from '../hooks/useWarehouseOptions';

import type { NearExpiryPosition } from '../api/inventoryExpiryApi';

export function NearExpiryPanel() {
  const t = useTranslations('InventoryExpiry'),
    locale = useLocale(),
    { actorScope } = useAccess();
  const { warehouses, error: warehouseError } = useWarehouseOptions();
  const [input, setInput] = useState({ warehouseId: '', search: '' });
  const filters = useDebounce(input, 400),
    enabled = actorScope === 'TENANT' || Boolean(filters.warehouseId);
  const { items, error, isLoading, hasNext, refetch, loadMore } = useInventoryExpiry(
    filters,
    enabled,
  );
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const columns: ColumnDef<NearExpiryPosition>[] = [
    { key: 'sku', label: t('sku') },
    { key: 'warehouseCode', label: t('warehouse') },
    { key: 'lotCode', label: t('lot') },
    { key: 'binCode', label: t('bin') },
    { key: 'expiresOn', label: t('expiry'), render: (r) => r.expiresOn ?? t('missingExpiry') },
    {
      key: 'remainingDays',
      label: t('remainingDays'),
      render: (r) =>
        r.remainingDays === null ? t('missingExpiry') : number.format(r.remainingDays),
    },
    {
      key: 'isBlocked',
      label: t('eligibility'),
      render: (r) => (
        <Badge
          status={r.isBlocked ? 'error' : 'warning'}
          label={t(r.isBlocked ? 'blocked' : 'saleable')}
        />
      ),
    },
    {
      key: 'availableQty',
      label: t('physicalAvailable'),
      render: (r) => number.format(r.availableQty),
    },
    {
      key: 'minOutboundDays',
      label: t('minimumDays'),
      render: (r) => number.format(r.minOutboundDays),
    },
  ];
  return (
    <section className="sc-surface space-y-4 p-4" aria-label={t('title')}>
      <h2 className="text-lg font-medium">{t('title')}</h2>
      <p className="text-sm text-[var(--sc-text-secondary)]">{t('explanation')}</p>
      {actorScope === 'TENANT' && <InventoryNotificationSettingsCard />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label={t('search')}
          value={input.search}
          maxLength={100}
          onChange={(e) => setInput((old) => ({ ...old, search: e.target.value }))}
        />
        <Select
          label={t('warehouse')}
          value={input.warehouseId}
          placeholder={t(actorScope === 'TENANT' ? 'allWarehouses' : 'selectWarehouse')}
          isPlaceholderDisabled={actorScope === 'PLATFORM'}
          disabled={Boolean(warehouseError)}
          options={warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))}
          onChange={(e) => setInput((old) => ({ ...old, warehouseId: e.target.value }))}
        />
      </div>
      {warehouseError && <Alert variant="error" title={t('warehouseError')} />}
      {!enabled ? (
        <p>{t('selectWarehouse')}</p>
      ) : error ? (
        <Alert variant="error" title={t('loadError')}>
          <Button variant="outline" onClick={() => void refetch()}>
            {t('retry')}
          </Button>
        </Alert>
      ) : (
        <DataTable
          ariaLabel={t('title')}
          columns={columns}
          data={items}
          isLoading={isLoading}
          getRowKey={(r) => r.id}
          emptyMessage={t('empty')}
        />
      )}
      {hasNext && !error && (
        <Button disabled={isLoading} variant="outline" onClick={() => void loadMore()}>
          {t('loadMore')}
        </Button>
      )}
    </section>
  );
}
