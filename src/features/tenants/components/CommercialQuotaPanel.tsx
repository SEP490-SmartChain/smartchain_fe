import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { ArrowRight, CalendarClock, Layers3, Package, ShieldCheck, Warehouse } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { PageHeader } from '@/components/Common/PageHeader/PageHeader';
import { SearchableSelect } from '@/components/Common/Select/SearchableSelect';
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
  const revision = useAuthStore((value) => value.revision);
  return <CommercialQuotaContent key={`${revision}:${tenantId ?? 'own'}`} tenantId={tenantId} />;
}

function CommercialQuotaContent({ tenantId }: { tenantId?: string }) {
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
  const rejection = useForm<z.infer<typeof closeSchema>>({
    resolver: zodResolver(closeSchema),
    defaultValues: { reason: '' },
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
        operation.current = null;
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
  const reject = (id: string) =>
    rejection.handleSubmit(async (input) => {
      if (!tenantId || !contract) return;
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        await commercialApi.rejectPlanChange(
          tenantId,
          id,
          contract.version,
          input.reason,
          controller.current?.signal,
        );
        if (current()) {
          setNotice(t('rejected'));
          rejection.reset();
          await reload();
        }
      } catch (failure) {
        if (current()) setError(failure instanceof Error ? failure.message : t('saveError'));
      } finally {
        if (current()) setBusy(false);
      }
    });
  const pendingChange =
    quota?.changes.some((item) => ['REQUESTED', 'SCHEDULED'].includes(item.status)) ?? false;
  const isCurrentContract = Boolean(
    contract && ['ACCEPTED', 'CONFIRMED'].includes(contract.status),
  );
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
    <section className="overflow-hidden rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-5 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-[var(--sc-bg-elevated)] p-2.5 text-[var(--sc-primary)]">
            <Layers3 size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--sc-text-secondary)]">
              {t('eyebrow')}
            </p>
            <h2 className="text-lg font-semibold">{t('title')}</h2>
          </div>
        </div>
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
      <div className="space-y-5 p-5 sm:p-6">
        {error && <Alert variant="error">{error}</Alert>}
        {notice && <Alert variant="success">{notice}</Alert>}
        {!quota && !error && <p role="status">{t('loading')}</p>}
        {quota && !quota.plan && <Alert variant="info">{t('noPlan')}</Alert>}
        {quota?.plan && (
          <>
            <Alert variant="info">{t('freightSeparateHint')}</Alert>
            <h3 className="flex items-center gap-2 text-xl font-semibold">
              <ShieldCheck size={19} className="text-[var(--sc-primary)]" aria-hidden="true" />
              {quota.plan.name} · v{quota.plan.versionNo}
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[var(--sc-border-default)] p-4">
                <Warehouse size={18} className="mb-3 text-[var(--sc-primary)]" aria-hidden="true" />
                <p className="text-sm text-[var(--sc-text-secondary)]">{t('warehouses')}</p>
                <p className="mt-1 text-lg font-semibold">
                  {quota.usage?.occupiedWarehouses ?? '—'} / {quota.plan.warehouseAllowance}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--sc-border-default)] p-4">
                <Package size={18} className="mb-3 text-[var(--sc-info)]" aria-hidden="true" />
                <p className="text-sm text-[var(--sc-text-secondary)]">{t('orders')}</p>
                <p className="mt-1 text-lg font-semibold">
                  {quota.usage?.salesOrdersCreated ?? '—'} / {quota.plan.salesOrderAllowance}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--sc-border-default)] p-4">
                <Layers3 size={18} className="mb-3 text-[var(--sc-warning)]" aria-hidden="true" />
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
        {quota && quota.changes.length > 0 && (
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <CalendarClock size={17} aria-hidden="true" />
            {t('history')}
          </h3>
        )}
        {quota?.changes.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--sc-border-default)] pt-3"
          >
            <p className="text-sm">
              <Badge
                status={
                  item.status === 'APPLIED'
                    ? 'success'
                    : item.status === 'REJECTED'
                      ? 'default'
                      : 'warning'
                }
                label={t(`status.${item.status}`)}
              />{' '}
              <span className="ml-2">
                {plans.find((plan) => plan.id === item.planVersionId)?.name ?? t('change')} ·{' '}
                {item.effectiveOn}
              </span>
            </p>
            {tenantId && item.status === 'REQUESTED' && can('platform.plans.manage') && (
              <div className="w-full space-y-3 sm:w-auto">
                <Button
                  isLoading={busy}
                  size="sm"
                  onClick={() => {
                    void schedule(item.id);
                  }}
                >
                  {t('schedule')}
                </Button>
                <form onSubmit={reject(item.id)} className="flex flex-wrap items-end gap-2">
                  <Input
                    label={t('rejectionReason')}
                    {...rejection.register('reason')}
                    error={rejection.formState.errors.reason ? t('invalid') : undefined}
                  />
                  <Button variant="outline" type="submit" isLoading={busy}>
                    {t('reject')}
                  </Button>
                </form>
              </div>
            )}
          </div>
        ))}
        {!tenantId &&
          can('contract.sign') &&
          isCurrentContract &&
          ['ACTIVE', 'SUSPENDED'].includes(quota?.serviceStatus ?? '') &&
          contract && (
            <div className="grid gap-4 lg:grid-cols-2">
              {quota?.serviceStatus === 'ACTIVE' && (
                <form
                  onSubmit={requestChange}
                  className="flex flex-col items-start gap-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-5"
                >
                  <h3 className="text-base font-semibold">{t('requestChange')}</h3>
                  {pendingChange && <Alert variant="info">{t('pendingHint')}</Alert>}
                  <Select
                    disabled={busy || pendingChange}
                    label={t('newPlan')}
                    placeholder={t('choose')}
                    options={plans
                      .filter(
                        (item) =>
                          ['BASIC', 'STANDARD'].includes(item.code) && item.id !== quota?.plan?.id,
                      )
                      .map((item) => ({
                        value: item.id,
                        label: `${item.name} · ${item.monthlyFeeVnd} VND`,
                      }))}
                    error={change.formState.errors.planVersionId ? t('invalid') : undefined}
                    {...change.register('planVersionId')}
                  />
                  <p className="text-xs text-[var(--sc-text-secondary)]">{t('changeHint')}</p>
                  <Button type="submit" isLoading={busy} disabled={pendingChange}>
                    {t('sendChange')}
                  </Button>
                </form>
              )}
              <form
                onSubmit={requestClose}
                className="flex flex-col items-start gap-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-5"
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
            </div>
          )}
        {contract?.status === 'TERMINATING' && (
          <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-5">
            <h3 className="font-semibold">{t('closeoutTitle')}</h3>
            <ol className="my-4 grid gap-3 text-sm sm:grid-cols-3">
              {['closeoutDebt', 'closeoutStock', 'closeoutFinal'].map((step, index) => (
                <li key={step} className="flex gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--sc-bg-elevated)] text-xs font-semibold text-[var(--sc-primary)]">
                    {index + 1}
                  </span>
                  <span>{t(step)}</span>
                </li>
              ))}
            </ol>
            {!tenantId && (
              <Link
                to="/statements"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--sc-primary)] hover:underline"
              >
                {t('openSettlement')}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
      </div>
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
      <SearchableSelect
        label={t('selectSeller')}
        placeholder={t('selectSeller')}
        value={tenantId}
        options={sellers.map((item) => ({ value: item.id, label: item.name }))}
        onChange={(val) => setTenantId(val)}
      />
      {tenantId && <CommercialQuotaPanel key={tenantId} tenantId={tenantId} />}
    </div>
  );
}
