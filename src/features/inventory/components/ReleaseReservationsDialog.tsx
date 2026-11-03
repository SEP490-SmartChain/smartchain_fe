import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import Modal from '@/components/Common/Modal/Modal';
import { formatFulfillmentOrderCode } from '@/lib/fulfillmentOrderCode';

import { useReleaseReservations } from '../hooks/useReleaseReservations';

import type { ActiveReservation } from '../types/inventoryReservation.types';

interface ReleaseReservationsDialogProps {
  /** Dòng người dùng bấm Release; `null` = hộp đóng. */
  target: ActiveReservation | null;
  onClose: () => void;
  /** Dữ liệu trên bảng đã cũ: nhả thành công hoặc đơn con không còn giữ hàng. */
  onChanged: () => void;
}

export function ReleaseReservationsDialog({
  target,
  onClose,
  onChanged,
}: ReleaseReservationsDialogProps) {
  const t = useTranslations('Inventory');
  const { items, isLoadingItems, itemsError, isReleasing, isUnavailable, release } =
    useReleaseReservations(target?.fulfillmentOrderId ?? null);

  const orderCode = target
    ? formatFulfillmentOrderCode(target.parentOrderCode, target.fulfillmentSequenceNo)
    : '';
  const hasNothingToRelease = !isLoadingItems && itemsError === null && items.length === 0;
  const shouldShowUnavailable = isUnavailable || hasNothingToRelease;

  const handleConfirm = async () => {
    const outcome = await release();
    if (outcome.status === 'released') {
      toast.success(
        t('releaseSuccess', {
          order: orderCode,
          count: outcome.result.releasedReservations.length,
        }),
      );
      onChanged();
      onClose();
    } else if (outcome.status === 'unavailable') {
      onChanged();
    }
  };

  return (
    <Modal
      isOpen={target !== null}
      onClose={onClose}
      title={t('releaseDialogTitle', { order: orderCode })}
      width="520px"
    >
      <div className="space-y-4">
        {shouldShowUnavailable ? (
          <Alert variant="warning" title={t('reservationUnavailable')} />
        ) : (
          <p className="m-0 text-sm text-[var(--sc-text-secondary)]">
            {t('releaseDialogDescription', { order: orderCode })}
          </p>
        )}

        {itemsError && <Alert variant="error" title={t('releaseItemsLoadError')} />}

        {isLoadingItems ? (
          <span
            aria-hidden="true"
            className="block h-16 animate-pulse rounded-lg bg-[var(--sc-bg-secondary)]"
          />
        ) : (
          items.length > 0 && (
            <ul aria-label={t('releaseItemsLabel')} className="m-0 list-none space-y-2 p-0">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--sc-border-default)] px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium text-[var(--sc-text-primary)]">{item.sku}</span>
                    <span className="truncate text-xs text-[var(--sc-text-secondary)]">
                      {item.productName}
                    </span>
                  </span>
                  <span className="shrink-0 text-[var(--sc-text-primary)]">
                    {t('releaseItemQty', { qty: item.qty })}
                  </span>
                </li>
              ))}
            </ul>
          )
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant="danger"
            isLoading={isReleasing}
            disabled={shouldShowUnavailable || isLoadingItems || itemsError !== null}
            onClick={() => void handleConfirm()}
          >
            {t('releaseConfirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
