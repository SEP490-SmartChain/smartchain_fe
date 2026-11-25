import { ArrowRight, CircleCheck } from 'lucide-react';

import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { cn } from '@/lib/utils';

export interface LivePaymentSuccessBannerProps {
  readonly status: 'POSTED' | 'ACTIVATED';
  readonly invoiceNumber?: string | null;
  readonly amountVnd?: number | string | null;
  readonly receiptId?: string | null;
  readonly locale?: 'vi' | 'en';
  readonly onContinue?: () => void;
  readonly continueLabel?: string;
  readonly title?: string;
  readonly description?: string;
  readonly badgeLabel?: string;
  readonly className?: string;
}

interface CopyBundle {
  readonly badge: string;
  readonly title: string;
  readonly description: string;
  readonly continueLabel: string;
  readonly invoiceLabel: string;
  readonly amountLabel: string;
  readonly receiptLabel: string;
}

function resolveCopy(status: 'POSTED' | 'ACTIVATED', locale: 'vi' | 'en'): CopyBundle {
  if (locale === 'en') {
    return status === 'ACTIVATED'
      ? {
          badge: 'Service Activated',
          title: 'Payment succeeded — Service activated automatically',
          description:
            'Your payment is confirmed and workspace menus are unlocked immediately without reloading.',
          continueLabel: 'Continue to workspace',
          invoiceLabel: 'Invoice',
          amountLabel: 'Amount paid',
          receiptLabel: 'Receipt ID',
        }
      : {
          badge: 'Payment Confirmed',
          title: 'Payment confirmed — Completing service activation',
          description:
            'SePay transfer reconciled automatically. Your service status will unlock shortly without reloading.',
          continueLabel: 'View payment details',
          invoiceLabel: 'Invoice',
          amountLabel: 'Amount paid',
          receiptLabel: 'Receipt ID',
        };
  }

  return status === 'ACTIVATED'
    ? {
        badge: 'Đã kích hoạt dịch vụ',
        title: 'Thanh toán thành công — Đã tự động kích hoạt dịch vụ',
        description:
          'Giao dịch đã được xác nhận và mở khóa toàn bộ tính năng vận hành ngay lập tức không cần tải lại trang.',
        continueLabel: 'Bắt đầu vận hành ngay',
        invoiceLabel: 'Số hóa đơn',
        amountLabel: 'Số tiền đã thanh toán',
        receiptLabel: 'Mã biên nhận',
      }
    : {
        badge: 'Đã ghi nhận thanh toán',
        title: 'Thanh toán đã ghi nhận — Đang hoàn tất kích hoạt',
        description:
          'Giao dịch SePay đã được đối soát tự động. Trạng thái dịch vụ sẽ tự động mở khóa trong giây lát.',
        continueLabel: 'Xem chi tiết hóa đơn',
        invoiceLabel: 'Số hóa đơn',
        amountLabel: 'Số tiền đã thanh toán',
        receiptLabel: 'Mã biên nhận',
      };
}

function formatVndAmount(
  amountVnd: number | string | null | undefined,
  locale: 'vi' | 'en',
): string | null {
  if (amountVnd === null || amountVnd === undefined) {
    return null;
  }
  const numberLocale = locale === 'vi' ? 'vi-VN' : 'en-US';
  if (typeof amountVnd === 'number') {
    if (!Number.isFinite(amountVnd)) {
      return null;
    }
    return `${new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0 }).format(amountVnd)} VND`;
  }
  const trimmed = amountVnd.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (/^-?\d+$/.test(trimmed)) {
    return `${BigInt(trimmed).toLocaleString(numberLocale)} VND`;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return `${new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0 }).format(parsed)} VND`;
}

/**
 * Accessible zero-reload payment confirmation and service activation banner for Flow 10.
 */
export function LivePaymentSuccessBanner({
  status,
  invoiceNumber,
  amountVnd,
  receiptId,
  locale = 'vi',
  onContinue,
  continueLabel,
  title,
  description,
  badgeLabel,
  className,
}: LivePaymentSuccessBannerProps) {
  const copy = resolveCopy(status, locale);
  const formattedAmount = formatVndAmount(amountVnd, locale);
  const resolvedInvoice = invoiceNumber?.trim() || null;
  const resolvedReceipt = receiptId?.trim() || null;
  const hasMetadata = Boolean(resolvedInvoice || formattedAmount || resolvedReceipt);

  return (
    <section
      role="status"
      aria-live="polite"
      className={cn(
        'rounded-2xl border border-[var(--sc-success-border)] bg-[var(--sc-success-bg)] p-5 text-[var(--sc-text-primary)] shadow-[var(--sc-shadow-section)]',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sc-success)] text-white">
            <CircleCheck size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge status="success" label={badgeLabel ?? copy.badge} />
            </div>
            <h3 className="mt-2 text-base font-semibold text-[var(--sc-success-dark)]">
              {title ?? copy.title}
            </h3>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--sc-text-secondary)]">
              {description ?? copy.description}
            </p>
          </div>
        </div>
        {onContinue && (
          <Button type="button" variant="primary" size="sm" onClick={onContinue}>
            {continueLabel ?? copy.continueLabel}
            <ArrowRight size={14} aria-hidden="true" />
          </Button>
        )}
      </div>

      {hasMetadata && (
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {resolvedInvoice && (
            <div className="rounded-xl border border-[var(--sc-success-border)] bg-[var(--sc-bg-surface)] px-3.5 py-2.5">
              <dt className="text-xs text-[var(--sc-text-secondary)]">{copy.invoiceLabel}</dt>
              <dd className="mt-1 break-all font-mono text-sm font-semibold">{resolvedInvoice}</dd>
            </div>
          )}
          {formattedAmount && (
            <div className="rounded-xl border border-[var(--sc-success-border)] bg-[var(--sc-bg-surface)] px-3.5 py-2.5">
              <dt className="text-xs text-[var(--sc-text-secondary)]">{copy.amountLabel}</dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums text-[var(--sc-success-dark)]">
                {formattedAmount}
              </dd>
            </div>
          )}
          {resolvedReceipt && (
            <div className="rounded-xl border border-[var(--sc-success-border)] bg-[var(--sc-bg-surface)] px-3.5 py-2.5">
              <dt className="text-xs text-[var(--sc-text-secondary)]">{copy.receiptLabel}</dt>
              <dd className="mt-1 break-all font-mono text-xs font-medium">{resolvedReceipt}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
