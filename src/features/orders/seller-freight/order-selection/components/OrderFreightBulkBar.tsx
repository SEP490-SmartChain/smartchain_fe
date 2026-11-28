import { useTranslations } from 'next-intl';

import { Alert, Button } from '@/components/Common';

import type { OrderFreightBatchProgress } from '../model/orderFreightCoordinator';

export function OrderFreightBulkBar({
  selectedCount,
  canQuote,
  progress,
  onLookupSelected,
  onClearSelection,
}: {
  readonly selectedCount: number;
  readonly canQuote: boolean;
  readonly progress: OrderFreightBatchProgress;
  readonly onLookupSelected: () => void;
  readonly onClearSelection: () => void;
}) {
  const t = useTranslations('Orders.freight');
  if (!canQuote || (selectedCount === 0 && !progress.running)) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-4 py-2.5"
      data-testid="order-freight-bulk-bar"
    >
      <div className="space-y-0.5 text-sm">
        <span className="font-medium text-[var(--sc-text-primary)]">
          {t('bulkSelected', { count: selectedCount })}
        </span>
        {progress.running && (
          <p className="text-xs tabular-nums text-[var(--sc-text-secondary)]" role="status">
            {t('bulkProgress', { done: progress.completedOrders, total: progress.totalOrders })}
            {progress.rateLimitedRetrySeconds
              ? ` · ${t('bulkRetry', { seconds: progress.rateLimitedRetrySeconds })}`
              : ''}
          </p>
        )}
        {!progress.running && progress.failedOrderIds.length > 0 && (
          <Alert variant="warning">
            {t('bulkFailed', { count: progress.failedOrderIds.length })}
          </Alert>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="primary"
          isLoading={progress.running}
          disabled={selectedCount === 0 || progress.running}
          onClick={onLookupSelected}
        >
          {t('bulkButton', { count: selectedCount })}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={progress.running}
          onClick={onClearSelection}
        >
          {t('bulkClear')}
        </Button>
      </div>
    </div>
  );
}
