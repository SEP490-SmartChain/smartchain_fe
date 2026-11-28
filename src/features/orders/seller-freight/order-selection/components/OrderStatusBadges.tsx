import { useEffect, useState } from 'react';

import { Check, Copy } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { ParcelFreight } from '../../shared';

export type OrderBadgeTone = 'default' | 'info' | 'success' | 'warning' | 'error';

const TONE_STYLES: Readonly<Record<OrderBadgeTone, { pill: string; dot: string }>> = {
  default: {
    pill: 'border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)]',
    dot: 'bg-[var(--sc-text-tertiary)]',
  },
  info: {
    pill: 'border-[var(--sc-info-border)] bg-[var(--sc-info-bg)] text-[var(--sc-info-dark)]',
    dot: 'bg-[var(--sc-info)]',
  },
  success: {
    pill: 'border-[var(--sc-success-border)] bg-[var(--sc-success-bg)] text-[var(--sc-success-dark)]',
    dot: 'bg-[var(--sc-success)]',
  },
  warning: {
    pill: 'border-[var(--sc-warning-border)] bg-[var(--sc-warning-bg)] text-[var(--sc-warning-dark)]',
    dot: 'bg-[var(--sc-warning)]',
  },
  error: {
    pill: 'border-[var(--sc-error-border)] bg-[var(--sc-error-bg)] text-[var(--sc-error-dark)]',
    dot: 'bg-[var(--sc-error)]',
  },
};

export function resolveOrderLifecycleTone(status: string): OrderBadgeTone {
  if (['DELIVERED', 'COMPLETED'].includes(status)) {
    return 'success';
  }
  if (
    [
      'ALLOCATING',
      'ALLOCATED',
      'PACKED',
      'DISPATCHED',
      'IN_TRANSIT',
      'PICKED_UP',
      'OUT_FOR_DELIVERY',
    ].includes(status)
  ) {
    return 'info';
  }
  if (
    [
      'PARTIALLY_DELIVERED',
      'COMPLETED_WITH_EXCEPTION',
      'ON_HOLD',
      'BACKORDER',
      'MANUAL_REVIEW',
      'LABEL_VERIFYING',
      'RETURN_PENDING',
      'RETURNING',
      'RETURNED',
    ].includes(status)
  ) {
    return 'warning';
  }
  if (['FAILED', 'ALLOCATION_FAILED', 'DISPATCH_FAILED', 'DELIVERY_FAILED'].includes(status)) {
    return 'error';
  }
  return 'default';
}

function resolveFreightStateTone(state: ParcelFreight['state']): OrderBadgeTone {
  switch (state) {
    case 'RECORDED':
      return 'success';
    case 'ESTIMATED':
    case 'BOOKING_PENDING':
      return 'info';
    case 'NEEDS_INPUT':
    case 'UNAVAILABLE':
      return 'warning';
    case 'RECORDED_FEE_MISSING':
      return 'error';
    case 'NOT_QUOTED':
    case 'NOT_APPLICABLE':
    default:
      return 'default';
  }
}

export function OrderLifecycleBadge({
  status,
  label,
}: {
  readonly status: string;
  readonly label: string;
}) {
  const tone = resolveOrderLifecycleTone(status);
  const style = TONE_STYLES[tone];
  return (
    <span
      data-order-status={status}
      data-tone={tone}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium leading-4',
        style.pill,
      )}
    >
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} />
      {label}
    </span>
  );
}

export function FreightStateBadge({
  state,
  label,
  variant = 'pill',
}: {
  readonly state: ParcelFreight['state'];
  readonly label: string;
  readonly variant?: 'pill' | 'dot';
}) {
  const tone = resolveFreightStateTone(state);
  const style = TONE_STYLES[tone];

  if (variant === 'dot') {
    return (
      <span
        data-freight-state={state}
        data-tone={tone}
        className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-[var(--sc-text-secondary)]"
      >
        <span aria-hidden="true" className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} />
        {label}
      </span>
    );
  }

  return (
    <span
      data-freight-state={state}
      data-tone={tone}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium leading-4',
        style.pill,
      )}
    >
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} />
      {label}
    </span>
  );
}

export function WaybillTrackingChip({
  trackingNumber,
  carrierCode,
  compact = false,
}: {
  readonly trackingNumber: string;
  readonly carrierCode?: string | null;
  readonly compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(trackingNumber);
      }
      setCopied(true);
    } catch {
      // Clipboard API unavailable in restricted contexts; ignore silently.
    }
  };

  return (
    <span
      data-testid={`waybill-chip-${trackingNumber}`}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-md border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]',
        compact ? 'px-2 py-0.5' : 'px-2.5 py-1',
      )}
    >
      {carrierCode && (
        <span className="shrink-0 text-[11px] font-semibold text-[var(--sc-text-secondary)]">
          {carrierCode} ·
        </span>
      )}
      <span className="truncate font-mono text-xs font-medium text-[var(--sc-text-primary)]">
        {trackingNumber}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Sao chép mã vận đơn ${trackingNumber}`}
        title={copied ? 'Đã sao chép' : 'Sao chép mã vận đơn'}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--sc-text-tertiary)] transition-colors hover:bg-[var(--sc-bg-surface)] hover:text-[var(--sc-primary-dark)] focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)]"
      >
        {copied ? (
          <Check size={12} aria-hidden="true" className="text-[var(--sc-primary)]" />
        ) : (
          <Copy size={12} aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
