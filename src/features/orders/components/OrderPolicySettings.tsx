import { useEffect, useRef, useState } from 'react';

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
  const [policy, setPolicy] = useState<OrderPolicy | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const running = useRef(false),
    controller = useRef(new AbortController());
  const form = useForm<z.infer<typeof orderPolicyFormSchema>>({
    resolver: zodResolver(orderPolicyFormSchema),
    defaultValues: { holdRiskyCod: false, holdCodMinAmount: '1000000' },
  });
  const { reset } = form;
  useEffect(() => {
    const c = new AbortController();
    controller.current = c;
    setPolicy(null);
    setError('');
    void orderPolicyApi
      .policy(c.signal)
      .then((p) => {
        if (!c.signal.aborted) {
          setPolicy(p);
          reset({ holdRiskyCod: p.holdRiskyCod, holdCodMinAmount: p.holdCodMinAmount });
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setError(t('loadError'));
      });
    return () => c.abort();
  }, [reload, reset, t]);
  async function save(values: z.infer<typeof orderPolicyFormSchema>) {
    if (!policy || running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const p = await orderPolicyApi.savePolicy(
        { ...values, expectedVersion: policy.version },
        controller.current.signal,
      );
      if (!controller.current.signal.aborted) setPolicy(p);
    } catch {
      if (!controller.current.signal.aborted) setError(t('writeError'));
    } finally {
      running.current = false;
      if (!controller.current.signal.aborted) setBusy(false);
    }
  }
  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-lg font-semibold">{t('policyTitle')}</h2>
      <p className="text-sm text-[var(--sc-text-secondary)]">{t('policyHint')}</p>
      {error && (
        <Alert variant="error">
          {error}
          <Button variant="ghost" disabled={busy} onClick={() => setReload((n) => n + 1)}>
            {t('reload')}
          </Button>
        </Alert>
      )}
      {!policy && !error ? (
        <p role="status">{t('loading')}</p>
      ) : (
        <form className="space-y-4" onSubmit={form.handleSubmit(save)}>
          <label className="flex items-center gap-3">
            <input type="checkbox" {...form.register('holdRiskyCod')} disabled={!policy || busy} />
            {t('holdEnabled')}
          </label>
          <Input
            label={t('threshold')}
            inputMode="numeric"
            {...form.register('holdCodMinAmount')}
            error={form.formState.errors.holdCodMinAmount ? t('invalidThreshold') : undefined}
            disabled={!policy || busy}
          />
          <Button type="submit" disabled={!policy || busy}>
            {t('save')}
          </Button>
        </form>
      )}
    </Card>
  );
}
