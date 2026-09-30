import { useCallback, useEffect, useMemo, useState } from 'react';

import { RefreshCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import { useAccess } from '@/hooks/useAccess';
import { formatFulfillmentOrderCode } from '@/lib/fulfillmentOrderCode';
import { secondsUntil } from '@/lib/reservationTtl';

import { ReleaseReservationsDialog } from './ReleaseReservationsDialog';
import { ReservationTtlBadge } from './ReservationTtlBadge';
import { useActiveReservations } from '../hooks/useActiveReservations';
import { useReservationSummary } from '../hooks/useReservationSummary';

import type { ActiveReservation, ActiveReservationRow } from '../types/inventoryReservation.types';

const PAGE_SIZE = 10;
/** Nhịp đếm ngược TTL trên bảng. */
const COUNTDOWN_TICK_MS = 1000;
/** Số ký tự đầu của mã reservation hiển thị; mã đầy đủ nằm ở tooltip. */
const SHORT_ID_LENGTH = 8;

export function ActiveReservationsPanel() {
  const t = useTranslations('Inventory');
  const locale = useLocale();
  const { can } = useAccess();
  const { reservations, error, isLoading, hasNextPage, refetch, loadMore } =
    useActiveReservations();
  const { summary, error: summaryError, refetch: refetchSummary } = useReservationSummary();
  const [currentPage, setCurrentPage] = useState(1);
  const [releaseTarget, setReleaseTarget] = useState<ActiveReservation | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), COUNTDOWN_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const loadedPageCount = Math.max(1, Math.ceil(reservations.length / PAGE_SIZE));
  const totalPages = loadedPageCount + (hasNextPage ? 1 : 0);
  const visibleReservations = reservations.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const canRelease = can('inventory.reservations.release');

  // Panel render lại mỗi giây vì đồng hồ đếm ngược; `Modal` chạy lại effect (trả focus rồi
  // focus khung hộp) mỗi khi `onClose` đổi tham chiếu — giữ ổn định để không giật focus bàn phím.
  const handleCloseReleaseDialog = useCallback(() => setReleaseTarget(null), []);

  const handleRefresh = () => {
    setCurrentPage(1);
    void refetch();
    void refetchSummary();
  };

  const handlePageChange = async (page: number) => {
    if (page > loadedPageCount && hasNextPage) await loadMore();
    setCurrentPage(page);
  };

  const columns: ColumnDef<ActiveReservationRow>[] = [
    {
      key: 'id',
      label: t('columnReservationId'),
      render: (row) => (
        <span className="font-mono text-xs" title={row.id}>
          {row.id.slice(0, SHORT_ID_LENGTH)}
        </span>
      ),
    },
    {
      key: 'fulfillmentOrder',
      label: t('columnFulfillmentOrder'),
      render: (row) => formatFulfillmentOrderCode(row.parentOrderCode, row.fulfillmentSequenceNo),
    },
    {
      key: 'sku',
      label: t('columnSku'),
      render: (row) => (
        <span className="flex flex-col">
          <span className="font-medium">{row.sku}</span>
          <span className="text-xs text-[var(--sc-text-secondary)]">{row.productName}</span>
        </span>
      ),
    },
    {
      key: 'warehouse',
      label: t('columnWarehouse'),
      render: (row) => (
        <span className="flex flex-col">
          <span className="font-medium">{row.warehouseCode}</span>
          <span className="text-xs text-[var(--sc-text-secondary)]">{row.warehouseName}</span>
        </span>
      ),
    },
    {
      key: 'qty',
      label: t('columnReservedQty'),
      render: (row) => numberFormatter.format(row.qty),
    },
    {
      key: 'ttl',
      label: t('columnTtl'),
      render: (row) => (
        <ReservationTtlBadge remainingSeconds={secondsUntil(row.deadlineMs, nowMs)} />
      ),
    },
    ...(canRelease
      ? [
          {
            key: 'action',
            label: t('columnAction'),
            render: (row: ActiveReservationRow) => (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={secondsUntil(row.deadlineMs, nowMs) <= 0}
                aria-label={t('releaseAction', {
                  order: formatFulfillmentOrderCode(row.parentOrderCode, row.fulfillmentSequenceNo),
                })}
                onClick={() => setReleaseTarget(row)}
              >
                {t('release')}
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="m-0 text-lg font-medium leading-6 text-[var(--sc-text-primary)]">
            {t('reservationsTitle')}
          </h1>
          {summary && (
            <Badge
              status="info"
              label={t('reservationsCount', { count: summary.activeReservations })}
            />
          )}
          {summaryError && <Badge status="warning" label={t('reservationsSummaryError')} />}
        </div>
        <Button type="button" size="sm" variant="outline" onClick={handleRefresh}>
          <RefreshCw size={14} aria-hidden="true" />
          {t('refresh')}
        </Button>
      </header>

      {error ? (
        <Alert variant="error" title={t('reservationsLoadError')}>
          <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
            {t('retry')}
          </Button>
        </Alert>
      ) : (
        <section className="sc-surface overflow-hidden" aria-label={t('reservationsTableLabel')}>
          <DataTable
            ariaLabel={t('reservationsTableLabel')}
            columns={columns}
            data={visibleReservations}
            isLoading={isLoading}
            getRowKey={(row) => row.id}
            emptyMessage={t('reservationsEmpty')}
            pagination={{
              currentPage: Math.min(currentPage, totalPages),
              totalPages,
              onPageChange: (page) => void handlePageChange(page),
            }}
          />
        </section>
      )}

      <ReleaseReservationsDialog
        target={releaseTarget}
        onClose={handleCloseReleaseDialog}
        onChanged={handleRefresh}
      />
    </div>
  );
}
