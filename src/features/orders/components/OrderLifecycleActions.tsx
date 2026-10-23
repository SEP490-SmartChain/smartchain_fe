import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Button, Input } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';

import { orderLifecycleApi } from '../api/orderLifecycleApi';
import { orderCorrectionSchema } from '../schemas/orderLifecycleSchema';

import type { SellerOrderDetail } from '../api/ordersApi';
import type { z } from 'zod';

export function OrderLifecycleActions({
  order,
  onChanged,
}: {
  order: SellerOrderDetail;
  onChanged: () => void;
}) {
  const t = useTranslations('OrderLifecycle'),
    { can } = useAccess();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [showCorrection, setShowCorrection] = useState(false);
  const running = useRef(false),
    abort = useRef(new AbortController());
  const correction = useForm<z.infer<typeof orderCorrectionSchema>>({
    resolver: zodResolver(orderCorrectionSchema),
    defaultValues: {
      recipientName: order.recipientName ?? '',
      recipientPhone: order.recipientPhone ?? '',
      recipientAddress: order.recipientAddress ?? '',
      toProvinceCode: order.toProvinceCode ?? '',
      toWardCode: order.toWardCode ?? '',
    },
  });
  const allowed = can('orders.lifecycle.manage');
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
  const invalid = order.status === 'FAILED' && order.holdReason === 'VALIDATION_FAILED';
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

        {invalid && (
          <>
            <Button variant="outline" disabled={busy} onClick={() => setShowCorrection((s) => !s)}>
              {t('correct')}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await orderLifecycleApi.transition(
                    order.id,
                    'redispatch',
                    order.version,
                    abort.current.signal,
                  );
                  if (!abort.current.signal.aborted) onChanged();
                })
              }
            >
              {t('revalidate')}
            </Button>
          </>
        )}
      </div>
      {showCorrection && invalid && (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={correction.handleSubmit((values) =>
            run(async () => {
              await orderLifecycleApi.correct(
                order.id,
                { ...values, expectedVersion: order.version },
                abort.current.signal,
              );
              if (!abort.current.signal.aborted) {
                setShowCorrection(false);
                onChanged();
              }
            }),
          )}
        >
          {(
            [
              'recipientName',
              'recipientPhone',
              'recipientAddress',
              'toProvinceCode',
              'toWardCode',
            ] as const
          ).map((name) => (
            <Input
              key={name}
              label={t(name)}
              {...correction.register(name)}
              error={correction.formState.errors[name] ? t('invalidInput') : undefined}
              disabled={busy}
            />
          ))}
          <Button type="submit" disabled={busy}>
            {t('saveCorrection')}
          </Button>
        </form>
      )}
    </section>
  );
}
