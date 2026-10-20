import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { PageHeader } from '@/components/Common/PageHeader/PageHeader';
import { Select } from '@/components/Common/Select/Select';
import { useAccess } from '@/hooks/useAccess';
import { createUuid } from '@/lib/uuid';
import { useAuthStore } from '@/stores/authStore';

import {
  commercialApi,
  type CommercialPlan,
  type CommercialQuota,
  type SellerCommercialState,
} from '../api/commercialApi';

const changeSchema = z.object({ planVersionId: z.string().uuid() });
const closeSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export function CommercialQuotaPanel({ tenantId }: { tenantId?: string }) {
  const t = useTranslations('CommercialQuota');
  const { can } = useAccess();
  const [quota, setQuota] = useState<CommercialQuota | null>(null);
  const [plans, setPlans] = useState<CommercialPlan[]>([]);
  const [state, setState] = useState<SellerCommercialState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const operation = useRef<{ planVersionId: string; key: string } | null>(null);
  const revision = useAuthStore((value) => value.revision);
  const change = useForm<z.infer<typeof changeSchema>>({
    resolver: zodResolver(changeSchema),
    defaultValues: { planVersionId: '' },
  });
  const close = useForm<z.infer<typeof closeSchema>>({
    resolver: zodResolver(closeSchema),
    defaultValues: { reason: '' },
  });
  const current = () =>
    !controller.current?.signal.aborted && revision === useAuthStore.getState().revision;
  const reload = async () => {
    const result = await commercialApi.quotas(tenantId, controller.current?.signal);
    const contracts = await commercialApi.contracts(tenantId, controller.current?.signal);
    if (current()) {
      setQuota(result);
      setState(contracts);
    }
  };
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    void (async () => {
      try {
        const result = await commercialApi.quotas(tenantId, abort.signal);
        const contracts = await commercialApi.contracts(tenantId, abort.signal);
        const catalog = await commercialApi.plans(abort.signal);
        if (!abort.signal.aborted) {
          setQuota(result);
          setState(contracts);
          setPlans(catalog.plans);
        }
      } catch (failure) {
        if (!abort.signal.aborted) {
          setError(failure instanceof Error ? failure.message : t('loadError'));
        }
      }
    })();
    return () => {
      abort.abort();
    };
  }, [tenantId, revision, t]);
  const contract = state?.contracts.find((item) => item.id === state.currentContractId);
  const requestChange = change.handleSubmit(async (input) => {
    if (!contract) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    if (operation.current?.planVersionId !== input.planVersionId) {
      operation.current = { planVersionId: input.planVersionId, key: createUuid() };
    }
    try {
      await commercialApi.requestPlanChange(
        input.planVersionId,
        contract.version,
        operation.current.key,
        controller.current?.signal,
      );
      if (current()) {
        setNotice(t('requested'));
        await reload();
      }
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : t('saveError'));
    } finally {
      if (current()) setBusy(false);
    }
  });
  const requestClose = close.handleSubmit(async (input) => {
    if (!contract) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await commercialApi.requestClosure(
        contract.version,
        input.reason,
        controller.current?.signal,
      );
      if (current()) {
        setNotice(t('closing'));
        await reload();
      }
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : t('saveError'));
    } finally {
      if (current()) setBusy(false);
    }
  });
  const schedule = async (id: string) => {
    if (!tenantId) return;
    setBusy(true);
    setError(null);
    try {
      await commercialApi.schedulePlanChange(tenantId, id, controller.current?.signal);
      if (current()) await reload();
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : t('saveError'));
    } finally {
      if (current()) setBusy(false);
    }
  };
  return (
    <section className="space-y-4 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void reload().catch((failure) => {
              if (current()) setError(failure instanceof Error ? failure.message : t('loadError'));
            });
          }}
        >
          {t('refresh')}
        </Button>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}
      {!quota && !error && <p role="status">{t('loading')}</p>}
      {quota && !quota.plan && <Alert variant="info">{t('noPlan')}</Alert>}
      {quota?.plan && (
        <>
          <Alert variant="info">{t('freightSeparateHint')}</Alert>
          <h3 className="text-base font-semibold">
            {quota.plan.name} · v{quota.plan.versionNo}
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-[var(--sc-text-secondary)]">{t('warehouses')}</p>
              <p className="mt-1 text-lg font-semibold">
                {quota.usage?.occupiedWarehouses ?? '—'} / {quota.plan.warehouseAllowance}
              </p>
            </div>
            <div>
              <p className="text-sm text-[var(--sc-text-secondary)]">{t('orders')}</p>
              <p className="mt-1 text-lg font-semibold">
                {quota.usage?.salesOrdersCreated ?? '—'} / {quota.plan.salesOrderAllowance}
              </p>
            </div>
            <div>
              <p className="text-sm text-[var(--sc-text-secondary)]">{t('storage')}</p>
              <p className="mt-1 text-lg font-semibold">
                {quota.usage?.knownStockVolumeM3 ?? '—'} / {quota.plan.storageAllowanceM3} m³
              </p>
            </div>
          </div>
          <p className="text-xs text-[var(--sc-text-secondary)]">{t('meterHint')}</p>
          {quota.usage && !quota.usage.storageUsageComplete && (
            <Alert variant="warning">{t('volumeIncomplete')}</Alert>
          )}
        </>
      )}
      {quota?.changes.map((item) => (
        <div
          key={item.id}
          className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--sc-border-default)] pt-3"
        >
          <p className="text-sm">
            {t('change')}: {t(`status.${item.status}`)} · {item.effectiveOn}
          </p>
          {tenantId && item.status === 'REQUESTED' && can('platform.plans.manage') && (
            <Button
              isLoading={busy}
              size="sm"
              onClick={() => {
                void schedule(item.id);
              }}
            >
              {t('schedule')}
            </Button>
          )}
        </div>
      ))}
      {!tenantId && can('contract.sign') && quota?.serviceStatus === 'ACTIVE' && contract && (
        <>
          <form
            onSubmit={requestChange}
            className="space-y-3 border-t border-[var(--sc-border-default)] pt-4"
          >
            <h3 className="text-base font-semibold">{t('requestChange')}</h3>
            <Select
              label={t('newPlan')}
              placeholder={t('choose')}
              options={plans
                .filter((item) => item.id !== quota.plan?.id)
                .map((item) => ({
                  value: item.id,
                  label: `${item.name} · ${item.monthlyFeeVnd} VND`,
                }))}
              error={change.formState.errors.planVersionId ? t('invalid') : undefined}
              {...change.register('planVersionId')}
            />
            <p className="text-xs text-[var(--sc-text-secondary)]">{t('changeHint')}</p>
            <Button type="submit" isLoading={busy}>
              {t('sendChange')}
            </Button>
          </form>
          <form
            onSubmit={requestClose}
            className="space-y-3 border-t border-[var(--sc-border-default)] pt-4"
          >
            <h3 className="text-base font-semibold">{t('requestClose')}</h3>
            <Input
              label={t('reason')}
              error={close.formState.errors.reason ? t('invalid') : undefined}
              {...close.register('reason')}
            />
            <p className="text-sm text-[var(--sc-text-secondary)]">{t('closeHint')}</p>
            <Button type="submit" variant="danger" isLoading={busy}>
              {t('sendClose')}
            </Button>
          </form>
        </>
      )}
    </section>
  );
}

export function CommercialQuotaAdmin() {
  const t = useTranslations('CommercialAdmin');
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void commercialApi
      .financialSellers(abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) setSellers(result);
      })
      .catch((failure) => {
        if (!abort.signal.aborted) {
          setError(failure instanceof Error ? failure.message : t('loadError'));
        }
      });
    return () => {
      abort.abort();
    };
  }, [t]);
  return (
    <div className="space-y-4">
      <PageHeader title={t('quotaTitle')} />
      {error && <Alert variant="error">{error}</Alert>}
      <Select
        label={t('selectSeller')}
        placeholder={t('selectSeller')}
        value={tenantId}
        options={sellers.map((item) => ({ value: item.id, label: item.name }))}
        onChange={(event) => setTenantId(event.target.value)}
      />
      {tenantId && <CommercialQuotaPanel key={tenantId} tenantId={tenantId} />}
    </div>
  );
}
