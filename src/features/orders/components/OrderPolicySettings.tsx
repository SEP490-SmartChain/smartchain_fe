import { useEffect, useId, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Button, Card, Input } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';

import { orderPolicyApi, type OrderPolicy } from '../api/orderPolicyApi';
import { orderPolicyFormSchema } from '../schemas/orderPolicySchema';

import type { z } from 'zod';

export function OrderPolicySettings() {
  const { can } = useAccess();
  const revision = useAuthStore((s) => s.revision);
  if (!can('orders.policy.manage')) return null;
  return <OrderPolicySession key={revision} />;
}
function OrderPolicySession() {
  const t = useTranslations('OrderPolicy');
  const descriptionId = useId();
  const [policy, setPolicy] = useState<OrderPolicy | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0),
    [saved, setSaved] = useState(false);
  const running = useRef(false),
    controller = useRef(new AbortController());
  const form = useForm<z.infer<typeof orderPolicyFormSchema>>({
    resolver: zodResolver(orderPolicyFormSchema),
    defaultValues: { holdRiskyCod: false, holdCodMinAmount: '1000000' },
  });
  const { reset } = form;
  const dirty = Object.keys(form.formState.dirtyFields).length > 0 || form.formState.isDirty;
  useEffect(() => {
    const c = new AbortController();
    controller.current = c;
    setPolicy(null);
    setError('');
    setSaved(false);
    void orderPolicyApi
      .policy(c.signal)
      .then((p) => {
        if (!c.signal.aborted) {
          setPolicy(p);
          reset(
            { holdRiskyCod: p.holdRiskyCod, holdCodMinAmount: p.holdCodMinAmount },
            { keepDirtyValues: true },
          );
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setError(t('loadError'));
      });
    return () => c.abort();
  }, [reload, reset, t]);
  async function save(values: z.infer<typeof orderPolicyFormSchema>) {
    if (!policy || running.current || !dirty) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const p = await orderPolicyApi.savePolicy(
        { ...values, expectedVersion: policy.version },
        controller.current.signal,
      );
      if (!controller.current.signal.aborted) {
        setPolicy(p);
        reset({ holdRiskyCod: p.holdRiskyCod, holdCodMinAmount: p.holdCodMinAmount });
        setSaved(true);
      }
    } catch {
      if (!controller.current.signal.aborted) setError(t('policyWriteError'));
    } finally {
      running.current = false;
      if (!controller.current.signal.aborted) setBusy(false);
    }
  }
  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-lg font-semibold">{t('policyTitle')}</h2>
      {saved && !dirty && policy && (
        <Alert variant="success" role="status">
          {t(policy.holdRiskyCod ? 'savedEnabled' : 'savedDisabled')}
        </Alert>
      )}
      {error && (
        <Alert variant="error">
          {error}
          <Button variant="ghost" disabled={busy} onClick={() => setReload((n) => n + 1)}>
            {t('reloadPolicy')}
          </Button>
        </Alert>
      )}
      {!policy && !error ? (
        <p role="status">{t('loading')}</p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(save)}
          onChange={() => setSaved(false)}
        >
          <div className="rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-4">
            <label className="flex items-start gap-3 font-medium">
              <input
                type="checkbox"
                className="mt-1"
                aria-describedby={descriptionId}
                {...form.register('holdRiskyCod')}
                disabled={!policy || busy}
              />
              {t('holdEnabled')}
            </label>
            <p id={descriptionId} className="mt-2 text-sm text-[var(--sc-text-secondary)]">
              {t('policyHint')}
            </p>
          </div>
          <div className="max-w-sm">
            <Input
              label={t('threshold')}
              helperText={t('thresholdHint')}
              inputMode="numeric"
              {...form.register('holdCodMinAmount')}
              error={form.formState.errors.holdCodMinAmount ? t('invalidThreshold') : undefined}
              disabled={!policy || busy}
            />
          </div>
          <div className="border-t border-[var(--sc-border-default)] pt-4">
            <Button type="submit" disabled={!policy || busy || !dirty}>
              {t('save')}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
