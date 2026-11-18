export interface CarrierDisplayInfo {
  code: string;
  name: string;
  trackingUrl: string | null;
  badgeClass: string;
}

export function getCarrierDisplayInfo(
  carrierCode: string | null | undefined,
  trackingNumber: string | null | undefined,
): CarrierDisplayInfo {
  const code = (carrierCode ?? '').toUpperCase().trim();
  const tracking = (trackingNumber ?? '').trim();

  if (code === 'GHTK') {
    return {
      code: 'GHTK',
      name: 'Giao Hàng Tiết Kiệm',
      trackingUrl: tracking ? `https://i.ghtk.vn/${encodeURIComponent(tracking)}` : null,
      badgeClass:
        'bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    };
  }

  if (code === 'GHN') {
    return {
      code: 'GHN',
      name: 'Giao Hàng Nhanh',
      trackingUrl: tracking
        ? `https://donhang.ghn.vn/?order_code=${encodeURIComponent(tracking)}`
        : null,
      badgeClass:
        'bg-orange-50 text-orange-800 border border-orange-300 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800',
    };
  }

  if (
    code === 'VTP' ||
    code === 'VIETTEL' ||
    code === 'VIETTELPOST' ||
    code === 'VIETTEL_POST'
  ) {
    return {
      code: 'Viettel Post',
      name: 'Viettel Post',
      trackingUrl: tracking
        ? `https://viettelpost.vn/tra-cuu-hanh-trinh-don/?order_number=${encodeURIComponent(tracking)}`
        : null,
      badgeClass:
        'bg-rose-50 text-rose-800 border border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
    };
  }

  return {
    code: carrierCode || 'N/A',
    name: carrierCode || 'Chưa xác định',
    trackingUrl: null,
    badgeClass:
      'bg-slate-50 text-slate-700 border border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800',
  };
}

export function getJourneyBadgeProps(status: string): {
  status: 'success' | 'warning' | 'error' | 'info' | 'default';
  dotColor: string;
} {
  switch (status) {
    case 'DELIVERED':
      return { status: 'success', dotColor: 'bg-emerald-500' };
    case 'OUT_FOR_DELIVERY':
      return { status: 'warning', dotColor: 'bg-amber-500' };
    case 'IN_TRANSIT':
      return { status: 'info', dotColor: 'bg-blue-500' };
    case 'PICKED_UP':
      return { status: 'info', dotColor: 'bg-cyan-500' };
    case 'DELIVERY_FAILED':
      return { status: 'error', dotColor: 'bg-rose-500' };
    case 'RETURNING':
    case 'RETURNED':
      return { status: 'warning', dotColor: 'bg-orange-500' };
    case 'CANCELLED':
      return { status: 'default', dotColor: 'bg-gray-400' };
    case 'LABEL_CREATED':
    default:
      return { status: 'default', dotColor: 'bg-slate-400' };
  }
}
