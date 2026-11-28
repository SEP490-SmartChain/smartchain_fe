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
  if (!canQuote || (selectedCount === 0 && !progress.running)) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-surface-raised)] px-4 py-2.5"
      data-testid="order-freight-bulk-bar"
    >
      <div className="space-y-0.5 text-sm">
        <span className="font-medium text-[var(--sc-text-primary)]">
          Đã chọn {selectedCount} đơn
        </span>
        {progress.running && (
          <p className="text-xs tabular-nums text-[var(--sc-text-secondary)]" role="status">
            Đang tra cước: {progress.completedOrders}/{progress.totalOrders} đơn
            {progress.rateLimitedRetrySeconds
              ? ` · Tạm đợi ${progress.rateLimitedRetrySeconds}s theo giới hạn tần suất...`
              : ''}
          </p>
        )}
        {!progress.running && progress.failedOrderIds.length > 0 && (
          <Alert variant="warning">
            {progress.failedOrderIds.length} đơn chưa tra được do gián đoạn tạm thời. Các dòng đã
            ghi nhận vẫn được giữ nguyên.
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
          Tra cước đã chọn ({selectedCount})
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={progress.running}
          onClick={onClearSelection}
        >
          Bỏ chọn
        </Button>
      </div>
    </div>
  );
}
