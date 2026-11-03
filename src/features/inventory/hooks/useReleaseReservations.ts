import { useCallback, useEffect, useState } from 'react';

import { toast } from 'sonner';

import {
  inventoryReservationApi,
  isReservationUnavailableError,
} from '../api/inventoryReservationApi';

import type {
  ActiveReservation,
  ReleaseReservationsResult,
} from '../types/inventoryReservation.types';

export type ReleaseOutcome =
  | { status: 'released'; result: ReleaseReservationsResult }
  | { status: 'unavailable' }
  | { status: 'failed' };

/** Danh sách SKU đã tải xong, gắn với đúng đơn con mà nó được tải cho. */
interface ReleasePreview {
  fulfillmentOrderId: string;
  items: ActiveReservation[];
  error: Error | null;
}

/** SKU mà đơn con đang giữ (hiển thị trong hộp xác nhận) và thao tác nhả hàng. */
export function useReleaseReservations(fulfillmentOrderId: string | null) {
  const [preview, setPreview] = useState<ReleasePreview | null>(null);
  const [unavailableFulfillmentOrderId, setUnavailableFulfillmentOrderId] = useState<string | null>(
    null,
  );
  const [isReleasing, setIsReleasing] = useState(false);

  useEffect(() => {
    if (fulfillmentOrderId === null) {
      setPreview(null);
      setUnavailableFulfillmentOrderId(null);
      return;
    }

    let isCurrent = true;
    inventoryReservationApi
      .list({ fulfillmentOrderId })
      .then((page) => {
        if (isCurrent) setPreview({ fulfillmentOrderId, items: page.items, error: null });
      })
      .catch((failure: unknown) => {
        if (isCurrent) {
          setPreview({
            fulfillmentOrderId,
            items: [],
            error: failure instanceof Error ? failure : new Error(String(failure)),
          });
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [fulfillmentOrderId]);

  // Suy ra từ đơn đang mở thay vì cờ loading riêng: lần render đầu sau khi mở hộp phải là
  // "đang tải", không được mang trạng thái "không còn gì để nhả" của lần mở trước.
  const currentPreview = preview?.fulfillmentOrderId === fulfillmentOrderId ? preview : null;
  const isLoadingItems = fulfillmentOrderId !== null && currentPreview === null;
  const isUnavailable =
    fulfillmentOrderId !== null && unavailableFulfillmentOrderId === fulfillmentOrderId;

  const release = useCallback(async (): Promise<ReleaseOutcome> => {
    if (fulfillmentOrderId === null) return { status: 'failed' };
    setIsReleasing(true);
    try {
      return {
        status: 'released',
        result: await inventoryReservationApi.release(fulfillmentOrderId),
      };
    } catch (failure) {
      if (isReservationUnavailableError(failure)) {
        setUnavailableFulfillmentOrderId(fulfillmentOrderId);
        return { status: 'unavailable' };
      }
      toast.error(failure instanceof Error ? failure.message : String(failure));
      return { status: 'failed' };
    } finally {
      setIsReleasing(false);
    }
  }, [fulfillmentOrderId]);

  return {
    items: currentPreview?.items ?? [],
    isLoadingItems,
    itemsError: currentPreview?.error ?? null,
    isReleasing,
    isUnavailable,
    release,
  };
}
