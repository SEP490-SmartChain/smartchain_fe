import { useEffect, useRef, useState } from 'react';

import { useForm, type UseFormReturn } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Button, Input, Select } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';

import { orderLifecycleApi } from '../api/orderLifecycleApi';
import { useOrderLocations } from '../hooks/useOrderLocations';
import { orderScope } from '../lib/orderScope';
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
    [showCorrection, setShowCorrection] = useState(false),
    [saved, setSaved] = useState(false);
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
  const dirty = correction.formState.isDirty;
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
  const invalid = order.status === 'FAILED' && order.holdReason === 'VALIDATION_FAILED';
  if (!allowed || !invalid) return null;
  return (
    <section
      className="mt-5 space-y-3 rounded-xl border border-[var(--sc-border-default)] p-4"
      aria-label={t('actions')}
    >
      <h4 className="font-semibold">{t('actions')}</h4>
      {error && (
        <Alert variant="error">
          {error}
          <Button variant="ghost" disabled={busy} onClick={onChanged}>
            {t('reload')}
          </Button>
        </Alert>
      )}
      {dirty && (
        <p role="status" className="text-sm text-[var(--sc-text-secondary)]">
          {t('saveBeforeRevalidate')}
        </p>
      )}
      {saved && !dirty && (
        <Alert variant="success" role="status">
          {t('correctionSaved')}
        </Alert>
      )}
      {!showCorrection && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={saved ? 'outline' : 'primary'}
            disabled={busy}
            onClick={() => setShowCorrection(true)}
          >
            {t('correct')}
          </Button>
          <Button
            variant={saved ? 'primary' : 'outline'}
            disabled={busy || dirty}
            onClick={() => {
              if (dirty) return;
              void run(async () => {
                await orderLifecycleApi.transition(
                  order.id,
                  'redispatch',
                  order.version,
                  abort.current.signal,
                );
                if (!abort.current.signal.aborted) onChanged();
              });
            }}
          >
            {t('revalidate')}
          </Button>
        </div>
      )}
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
                correction.reset(values);
                setSaved(true);
                setShowCorrection(false);
                onChanged();
              }
            }),
          )}
        >
          <CorrectionFields
            correction={correction}
            busy={busy}
            onClose={() => setShowCorrection(false)}
          />
        </form>
      )}
    </section>
  );
}

function CorrectionFields({
  correction,
  busy,
  onClose,
}: {
  correction: UseFormReturn<z.infer<typeof orderCorrectionSchema>>;
  busy: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('OrderLifecycle');
  const scope = useAuthStore(orderScope);
  const addresses = useOrderLocations(scope);
  const province = correction.watch('toProvinceCode');
  const ward = correction.watch('toWardCode');
  const ready =
    !addresses.loading &&
    !addresses.error &&
    addresses.locations.some((l) => l.type === 'PROVINCE' && l.code === province) &&
    addresses.locations.some(
      (l) => l.type === 'WARD' && l.code === ward && l.parentCode === province,
    );
  return (
    <>
      {(['recipientName', 'recipientPhone', 'recipientAddress'] as const).map((name) => (
        <Input
          key={name}
          label={t(name)}
          required
          {...correction.register(name)}
          error={correction.formState.errors[name] ? t('invalidInput') : undefined}
          disabled={busy}
        />
      ))}
      <Select
        label={t('toProvinceCode')}
        required
        {...correction.register('toProvinceCode', {
          onChange: () => correction.setValue('toWardCode', ''),
        })}
        options={addresses.locations
          .filter((l) => l.type === 'PROVINCE')
          .map((l) => ({ value: l.code, label: l.name }))}
        disabled={busy || addresses.loading || addresses.error}
        error={correction.formState.errors.toProvinceCode ? t('invalidInput') : undefined}
      />
      <Select
        label={t('toWardCode')}
        required
        {...correction.register('toWardCode')}
        options={addresses.locations
          .filter((l) => l.type === 'WARD' && l.parentCode === province)
          .map((l) => ({ value: l.code, label: l.name }))}
        disabled={busy || !province || addresses.loading || addresses.error}
        error={correction.formState.errors.toWardCode ? t('invalidInput') : undefined}
      />
      {addresses.loading && <p role="status">{t('loading')}</p>}
      {(addresses.error || (!addresses.loading && !addresses.locations.length)) && (
        <Alert variant="error">
          {t('locationError')}
          <Button type="button" variant="ghost" disabled={busy} onClick={addresses.retry}>
            {t('retryLocations')}
          </Button>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2 border-t border-[var(--sc-border-default)] pt-3 sm:col-span-2">
        <Button type="submit" disabled={busy || !ready}>
          {t('saveCorrection')}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          {t('backToActions')}
        </Button>
      </div>
    </>
  );
}
