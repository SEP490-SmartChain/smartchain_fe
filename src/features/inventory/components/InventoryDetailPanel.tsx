import { useMemo, useState } from 'react';

import { useLocale, useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import { Input } from '@/components/Common/Input/Input';
import { Select } from '@/components/Common/Select/Select';
import { useAccess } from '@/hooks/useAccess';
import { useDebounce } from '@/hooks/useDebounce';

import { useInventoryDetail } from '../hooks/useInventoryDetail';
import { useWarehouseOptions } from '../hooks/useWarehouseOptions';

import type {
  InventoryDetailFilters,
  InventoryMovement,
  InventoryPosition,
} from '../api/inventoryDetailApi';

type DetailRow = InventoryPosition | InventoryMovement;
const EMPTY_FILTERS: InventoryDetailFilters = {
  warehouseId: '',
  lotStatus: '',
  search: '',
  lotCode: '',
  binCode: '',
  expiresBefore: '',
  expiresAfter: '',
  movementType: '',
  from: '',
  to: '',
};
const MOVEMENT_TYPES = [
  'IN',
  'OUT',
  'ADJUST',
  'RESERVE',
  'RELEASE',
  'RETURN',
  'RECEIVE',
  'PUTAWAY',
  'PICK',
  'PUTBACK',
  'QUARANTINE',
  'DISPOSE',
  'COUNT_ADJUST',
  'RELOCATE',
];
const LOT_STATES = [
  'SELLABLE',
  'NEAR_EXPIRY',
  'QUARANTINE',
  'NEAR_EXPIRY_LOCKED',
  'EXPIRED',
  'RECALLED',
];

export function InventoryDetailPanel({ kind }: { kind: 'positions' | 'ledger' }) {
  const t = useTranslations('InventoryDetail');
  const locale = useLocale();
  const { actorScope } = useAccess();
  const { warehouses, error: warehouseError } = useWarehouseOptions();
  const [input, setInput] = useState(EMPTY_FILTERS);
  const filters = useDebounce(input, 400);
  const enabled = actorScope === 'TENANT' || Boolean(filters.warehouseId);
  const { items, error, isLoading, hasNext, refetch, loadMore } = useInventoryDetail(
    kind,
    filters,
    enabled,
  );
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const date = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }),
    [locale],
  );
  const timestamp = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );
  const columns: ColumnDef<DetailRow>[] = [
    { key: 'sku', label: t('sku') },
    { key: 'warehouseCode', label: t('warehouse') },
    { key: 'lotCode', label: t('lot'), render: (row) => row.lotCode ?? t('unmapped') },
    { key: 'binCode', label: t('bin'), render: (row) => row.binCode ?? t('unmapped') },
    ...(kind === 'positions'
      ? [
          {
            key: 'expiresOn',
            label: t('expiry'),
            render: (row: DetailRow) =>
              'expiresOn' in row && row.expiresOn
                ? date.format(new Date(row.expiresOn))
                : t('noExpiry'),
          },
          {
            key: 'stockState',
            label: t('status'),
            render: (row: DetailRow) => ('stockState' in row ? t(`state.${row.stockState}`) : ''),
          },
          {
            key: 'lotStatus',
            label: t('lotStatus'),
            render: (row: DetailRow) =>
              'lotStatus' in row && row.lotStatus ? t(`lotState.${row.lotStatus}`) : t('unmapped'),
          },
          {
            key: 'eligibilityReason',
            label: t('eligibility'),
            render: (row: DetailRow) =>
              'eligibilityReason' in row ? t(`eligibilityReason.${row.eligibilityReason}`) : '',
          },
          {
            key: 'availableQty',
            label: t('physicalAvailable'),
            render: (row: DetailRow) =>
              'availableQty' in row ? number.format(row.availableQty) : '',
          },
          {
            key: 'reservedQty',
            label: t('reserved'),
            render: (row: DetailRow) =>
              'reservedQty' in row ? number.format(row.reservedQty) : '',
          },
        ]
      : [
          {
            key: 'type',
            label: t('movement'),
            render: (row: DetailRow) => ('type' in row ? t(`movementType.${row.type}`) : ''),
          },
          {
            key: 'onHandDelta',
            label: t('onHandDelta'),
            render: (row: DetailRow) =>
              'onHandDelta' in row ? number.format(row.onHandDelta) : '',
          },
          {
            key: 'reservedDelta',
            label: t('reservedDelta'),
            render: (row: DetailRow) =>
              'reservedDelta' in row ? number.format(row.reservedDelta) : '',
          },
          {
            key: 'refId',
            label: t('reference'),
            render: (row: DetailRow) => ('refId' in row ? `${row.refType}: ${row.refId}` : ''),
          },
          { key: 'actorReference', label: t('actor') },
          {
            key: 'createdAt',
            label: t('time'),
            render: (row: DetailRow) =>
              'createdAt' in row ? timestamp.format(new Date(row.createdAt)) : '',
          },
        ]),
  ];
  const change = (key: keyof InventoryDetailFilters, value: string) =>
    setInput((previous) => ({ ...previous, [key]: value }));
  const textFilters = ['search', 'lotCode', 'binCode'] as const;
  const dateFilters =
    kind === 'positions' ? (['expiresAfter', 'expiresBefore'] as const) : (['from', 'to'] as const);
  return (
    <section className="sc-surface space-y-4 p-4" aria-label={t(kind)}>
      <h2 className="text-lg font-medium">{t(kind)}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {kind === 'positions' && (
          <Select
            label={t('lotStatus')}
            value={input.lotStatus ?? ''}
            placeholder={t('allLotStatuses')}
            isPlaceholderDisabled={false}
            options={LOT_STATES.map((value) => ({ value, label: t(`lotState.${value}`) }))}
            onChange={(event) => change('lotStatus', event.target.value)}
          />
        )}
        <Select
          label={t('warehouse')}
          value={input.warehouseId ?? ''}
          placeholder={
            warehouseError
              ? t('warehouseLoadError')
              : t(actorScope === 'TENANT' ? 'allWarehouses' : 'selectWarehouse')
          }
          isPlaceholderDisabled={actorScope === 'PLATFORM'}
          disabled={Boolean(warehouseError)}
          options={warehouses.map((warehouse) => ({
            value: warehouse.id,
            label: `${warehouse.code} — ${warehouse.name}`,
          }))}
          onChange={(event) => change('warehouseId', event.target.value)}
        />
        {textFilters.map((key) => (
          <Input
            key={key}
            label={t(key)}
            value={input[key]}
            maxLength={100}
            onChange={(event) => change(key, event.target.value)}
          />
        ))}
        {dateFilters.map((key) => (
          <Input
            key={key}
            label={t(key)}
            type="date"
            value={input[key]}
            onChange={(event) => change(key, event.target.value)}
          />
        ))}
        {kind === 'ledger' && (
          <Select
            label={t('movement')}
            value={input.movementType}
            placeholder={t('allMovements')}
            isPlaceholderDisabled={false}
            options={MOVEMENT_TYPES.map((value) => ({ value, label: t(`movementType.${value}`) }))}
            onChange={(event) => change('movementType', event.target.value)}
          />
        )}
      </div>
      {!enabled ? (
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('selectWarehouse')}</p>
      ) : error ? (
        <Alert variant="error" title={t('loadError')}>
          <Button variant="outline" onClick={() => void refetch()}>
            {t('retry')}
          </Button>
        </Alert>
      ) : (
        <DataTable
          ariaLabel={t(kind)}
          columns={columns}
          data={items}
          isLoading={isLoading}
          getRowKey={(row) => row.id}
          emptyMessage={t('empty')}
        />
      )}
      {hasNext && !error && (
        <Button variant="outline" disabled={isLoading} onClick={() => void loadMore()}>
          {t('loadMore')}
        </Button>
      )}
    </section>
  );
}
