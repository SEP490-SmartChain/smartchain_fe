import type { ReactNode } from 'react';

import { ChevronRight, Info, MapPin } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Badge } from '@/components/Common/Badge/Badge';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';

import type { InventoryPosition } from '../api/inventoryDetailApi';

interface InventoryPositionsTableProps {
  positions: InventoryPosition[];
  isLoading: boolean;
  emptyMessage: ReactNode;
}

function PositionProduct({ row }: { row: InventoryPosition }) {
  const t = useTranslations('InventoryDetail');
  const shortLot =
    row.lotCode && row.lotCode.length > 24
      ? `${row.lotCode.slice(0, 12)}…${row.lotCode.slice(-6)}`
      : row.lotCode;

  return (
    <div className="min-w-0 space-y-1.5 lg:min-w-40 lg:max-w-64">
      <p className="m-0 break-words text-sm font-semibold">{row.productName || row.sku}</p>
      <p className="m-0 break-all text-xs text-[var(--sc-text-secondary)]">
        {t('sku')}: {row.sku}
      </p>
      <details className="group pt-1 text-xs">
        <summary
          aria-label={t('lotDetailsLabel', { code: row.lotCode ?? t('missingLot') })}
          title={row.lotCode ?? undefined}
          className="flex w-fit max-w-full list-none items-center gap-1 rounded text-[var(--sc-primary-dark)] focus-visible:shadow-[var(--sc-shadow-focus)] focus-visible:outline-none [&::-webkit-details-marker]:hidden"
        >
          <ChevronRight size={13} aria-hidden="true" className="shrink-0 group-open:rotate-90" />
          <span className="min-w-0 truncate">
            {shortLot ? t('lotSummary', { code: shortLot }) : t('lotDetails')}
          </span>
        </summary>
        <dl className="mb-0 mt-2 space-y-2 rounded-lg bg-[var(--sc-bg-secondary)] p-3">
          <div>
            <dt className="text-[var(--sc-text-secondary)]">{t('lotCode')}</dt>
            <dd className="m-0 mt-1 break-all font-mono leading-5">
              {row.lotCode ?? t('missingLot')}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--sc-text-secondary)]">{t('lotStatus')}</dt>
            <dd className="m-0 mt-1">
              {row.lotStatus
                ? t.has(`lotState.${row.lotStatus}`)
                  ? t(`lotState.${row.lotStatus}`)
                  : row.lotStatus
                : t('missingLotStatus')}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--sc-text-secondary)]">{t('status')}</dt>
            <dd className="m-0 mt-1">{t(`state.${row.stockState}`)}</dd>
          </div>
        </dl>
      </details>
    </div>
  );
}

function PositionLocation({ row }: { row: InventoryPosition }) {
  const t = useTranslations('InventoryDetail');
  const locale = useLocale();
  const expiry = row.expiresOn
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
        new Date(row.expiresOn),
      )
    : t('noExpiry');

  return (
    <div className="min-w-0 space-y-1.5 text-xs lg:min-w-36">
      <p className="m-0 flex items-start gap-1.5 text-sm font-medium">
        <MapPin
          size={15}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-[var(--sc-text-secondary)]"
        />
        <span className="break-all">{row.binCode ?? t('missingBin')}</span>
      </p>
      <p className="m-0 break-words text-[var(--sc-text-secondary)]">
        {t('warehouse')}: {row.warehouseCode}
      </p>
      <p className="m-0 leading-5 text-[var(--sc-text-secondary)]">
        {t('expiry')}: {expiry}
      </p>
    </div>
  );
}

function PositionQuantity({ row }: { row: InventoryPosition }) {
  const t = useTranslations('InventoryDetail');
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale);
  const quantities = [
    { key: 'onHand', value: row.onHandQty },
    { key: 'held', value: row.reservedQty },
    { key: 'unreserved', value: row.availableQty },
  ];

  return (
    <dl className="m-0 grid min-w-48 grid-cols-3 divide-x divide-[var(--sc-border-default)] rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] py-2.5 text-center tabular-nums">
      {quantities.map(({ key, value }) => (
        <div key={key} className="px-2">
          <dt className="whitespace-nowrap text-xs text-[var(--sc-text-secondary)]">{t(key)}</dt>
          <dd className="m-0 mt-1 text-base font-semibold">{number.format(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function PositionEligibility({ row }: { row: InventoryPosition }) {
  const t = useTranslations('InventoryDetail');
  const reason = row.eligibilityReason;

  return (
    <div className="min-w-0 space-y-2 lg:min-w-44 lg:max-w-64">
      <Badge
        status={
          reason === 'ELIGIBLE'
            ? 'success'
            : reason === 'BLOCKED' || reason === 'SHELF_LIFE'
              ? 'error'
              : 'warning'
        }
        label={t(`eligibilityLabel.${reason}`)}
      />
      <p className="m-0 text-xs leading-5 text-[var(--sc-text-secondary)]">
        {t(`eligibilityReason.${reason}`)}
      </p>
      {row.stockState !== 'SELLABLE' && (
        <p className="m-0 text-xs text-[var(--sc-text-secondary)]">
          {t('status')}: {t(`positionState.${row.stockState}`)}
        </p>
      )}
    </div>
  );
}

export function InventoryPositionsTable({
  positions,
  isLoading,
  emptyMessage,
}: InventoryPositionsTableProps) {
  const t = useTranslations('InventoryDetail');
  const common = useTranslations('Inventory');
  const columns: ColumnDef<InventoryPosition>[] = [
    {
      key: 'productName',
      label: common('product'),
      render: (row) => <PositionProduct row={row} />,
    },
    { key: 'binCode', label: t('locationExpiry'), render: (row) => <PositionLocation row={row} /> },
    { key: 'onHandQty', label: t('quantity'), render: (row) => <PositionQuantity row={row} /> },
    {
      key: 'eligibilityReason',
      label: t('outbound'),
      render: (row) => <PositionEligibility row={row} />,
    },
  ];

  return (
    <>
      <div className="flex items-start gap-2 border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] px-4 py-3 text-xs leading-5 text-[var(--sc-text-secondary)]">
        <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
        <p className="m-0">{t('quantityHint')}</p>
      </div>
      <div className={isLoading || !positions.length ? '' : 'hidden lg:block'}>
        <DataTable
          ariaLabel={t('positions')}
          columns={columns}
          data={positions}
          isLoading={isLoading}
          getRowKey={(row) => row.id}
          emptyMessage={emptyMessage}
        />
      </div>
      {!isLoading && positions.length > 0 && (
        <ul
          aria-label={t('positions')}
          className="divide-y divide-[var(--sc-border-default)] lg:hidden"
        >
          {positions.map((row) => (
            <li key={row.id} className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-4">
                <PositionProduct row={row} />
                <PositionLocation row={row} />
              </div>
              <PositionQuantity row={row} />
              <div className="border-t border-[var(--sc-border-default)] pt-3">
                <PositionEligibility row={row} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
