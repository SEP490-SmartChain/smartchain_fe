import { useId, useMemo, useState } from 'react';

import { ChevronDown, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import { Input } from '@/components/Common/Input/Input';
import { Select } from '@/components/Common/Select/Select';
import { useDebounce } from '@/hooks/useDebounce';

import { InventoryPositionsTable } from './InventoryPositionsTable';
import { InventoryReadError } from './InventoryReadError';
import { InventoryState } from './InventoryState';
import { useInventoryDetail } from '../hooks/useInventoryDetail';

import type {
  InventoryDetailFilters,
  InventoryMovement,
  InventoryPosition,
} from '../api/inventoryDetailApi';

type DetailRow = InventoryPosition | InventoryMovement;
const EMPTY_FILTERS: InventoryDetailFilters = {
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

export function InventoryDetailPanel({
  kind,
  warehouseId,
}: {
  kind: 'positions' | 'ledger';
  warehouseId: string;
}) {
  const t = useTranslations('InventoryDetail');
  const common = useTranslations('Inventory');
  const locale = useLocale();
  const filterId = useId();
  const [input, setInput] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const debounced = useDebounce(input, 400);
  const dateFilters =
    kind === 'positions' ? (['expiresAfter', 'expiresBefore'] as const) : (['from', 'to'] as const);
  const [start, end] = dateFilters;
  const invalidDates = Boolean(input[start] && input[end] && input[start] > input[end]);
  const queryInvalid = Boolean(
    debounced[start] && debounced[end] && debounced[start] > debounced[end],
  );
  const filters = useMemo(() => ({ ...debounced, warehouseId }), [debounced, warehouseId]);
  const { items, error, isLoading, isLoadingMore, hasNext, refetch, loadMore } = useInventoryDetail(
    kind,
    filters,
    !invalidDates && !queryInvalid,
  );
  const signed = useMemo(
    () => new Intl.NumberFormat(locale, { signDisplay: 'exceptZero' }),
    [locale],
  );
  const timestamp = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );
  const activeFilters = Object.values(input).filter((value) => value?.trim()).length;
  const advancedCount =
    activeFilters -
    (input.search.trim() ? 1 : 0) -
    (kind === 'positions' ? (input.lotStatus ? 1 : 0) : input.movementType ? 1 : 0);
  const change = (key: keyof InventoryDetailFilters, value: string) =>
    setInput((previous) => ({ ...previous, [key]: value }));
  const columns: ColumnDef<DetailRow>[] = [
    {
      key: 'sku',
      label: common('product'),
      render: (row) => (
        <div className="min-w-36">
          <span className="font-medium">{row.sku}</span>
          {'productName' in row && (
            <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">{row.productName}</p>
          )}
        </div>
      ),
    },
    {
      key: 'lotCode',
      label: t('lotLocation'),
      render: (row) => (
        <div className="min-w-32">
          <span>{row.lotCode ?? t('unmapped')}</span>
          <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">
            {row.warehouseCode} · {row.binCode ?? t('unmapped')}
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      label: t('movement'),
      render: (row: DetailRow) =>
        'type' in row ? (
          <Badge
            status="info"
            label={t.has(`movementType.${row.type}`) ? t(`movementType.${row.type}`) : row.type}
          />
        ) : (
          ''
        ),
    },
    {
      key: 'onHandDelta',
      label: t('onHandDelta'),
      render: (row: DetailRow) =>
        'onHandDelta' in row ? (
          <div className="text-right tabular-nums">
            <span
              className={
                row.onHandDelta < 0
                  ? 'font-semibold text-[var(--sc-error-dark)]'
                  : row.onHandDelta > 0
                    ? 'font-semibold text-[var(--sc-success-dark)]'
                    : ''
              }
            >
              {signed.format(row.onHandDelta)}
            </span>
            <p className="mb-0 mt-1 whitespace-nowrap text-xs text-[var(--sc-text-secondary)]">
              {t('afterChange', { count: row.onHandAfter })}
            </p>
          </div>
        ) : (
          ''
        ),
    },
    {
      key: 'reservedDelta',
      label: t('reservedDelta'),
      render: (row: DetailRow) =>
        'reservedDelta' in row ? (
          <div className="text-right tabular-nums">
            <span>{signed.format(row.reservedDelta)}</span>
            <p className="mb-0 mt-1 whitespace-nowrap text-xs text-[var(--sc-text-secondary)]">
              {t('afterChange', { count: row.reservedAfter })}
            </p>
          </div>
        ) : (
          ''
        ),
    },
    {
      key: 'refId',
      label: t('reference'),
      render: (row: DetailRow) =>
        'refId' in row ? (
          <div className="max-w-48">
            <span className="text-xs">{row.refType}</span>
            <p className="mb-0 mt-1 break-all font-mono text-xs text-[var(--sc-text-secondary)]">
              {row.refId}
            </p>
          </div>
        ) : (
          ''
        ),
    },
    {
      key: 'createdAt',
      label: t('timeActor'),
      render: (row: DetailRow) =>
        'createdAt' in row ? (
          <div className="min-w-36">
            <span className="whitespace-nowrap">{timestamp.format(new Date(row.createdAt))}</span>
            <p className="mb-0 mt-1 max-w-44 break-all text-xs text-[var(--sc-text-secondary)]">
              {row.actorReference}
            </p>
          </div>
        ) : (
          ''
        ),
    },
  ];
  const emptyMessage = (
    <InventoryState
      compact
      title={activeFilters ? common('emptyFiltered') : t('empty')}
      description={
        activeFilters
          ? common('emptyFilteredHint')
          : t(kind === 'positions' ? 'emptyPositionsHint' : 'emptyLedgerHint')
      }
      action={
        activeFilters ? (
          <Button variant="outline" size="sm" onClick={() => setInput(EMPTY_FILTERS)}>
            {common('clearFilters')}
          </Button>
        ) : undefined
      }
    />
  );
  return (
    <section className="sc-surface overflow-hidden" aria-label={t(kind)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--sc-border-default)] p-4">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-base font-semibold">{t(kind)}</h2>
          <p className="mb-0 mt-1 text-xs leading-5 text-[var(--sc-text-secondary)]">
            {t(kind === 'positions' ? 'positionsHint' : 'ledgerHint')}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={isLoading || isLoadingMore || invalidDates}
          onClick={() => void refetch()}
        >
          <RefreshCw size={14} aria-hidden="true" />
          {common('refresh')}
        </Button>
      </div>
      <div className="space-y-3 border-b border-[var(--sc-border-default)] p-4">
        <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
          <Input
            type="search"
            aria-label={t('search')}
            label={kind === 'positions' ? t('search') : undefined}
            placeholder={common('searchPlaceholder')}
            value={input.search}
            maxLength={100}
            leftIcon={<Search size={16} aria-hidden="true" />}
            onChange={(event) => change('search', event.target.value)}
          />
          {kind === 'positions' ? (
            <Select
              aria-label={t('lotStatus')}
              label={t('lotStatus')}
              value={input.lotStatus}
              placeholder={t('allLotStatuses')}
              isPlaceholderDisabled={false}
              options={LOT_STATES.map((value) => ({ value, label: t(`lotState.${value}`) }))}
              onChange={(event) => change('lotStatus', event.target.value)}
            />
          ) : (
            <Select
              aria-label={t('movement')}
              value={input.movementType}
              placeholder={t('allMovements')}
              isPlaceholderDisabled={false}
              options={MOVEMENT_TYPES.map((value) => ({
                value,
                label: t(`movementType.${value}`),
              }))}
              onChange={(event) => change('movementType', event.target.value)}
            />
          )}
          <Button
            variant="secondary"
            aria-expanded={showFilters}
            aria-controls={filterId}
            onClick={() => setShowFilters((value) => !value)}
          >
            <SlidersHorizontal size={15} aria-hidden="true" />
            {common('filters')}
            {advancedCount > 0 && <span>({advancedCount})</span>}
            <ChevronDown size={14} aria-hidden="true" />
          </Button>
        </div>
        {showFilters && (
          <div
            id={filterId}
            className="grid gap-3 rounded-xl bg-[var(--sc-bg-secondary)] p-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            {(['lotCode', 'binCode'] as const).map((key) => (
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
                min={key === end ? input[start] || undefined : undefined}
                max={key === start ? input[end] || undefined : undefined}
                error={invalidDates && key === end ? t('invalidDateRange') : undefined}
                onChange={(event) => change(key, event.target.value)}
              />
            ))}
          </div>
        )}
        {activeFilters > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[var(--sc-text-secondary)]">
              {common('activeFilters', { count: activeFilters })}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setInput(EMPTY_FILTERS)}>
              {common('clearFilters')}
            </Button>
          </div>
        )}
      </div>
      {invalidDates || queryInvalid ? (
        <InventoryState title={t('invalidDateRange')} description={t('invalidDateHint')} />
      ) : (
        <>
          {error && (
            <div className="p-4">
              <InventoryReadError
                error={error}
                title={items.length ? common('loadMoreError') : t('loadError')}
                onRetry={() => void (items.length ? loadMore() : refetch())}
              />
            </div>
          )}
          {(!error || items.length > 0) && (
            <div aria-busy={isLoading || isLoadingMore}>
              {kind === 'positions' ? (
                <InventoryPositionsTable
                  positions={items.filter(
                    (row): row is InventoryPosition => 'eligibilityReason' in row,
                  )}
                  isLoading={isLoading}
                  emptyMessage={emptyMessage}
                />
              ) : (
                <DataTable
                  ariaLabel={t(kind)}
                  columns={columns}
                  data={items}
                  isLoading={isLoading}
                  getRowKey={(row) => row.id}
                  emptyMessage={emptyMessage}
                />
              )}
            </div>
          )}
          {!isLoading && items.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sc-border-default)] px-4 py-3">
              <span role="status" className="text-xs text-[var(--sc-text-secondary)]">
                {common('loadedRows', { count: items.length })}
              </span>
              {hasNext && (
                <Button
                  variant="outline"
                  size="sm"
                  isLoading={isLoadingMore}
                  onClick={() => void loadMore()}
                >
                  {t('loadMore')}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
