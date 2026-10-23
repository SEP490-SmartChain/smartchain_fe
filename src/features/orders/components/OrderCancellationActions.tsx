import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Button, Input } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';
import { createUuid } from '@/lib/uuid';

import { orderCancellationApi, type Cancellation } from '../api/orderCancellationApi';
import { cancellationReasonSchema } from '../schemas/orderCancellationSchema';

import type { SellerOrderDetail } from '../api/ordersApi';
import type { z } from 'zod';

export function OrderCancellationActions({
  order,
  onChanged,
}: {
  order: SellerOrderDetail;
  onChanged: () => void;
}) {
  const t = useTranslations('OrderCancellation'),
    { can } = useAccess();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [cancel, setCancel] = useState<Cancellation | null>(null);
  const running = useRef(false),
    abort = useRef(new AbortController()),
    pending = useRef<{ operationId: string; expectedVersion: number; reason: string } | null>(null);
  const reason = useForm<z.infer<typeof cancellationReasonSchema>>({
    resolver: zodResolver(cancellationReasonSchema),
    defaultValues: { reason: '' },
  });
  const allowed = can('orders.cancellation.manage');
  useEffect(() => {
    const c = new AbortController();
    abort.current = c;
    return () => c.abort();
  }, []);
  async function run(action: () => Promise<void>) {
    if (running.current || !allowed) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch {
      if (!abort.current.signal.aborted) setError(t('writeError'));
    } finally {
      running.current = false;
      if (!abort.current.signal.aborted) setBusy(false);
    }
  }
  if (!allowed) return null;
  const cancellable = ![
    'DISPATCHED',
    'IN_TRANSIT',
    'PARTIALLY_DELIVERED',
    'DELIVERED',
    'RETURNED',
    'CANCELLED',
  ].includes(order.status);
  return (
    <section
      className="space-y-3 rounded-xl border border-[var(--sc-border-default)] p-4"
      aria-label={t('actions')}
    >
      <h4 className="font-semibold">{t('actions')}</h4>
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={onChanged}>
          {t('reload')}
        </Button>
      </div>

      {cancellable && order.holdReason !== 'CANCEL_PENDING' && !cancel && (
        <form
          className="space-y-3"
          onSubmit={reason.handleSubmit((values) =>
            run(async () => {
              pending.current ??= {
                operationId: createUuid(),
                expectedVersion: order.version,
                reason: values.reason,
              };
              const result = await orderCancellationApi.cancel(
                order.id,
                pending.current,
                abort.current.signal,
              );
              if (!abort.current.signal.aborted) setCancel(result);
            }),
          )}
        >
          <Input
            label={t('cancelReason')}
            {...reason.register('reason')}
            disabled={busy || !!pending.current}
            error={reason.formState.errors.reason ? t('invalidInput') : undefined}
          />
          <Button type="submit" variant="danger" disabled={busy}>
            {pending.current ? t('retryCancellation') : t('cancelOrder')}
          </Button>
        </form>
      )}
      {(cancel || order.holdReason === 'CANCEL_PENDING') && (
        <Alert variant={cancel?.status === 'CANCELLED' ? 'success' : 'warning'}>
          {cancel?.status === 'CANCELLED'
            ? t('cancelled')
            : cancel?.status === 'EXCEPTION'
              ? t('cancelException')
              : t('cancelPending')}
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const state = await orderCancellationApi.cancellation(
                  order.id,
                  abort.current.signal,
                );
                if (!abort.current.signal.aborted) {
                  setCancel(state);
                  if (state.status === 'CANCELLED') onChanged();
                }
              })
            }
          >
            {t('checkCancellation')}
          </Button>
        </Alert>
      )}
    </section>
  );
}
