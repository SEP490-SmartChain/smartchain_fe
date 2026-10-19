import { useEffect, useRef, useState } from 'react';

import { ChartNoAxesCombined } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert, Button } from '@/components/Common';
import { useAuthStore } from '@/stores/authStore';

import { asnApi } from '../api/asnApi';

import type { AllocationSuggestion } from '../types/asn.types';

interface Props {
  productId: string;
  quantity: number;
  expiry?: string;
  disabled: boolean;
  onChoose: (warehouseId: string, quantity: number) => void;
}
export function AsnAllocationSuggestion({
  productId,
  quantity,
  expiry,
  disabled,
  onChoose,
}: Props) {
  const t = useTranslations('Replenishment');
  const user = useAuthStore((s) => s.user),
    revision = useAuthStore((s) => s.revision);
  const key = JSON.stringify([productId, quantity, expiry, user, revision]);
  const [result, setResult] = useState<{ key: string; data: AllocationSuggestion } | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setResult(null);
    setError(false);
    setLoading(false);
    request.current?.abort();
    return () => request.current?.abort();
  }, [key]);
  async function load() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(false);
    setResult(null);
    try {
      const data = await asnApi.getAllocationSuggestion(
        { productId, totalQuantity: quantity, declaredExpiryOn: expiry || undefined },
        controller.signal,
      );
      if (!controller.signal.aborted && user === useAuthStore.getState().user) {
        setResult({ key, data });
      }
    } catch {
      if (!controller.signal.aborted && user === useAuthStore.getState().user) setError(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  const data = result?.key === key ? result.data : null;
  return (
    <section
      className="mt-4 space-y-3 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-4"
      aria-label={t('title')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="m-0 flex items-center gap-2 text-sm font-semibold">
            <ChartNoAxesCombined size={18} aria-hidden="true" />
            {t('title')}
          </h3>
          <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">{t('description')}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          isLoading={loading}
          disabled={
            disabled ||
            !productId ||
            !Number.isSafeInteger(quantity) ||
            quantity < 1 ||
            quantity > 1000000
          }
          onClick={() => void load()}
        >
          {t('calculate')}
        </Button>
      </div>
      {error && <Alert variant="error" title={t('loadError')} />}
      {data && (
        <div aria-live="polite" className="space-y-3">
          <p className="m-0 text-xs text-[var(--sc-text-secondary)]">
            {data.hasSufficientHistory ? t('historical') : t('baseline')}
          </p>
          {data.unallocatedQuantity > 0 && (
            <Alert
              variant="warning"
              title={t('unallocated', { quantity: data.unallocatedQuantity })}
            />
          )}
          {data.daysUntilExpiry === 0 && <Alert variant="warning" title={t('expired')} />}
          {data.allocations.length === 0 && <p>{t('noWarehouses')}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {data.allocations.map((row) => (
              <div
                key={row.warehouseId}
                className="rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)] p-3"
              >
                <div className="flex justify-between gap-2">
                  <span className="text-sm font-semibold">{row.warehouseCode}</span>
                  <span className="text-xs text-[var(--sc-text-secondary)]">
                    {row.sharePercent.toFixed(1)}%
                  </span>
                </div>
                <p className="mb-2 mt-1 text-xs text-[var(--sc-text-secondary)]">
                  {row.warehouseName}
                </p>
                <p className="m-0 text-lg font-semibold text-[var(--sc-primary-dark)]">
                  {t('units', { quantity: row.suggestedQty })}
                </p>
                <p className="my-2 text-xs text-[var(--sc-text-secondary)]">
                  {t('velocity', { quantity: row.dailyVelocity.toFixed(2) })}
                  {row.maxSellableBeforeExpiry !== null &&
                    ` · ${t('cap', { quantity: row.maxSellableBeforeExpiry })}`}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled || row.suggestedQty === 0}
                  onClick={() => onChoose(row.warehouseId, row.suggestedQty)}
                >
                  {t('choose')}
                </Button>
              </div>
            ))}
          </div>
          <p className="m-0 text-xs text-[var(--sc-text-secondary)]">{t('confirmation')}</p>
        </div>
      )}
    </section>
  );
}
