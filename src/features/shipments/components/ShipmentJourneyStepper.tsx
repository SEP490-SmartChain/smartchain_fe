import { useMemo } from 'react';

import {
  Check,
  CheckCircle2,
  Navigation,
  Package,
  PackageCheck,
  RotateCcw,
  Truck,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';

import { cn } from '@/lib/utils';

export interface ShipmentJourneyStepperProps {
  status: string;
  bookingState: string;
  className?: string;
}

interface StepDefinition {
  key: string;
  icon: typeof Package;
  stepIndex: number;
}

const NORMAL_STEPS: readonly StepDefinition[] = [
  { key: 'created', icon: Package, stepIndex: 0 },
  { key: 'picked', icon: PackageCheck, stepIndex: 1 },
  { key: 'transit', icon: Truck, stepIndex: 2 },
  { key: 'delivering', icon: Navigation, stepIndex: 3 },
  { key: 'delivered', icon: CheckCircle2, stepIndex: 4 },
];

export function getJourneyStepIndex(status: string): number {
  switch (status) {
    case 'LABEL_CREATED':
      return 0;
    case 'PICKED_UP':
      return 1;
    case 'IN_TRANSIT':
      return 2;
    case 'OUT_FOR_DELIVERY':
      return 3;
    case 'DELIVERED':
      return 4;
    default:
      return 0;
  }
}

export function ShipmentJourneyStepper({
  status,
  bookingState,
  className,
}: ShipmentJourneyStepperProps) {
  const t = useTranslations('Shipments');

  const currentIndex = useMemo(() => getJourneyStepIndex(status), [status]);

  const isFailed = status === 'DELIVERY_FAILED';
  const isReturning = status === 'RETURNING';
  const isReturned = status === 'RETURNED';
  const isCancelled = status === 'CANCELLED' || bookingState === 'CANCELLED';
  const isBookingFailed = bookingState === 'FAILED';

  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-subtle)] p-4 sm:p-5',
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h4 className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--sc-text-secondary)]">
          {t('journey')}
        </h4>
        <span className="text-xs font-medium text-[var(--sc-text-tertiary)]">
          {isCancelled
            ? t('steps.cancelled')
            : isReturned
              ? t('steps.returned')
              : isReturning
                ? t('steps.returning')
                : isFailed
                  ? t('steps.failed')
                  : t(`journeyStatuses.${status}`)}
        </span>
      </div>

      {/* Stepper Bar */}
      <div className="relative mt-2 flex items-center justify-between">
        {NORMAL_STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isCompleted = !isCancelled && !isBookingFailed && idx < currentIndex;
          const isCurrent = !isCancelled && !isBookingFailed && idx === currentIndex;
          const isFuture = !isCancelled && !isBookingFailed && idx > currentIndex;

          return (
            <div key={step.key} className="relative z-10 flex flex-1 flex-col items-center">
              {/* Connector line between steps */}
              {idx > 0 && (
                <div
                  aria-hidden="true"
                  className={cn(
                    'absolute top-4 -left-1/2 right-1/2 h-0.5 -translate-y-1/2 transition-colors duration-200',
                    isCompleted || isCurrent ? 'bg-emerald-600' : 'bg-[var(--sc-border-default)]',
                  )}
                />
              )}

              {/* Step Circle */}
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all duration-200',
                  isCompleted &&
                    'bg-emerald-600 text-white shadow-sm ring-4 ring-emerald-100 dark:ring-emerald-950',
                  isCurrent &&
                    'bg-emerald-600 text-white ring-4 ring-emerald-200 shadow-md animate-pulse',
                  isFuture &&
                    'border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)] text-[var(--sc-text-tertiary)]',
                  (isCancelled || isBookingFailed) &&
                    'border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)] text-[var(--sc-text-tertiary)] opacity-60',
                )}
              >
                {isCompleted ? <Check size={14} strokeWidth={3} /> : <Icon size={14} />}
              </div>

              {/* Step Label */}
              <div className="mt-2 text-center">
                <p
                  className={cn(
                    'm-0 text-xs font-semibold',
                    isCurrent
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : isCompleted
                        ? 'text-[var(--sc-text-primary)]'
                        : 'text-[var(--sc-text-tertiary)]',
                  )}
                >
                  {t(`steps.${step.key}`)}
                </p>
                <p className="m-0 hidden text-[11px] text-[var(--sc-text-tertiary)] sm:block">
                  {t(`stepSubtitles.${step.key}`)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Exception Notices if any */}
      {isFailed && (
        <Alert variant="error" title={t('steps.failed')} className="mt-4">
          {t('deliveryFailedHint')}
        </Alert>
      )}

      {isReturning && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
          <RotateCcw size={15} className="shrink-0 text-amber-600" />
          <span>
            {t('steps.returning')}: Kiện hàng đang trên hành trình chuyển hoàn về lại kho gửi hàng.
          </span>
        </div>
      )}

      {isReturned && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-100 p-2.5 text-xs text-gray-800 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-300">
          <RotateCcw size={15} className="shrink-0 text-gray-600" />
          <span>
            {t('steps.returned')}: Kiện hàng đã được hoàn tất thủ tục hoàn về kho lưu trữ.
          </span>
        </div>
      )}

      {isCancelled && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <XCircle size={15} className="shrink-0 text-rose-600" />
          <span>{t('steps.cancelled')}: Vận đơn này đã được hủy trên hệ thống.</span>
        </div>
      )}
    </div>
  );
}
