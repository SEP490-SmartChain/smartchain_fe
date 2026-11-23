import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowRight,
  CalendarClock,
  ChevronDown,
  Layers3,
  Package,
  RefreshCw,
  ShieldCheck,
  Warehouse,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';
import { Input } from '@/components/Common/Input/Input';
import { PageHeader } from '@/components/Common/PageHeader/PageHeader';
import { SearchableSelect } from '@/components/Common/Select/SearchableSelect';
import { Select } from '@/components/Common/Select/Select';
import { useAccess } from '@/hooks/useAccess';
import { notifyInvalidForm } from '@/lib/errorNotifications';
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

export function CommercialQuotaPanel({
  tenantId,
  compact = false,
}: {
  tenantId?: string;
  compact?: boolean;
}) {
  const revision = useAuthStore((value) => value.revision);
  return (
    <CommercialQuotaContent
      key={`${revision}:${tenantId ?? 'own'}`}
      tenantId={tenantId}
      compact={compact}
    />
  );
}

function CommercialQuotaContent({ tenantId, compact }: { tenantId?: string; compact: boolean }) {
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
  const requestChange = change.handleSubmit(
    async (input) => {
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
    },
    () => notifyInvalidForm(),
  );
  const requestClose = close.handleSubmit(
    async (input) => {
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
    },
    () => notifyInvalidForm(),
  );
  const reject = (id: string) =>
    rejection.handleSubmit(
      async (input) => {
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
      },
      () => notifyInvalidForm(),
    );
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
    <Card
      padding="none"
      className="overflow-hidden border border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)]"
    >
      {/* Header Bar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sc-border-default)] ${
          compact ? 'px-4 py-3' : 'px-5 py-3.5 sm:px-6'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary)]">
            <Layers3 size={17} aria-hidden="true" />
          </span>
          <h2 className="m-0 text-base font-semibold text-[var(--sc-text-primary)]">
            {t('title')}
          </h2>
          {quota?.plan && (
            <span className="inline-flex items-center gap-1 rounded-md border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] px-2 py-0.5 text-xs font-medium text-[var(--sc-text-primary)]">
              <ShieldCheck size={13} className="text-[var(--sc-primary)]" aria-hidden="true" />
              {quota.plan.name} · v{quota.plan.versionNo}
            </span>
          )}
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
          <RefreshCw size={14} />
          {t('refresh')}
        </Button>
      </div>

      {/* Status / Error Feedback */}
      {(error || notice || (!quota && !error) || (quota && !quota.plan)) && (
        <div className="space-y-3 border-b border-[var(--sc-border-default)] px-5 py-4 sm:px-6">
          {error && <Alert variant="error">{error}</Alert>}
          {notice && <Alert variant="success">{notice}</Alert>}
          {!quota && !error && (
            <p role="status" className="m-0 text-sm text-[var(--sc-text-secondary)]">
              {t('loading')}
            </p>
          )}
          {quota && !quota.plan && <Alert variant="info">{t('noPlan')}</Alert>}
        </div>
      )}

      {/* 3-Column Divided Usage Meter Strip (no nested boxes) */}
      {quota?.plan && (
        <>
          <div className="grid divide-y border-b border-[var(--sc-border-default)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className={compact ? 'p-4' : 'px-5 py-4 sm:px-6'}>
              <div className="flex items-center gap-2 text-xs text-[var(--sc-text-secondary)]">
                <Warehouse size={15} className="text-[var(--sc-primary)]" aria-hidden="true" />
                <span>{t('warehouses')}</span>
              </div>
              <p className="mb-0 mt-1.5 text-lg font-semibold tabular-nums text-[var(--sc-text-primary)]">
                {quota.usage?.occupiedWarehouses ?? '—'}{' '}
                <span className="text-sm font-normal text-[var(--sc-text-secondary)]">
                  / {quota.plan.warehouseAllowance}
                </span>
              </p>
            </div>

            <div className={compact ? 'p-4' : 'px-5 py-4 sm:px-6'}>
              <div className="flex items-center gap-2 text-xs text-[var(--sc-text-secondary)]">
                <Package size={15} className="text-[var(--sc-info)]" aria-hidden="true" />
                <span>{t('orders')}</span>
              </div>
              <p className="mb-0 mt-1.5 text-lg font-semibold tabular-nums text-[var(--sc-text-primary)]">
                {quota.usage?.salesOrdersCreated ?? '—'}{' '}
                <span className="text-sm font-normal text-[var(--sc-text-secondary)]">
                  / {quota.plan.salesOrderAllowance}
                </span>
              </p>
            </div>

            <div className={compact ? 'p-4' : 'px-5 py-4 sm:px-6'}>
              <div className="flex items-center gap-2 text-xs text-[var(--sc-text-secondary)]">
                <Layers3 size={15} className="text-[var(--sc-warning)]" aria-hidden="true" />
                <span>{t('storage')}</span>
              </div>
              <p className="mb-0 mt-1.5 text-lg font-semibold tabular-nums text-[var(--sc-text-primary)]">
                {quota.usage?.knownStockVolumeM3 ?? '—'}{' '}
                <span className="text-sm font-normal text-[var(--sc-text-secondary)]">
                  / {quota.plan.storageAllowanceM3} m³
                </span>
              </p>
            </div>
          </div>

          {quota.usage && !quota.usage.storageUsageComplete && (
            <div className="border-b border-[var(--sc-border-default)] px-5 py-3 sm:px-6">
              <Alert variant="warning" compact>
                {t('volumeIncomplete')}
              </Alert>
            </div>
          )}
        </>
      )}

      {/* Plan Change History */}
      {quota && quota.changes.length > 0 && (
        <div className="border-b border-[var(--sc-border-default)] px-5 py-3.5 sm:px-6">
          <h3 className="m-0 mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--sc-text-secondary)]">
            <CalendarClock size={14} aria-hidden="true" />
            {t('history')}
          </h3>
          <div className="divide-y divide-[var(--sc-border-light)]">
            {quota.changes.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
              >
                <p className="m-0 text-sm">
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
                  <span className="ml-2 text-xs text-[var(--sc-text-primary)]">
                    {plans.find((plan) => plan.id === item.planVersionId)?.name ?? t('change')} ·{' '}
                    {item.effectiveOn}
                  </span>
                </p>
                {tenantId && item.status === 'REQUESTED' && can('platform.plans.manage') && (
                  <div className="w-full space-y-2.5 sm:w-auto">
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
          </div>
        </div>
      )}

      {/* Terminating Closeout Steps */}
      {contract?.status === 'TERMINATING' && (
        <div className="border-b border-[var(--sc-border-default)] px-5 py-4 sm:px-6">
          <h3 className="m-0 text-sm font-semibold text-[var(--sc-text-primary)]">
            {t('closeoutTitle')}
          </h3>
          <ol className="my-3 grid gap-3 text-xs text-[var(--sc-text-secondary)] sm:grid-cols-3">
            {['closeoutDebt', 'closeoutStock', 'closeoutFinal'].map((step, index) => (
              <li key={step} className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--sc-primary-alpha-08)] text-[11px] font-semibold text-[var(--sc-primary)]">
                  {index + 1}
                </span>
                <span className="leading-5">{t(step)}</span>
              </li>
            ))}
          </ol>
          {!tenantId && (
            <Link
              to="/statements"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--sc-primary)] hover:underline"
            >
              {t('openSettlement')}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
      )}

      {/* Compact Collapsible Lifecycle Actions (Plan Change & Contract Closure) */}
      {!tenantId &&
        can('contract.sign') &&
        isCurrentContract &&
        ['ACTIVE', 'SUSPENDED'].includes(quota?.serviceStatus ?? '') &&
        contract && (
          <div className="divide-y divide-[var(--sc-border-default)] border-b border-[var(--sc-border-default)]">
            {quota?.serviceStatus === 'ACTIVE' && (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-medium text-[var(--sc-text-primary)] transition-colors hover:bg-[var(--sc-bg-secondary)]/50 sm:px-6 [&::-webkit-details-marker]:hidden">
                  <span>{t('requestChange')}</span>
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className="shrink-0 text-[var(--sc-text-secondary)] transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  />
                </summary>
                <form
                  onSubmit={requestChange}
                  className="space-y-3 border-t border-[var(--sc-border-light)] bg-[var(--sc-bg-secondary)]/30 px-5 py-4 sm:px-6"
                >
                  {pendingChange && <Alert variant="info">{t('pendingHint')}</Alert>}
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <Select
                      disabled={busy || pendingChange}
                      label={t('newPlan')}
                      placeholder={t('choose')}
                      options={plans
                        .filter(
                          (item) =>
                            ['BASIC', 'STANDARD'].includes(item.code) &&
                            item.id !== quota?.plan?.id,
                        )
                        .map((item) => ({
                          value: item.id,
                          label: `${item.name} · ${item.monthlyFeeVnd} VND`,
                        }))}
                      error={change.formState.errors.planVersionId ? t('invalid') : undefined}
                      {...change.register('planVersionId')}
                    />
                    <Button type="submit" isLoading={busy} disabled={pendingChange}>
                      {t('sendChange')}
                    </Button>
                  </div>
                  <p className="m-0 text-xs text-[var(--sc-text-secondary)]">
                    {t('changeHint')} {t('enterpriseHint')}
                  </p>
                </form>
              </details>
            )}

            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-medium text-[var(--sc-text-primary)] transition-colors hover:bg-[var(--sc-bg-secondary)]/50 sm:px-6 [&::-webkit-details-marker]:hidden">
                <span>{t('requestClose')}</span>
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className="shrink-0 text-[var(--sc-text-secondary)] transition-transform group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <form
                onSubmit={requestClose}
                className="space-y-3 border-t border-[var(--sc-border-light)] bg-[var(--sc-bg-secondary)]/30 px-5 py-4 sm:px-6"
              >
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <Input
                    label={t('reason')}
                    error={close.formState.errors.reason ? t('invalid') : undefined}
                    {...close.register('reason')}
                  />
                  <Button type="submit" variant="danger" isLoading={busy}>
                    {t('sendClose')}
                  </Button>
                </div>
                <p className="m-0 text-xs text-[var(--sc-text-secondary)]">{t('closeHint')}</p>
              </form>
            </details>
          </div>
        )}

      {/* Subtle Footer Hint (replaces bulky blue Alert banner) */}
      {quota?.plan && (
        <div
          className={`bg-[var(--sc-bg-secondary)]/40 text-xs text-[var(--sc-text-secondary)] ${
            compact ? 'px-4 py-2.5' : 'px-5 py-2.5 sm:px-6'
          }`}
        >
          {t('meterHint')} {t('freightSeparateHint')}
        </div>
      )}
    </Card>
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
