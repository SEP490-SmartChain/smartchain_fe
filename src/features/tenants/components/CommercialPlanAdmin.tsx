import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ChevronRight,
  Crown,
  FileSignature,
  Layers,
  Package,
  Plus,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { PageHeader } from '@/components/Common/PageHeader/PageHeader';
import { Select } from '@/components/Common/Select/Select';
import { Tabs } from '@/components/Common/Tabs/Tabs';
import { useAuthStore } from '@/stores/authStore';

import { commercialApi, type PublishedCommercialTerms } from '../api/commercialApi';

const money = z.string().regex(/^(0|[1-9]\d{0,19})$/);
const planSchema = z.object({
  code: z.enum(['BASIC', 'STANDARD', 'ENTERPRISE']),
  name: z.string().trim().min(1).max(100),
  monthlyFeeVnd: money,
  salesOrderAllowance: z.number().int().min(0).max(100000000),
  warehouseAllowance: z.number().int().min(1).max(100000),
  storageAllowanceM3: z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,6})?$/),
  includedServices: z.string().max(20000),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const agreementSchema = z.object({
  planVersionId: z.string().uuid(),
  serviceTariffVersionId: z.string().uuid(),
  freightTariffVersionId: z.string().uuid(),
  versionRef: z.string().trim().min(1).max(100),
  signerRole: z.string().trim().min(1).max(100),
  templateId: z.string().regex(/^$|^[a-f0-9]{40}$/i),
  compositionMode: z.enum(['EXISTING_FIELDS', 'BUSINESS_PROFILE_V1']),
  depositRequiredVnd: money,
  creditLimitVnd: money,
  claimCapVnd: money,
});

export function CommercialPlanAdmin() {
  const t = useTranslations('CommercialAdmin');
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState('versions');
  const [replacementPlanId, setReplacementPlanId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [terms, setTerms] = useState<PublishedCommercialTerms | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const publishingPlan = useRef(false);
  const active = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const revision = useAuthStore((state) => state.revision);
  const plan = useForm<z.infer<typeof planSchema>>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      code: 'BASIC',
      name: 'Basic',
      monthlyFeeVnd: '4000000',
      salesOrderAllowance: 500,
      warehouseAllowance: 1,
      storageAllowanceM3: '10',
      includedServices: '',
      effectiveFrom: new Date().toISOString().slice(0, 10),
    },
  });
  const agreement = useForm<z.infer<typeof agreementSchema>>({
    resolver: zodResolver(agreementSchema),
    defaultValues: {
      planVersionId: '',
      serviceTariffVersionId: '',
      freightTariffVersionId: '',
      versionRef: '',
      signerRole: 'Role 1',
      templateId: '',
      compositionMode: 'EXISTING_FIELDS',
      depositRequiredVnd: '3000000',
      creditLimitVnd: '5000000',
      claimCapVnd: '20000000',
    },
  });
  const current = () => active.current && revision === useAuthStore.getState().revision;
  const reload = async (signal?: AbortSignal) => {
    try {
      const result = await commercialApi.publishedTerms(signal);
      if (current() && !signal?.aborted) {
        setTerms(result);
        setError(null);
      }
    } catch (failure) {
      if (current() && !signal?.aborted) {
        setError(failure instanceof Error ? failure.message : t('loadError'));
      }
    }
  };
  useEffect(() => {
    active.current = true;
    const abort = new AbortController();
    controller.current = abort;
    void commercialApi
      .publishedTerms(abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) setTerms(result);
      })
      .catch((failure) => {
        if (!abort.signal.aborted) {
          setError(failure instanceof Error ? failure.message : t('loadError'));
        }
      });
    return () => {
      active.current = false;
      abort.abort();
    };
  }, [revision, t]);
  const savePlan = plan.handleSubmit(async (value) => {
    if (publishingPlan.current) return;
    publishingPlan.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const includedServices = value.includedServices
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const expectedVersionNo = Math.max(
        0,
        ...(terms?.plans.filter((item) => item.code === value.code).map((item) => item.versionNo) ??
          []),
      );
      const result = await commercialApi.createPlan(
        { ...value, includedServices, expectedVersionNo },
        controller.current?.signal,
      );
      if (!current()) return;
      agreement.setValue('planVersionId', value.code === 'ENTERPRISE' ? '' : result.id);
      setNotice(t('planSaved'));
      await reload(controller.current?.signal);
      if (current()) setActiveTab('versions');
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : t('saveError'));
    } finally {
      publishingPlan.current = false;
      if (current()) setBusy(false);
    }
  });
  const eligiblePlans =
    terms?.plans.filter((item) => {
      if (item.code !== 'BASIC' && item.code !== 'STANDARD') return false;
      return replacementPlanId
        ? item.id === replacementPlanId && Boolean(item.publishedAgreementVersionRef)
        : item.publishedAgreementVersionRef === null;
    }) ?? [];
  const publish = agreement.handleSubmit(async (value) => {
    if (!eligiblePlans.some((item) => item.id === value.planVersionId)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await commercialApi.publishAgreement(
        { ...value, templateId: value.templateId || undefined },
        controller.current?.signal,
      );
      if (current()) {
        setNotice(t('agreementSaved'));
        agreement.reset();
        setReplacementPlanId(null);
        setActiveTab('versions');
        await reload(controller.current?.signal);
      }
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : t('saveError'));
    } finally {
      if (current()) setBusy(false);
    }
  });
  const fields = (key: keyof z.infer<typeof planSchema>) =>
    plan.formState.errors[key] ? t('invalid') : undefined;
  const agreementError = (key: keyof z.infer<typeof agreementSchema>) =>
    agreement.formState.errors[key] ? t('invalid') : undefined;
  const section =
    'space-y-5 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-4 sm:p-6';
  const tabs = [
    { id: 'versions', label: t('publishedPlans'), icon: <Layers size={16} aria-hidden="true" /> },
    { id: 'create', label: t('newPlan'), icon: <Plus size={16} aria-hidden="true" /> },
    {
      id: 'agreement',
      label: t('newAgreement'),
      icon: <FileSignature size={16} aria-hidden="true" />,
    },
  ];
  const formatVnd = (amount?: string) => {
    if (!amount) return '—';
    try {
      return `${BigInt(amount).toLocaleString(locale)} VND`;
    } catch {
      return `${amount} VND`;
    }
  };
  const formatDate = (value: string) =>
    new Date(value).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const selectedVersion = terms?.plans.find((item) => item.id === selectedVersionId);
  const openDetails = async (item: PublishedCommercialTerms['plans'][number]) => {
    setSelectedVersionId(item.id);
    if (item.warehouseAllowance !== undefined || loadingDetails) return;
    setLoadingDetails(true);
    try {
      await reload(controller.current?.signal);
    } finally {
      if (current()) setLoadingDetails(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              void reload(controller.current?.signal);
            }}
          >
            <RefreshCw size={15} aria-hidden="true" className={busy ? 'animate-spin' : ''} />
            {t('refresh')}
          </Button>
        }
      />

      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <Tabs
        id="commercial-plan"
        label={t('title')}
        tabs={tabs}
        activeId={activeTab}
        onChange={(tab) => {
          if (tab !== 'agreement' && replacementPlanId) {
            setReplacementPlanId(null);
            agreement.reset();
          }
          setActiveTab(tab);
        }}
        disabled={busy}
      />

      <section
        role="tabpanel"
        id="commercial-plan-panel-versions"
        aria-labelledby="commercial-plan-versions"
        hidden={activeTab !== 'versions'}
        className="overflow-hidden rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)]"
      >
        {!terms && !error && (
          <p className="m-0 px-5 py-6 text-sm text-[var(--sc-text-secondary)]" role="status">
            {t('loading')}
          </p>
        )}
        {terms?.plans.length === 0 && (
          <p className="m-0 px-5 py-6 text-sm text-[var(--sc-text-secondary)]">
            {t('noPlanVersions')}
          </p>
        )}
        {!!terms?.plans.length && (
          <div className="overflow-x-auto">
            <table
              aria-label={t('agreementStatus')}
              className="w-full min-w-[880px] border-collapse text-left text-sm"
            >
              <thead className="border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/40 text-[11px] font-semibold uppercase tracking-wider text-[var(--sc-text-secondary)]">
                <tr>
                  <th scope="col" className="px-6 py-3.5">
                    {t('planName')}
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    {t('planCode')}
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    {t('planVersion')}
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-right">
                    {t('monthlyFee')}
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    {t('agreementStatus')}
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    {t('agreementRef')}
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-right">
                    {t('actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sc-border-default)]">
                {terms.plans.map((item) => (
                  <tr
                    key={item.id}
                    className="group cursor-pointer transition-colors duration-100 hover:bg-[var(--sc-bg-secondary)]/30"
                    onClick={() => void openDetails(item)}
                  >
                    {/* 1. Tên gói */}
                    <td className="whitespace-nowrap px-6 py-4">
                      <button
                        type="button"
                        className="text-left text-sm font-medium text-[var(--sc-text-primary)] transition-colors hover:text-[var(--sc-primary)]"
                        onClick={() => void openDetails(item)}
                        aria-label={t('planDetailsLabel', {
                          name: item.name,
                          version: item.versionNo,
                        })}
                      >
                        {item.name}
                      </button>
                    </td>

                    {/* 2. Phân loại */}
                    <td className="whitespace-nowrap px-5 py-4">
                      {item.code === 'ENTERPRISE' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                          <Crown size={14} className="text-amber-500" aria-hidden="true" />
                          Enterprise
                        </span>
                      ) : item.code === 'STANDARD' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-400">
                          <Zap size={14} className="text-indigo-500" aria-hidden="true" />
                          Standard
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                          <Package size={14} className="text-slate-500" aria-hidden="true" />
                          Basic
                        </span>
                      )}
                    </td>

                    {/* 3. Phiên bản */}
                    <td className="whitespace-nowrap px-4 py-4">
                      <span className="inline-flex items-center rounded-md border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/50 px-2 py-0.5 font-mono text-xs text-[var(--sc-text-secondary)]">
                        v{item.versionNo}
                      </span>
                    </td>

                    {/* 4. Phí tháng */}
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <span className="text-sm font-semibold tabular-nums text-[var(--sc-text-primary)]">
                        {formatVnd(item.monthlyFeeVnd)}
                      </span>
                    </td>

                    {/* 5. Trạng thái ký */}
                    <td className="whitespace-nowrap px-6 py-4">
                      {item.code === 'ENTERPRISE' ? (
                        <span className="inline-flex items-center rounded-full border border-slate-200/80 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {t('customAgreement')}
                        </span>
                      ) : item.availableAgreementVersionRef ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-400">
                          <span
                            className="size-1.5 rounded-full bg-emerald-500"
                            aria-hidden="true"
                          />
                          {t('agreementPublished')}
                        </span>
                      ) : item.publishedAgreementVersionRef ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-400">
                          <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                          {t('agreementUnavailable')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800">
                          {t('agreementUnpublished')}
                        </span>
                      )}
                    </td>

                    {/* 6. Mã mẫu điều khoản */}
                    <td className="whitespace-nowrap px-6 py-4">
                      {item.publishedAgreementVersionRef ? (
                        <span className="select-all font-mono text-xs font-medium tracking-wide text-slate-700 hover:text-[var(--sc-primary)] dark:text-slate-300">
                          {item.availableAgreementVersionRef ?? item.publishedAgreementVersionRef}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--sc-text-tertiary)]">—</span>
                      )}
                    </td>

                    {/* 7. Thao tác */}
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2.5">
                        {item.code !== 'ENTERPRISE' && (
                          <button
                            type="button"
                            className="text-xs font-medium text-[var(--sc-primary)] transition-colors hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              agreement.reset({
                                ...agreement.formState.defaultValues,
                                planVersionId: item.id,
                              });
                              setReplacementPlanId(
                                item.publishedAgreementVersionRef ? item.id : null,
                              );
                              setActiveTab('agreement');
                            }}
                          >
                            {t(
                              item.publishedAgreementVersionRef
                                ? 'replaceAgreement'
                                : 'publishAgreement',
                            )}
                          </button>
                        )}
                        <span className="inline-flex size-6 items-center justify-center rounded-full text-[var(--sc-text-tertiary)] transition-colors group-hover:bg-[var(--sc-bg-secondary)] group-hover:text-[var(--sc-text-primary)]">
                          <ChevronRight size={14} aria-hidden="true" />
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section
        role="tabpanel"
        id="commercial-plan-panel-create"
        aria-labelledby="commercial-plan-create"
        hidden={activeTab !== 'create'}
      >
        <form onSubmit={savePlan} className={section}>
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label={t('planCode')}
              isRequired
              options={['BASIC', 'STANDARD', 'ENTERPRISE'].map((value) => ({
                value,
                label: value,
              }))}
              {...plan.register('code', {
                onChange: (event) => {
                  const code: string = event.target.value;
                  if (code === 'BASIC' || code === 'STANDARD') {
                    plan.setValue('monthlyFeeVnd', code === 'BASIC' ? '4000000' : '12000000');
                    plan.setValue('salesOrderAllowance', code === 'BASIC' ? 500 : 1500);
                    plan.setValue('warehouseAllowance', code === 'BASIC' ? 1 : 3);
                    plan.setValue('storageAllowanceM3', code === 'BASIC' ? '10' : '30');
                    plan.setValue('name', code === 'BASIC' ? 'Basic' : 'Standard');
                  } else if (code === 'ENTERPRISE') {
                    plan.setValue('name', 'Enterprise');
                    plan.setValue('monthlyFeeVnd', '');
                    plan.setValue('salesOrderAllowance', Number.NaN);
                    plan.setValue('warehouseAllowance', Number.NaN);
                    plan.setValue('storageAllowanceM3', '');
                    plan.setValue('includedServices', '');
                  }
                },
              })}
            />
            <Input
              label={t('planName')}
              isRequired
              error={fields('name')}
              {...plan.register('name')}
            />
            <Input
              label={t('monthlyFee')}
              isRequired
              inputMode="numeric"
              error={fields('monthlyFeeVnd')}
              {...plan.register('monthlyFeeVnd')}
            />
            <Input
              label={t('warehouseAllowance')}
              isRequired
              type="number"
              min={1}
              error={fields('warehouseAllowance')}
              {...plan.register('warehouseAllowance', { valueAsNumber: true })}
            />
            <Input
              label={t('ordersAllowance')}
              isRequired
              type="number"
              min={0}
              error={fields('salesOrderAllowance')}
              {...plan.register('salesOrderAllowance', { valueAsNumber: true })}
            />
            <Input
              label={t('storageAllowance')}
              isRequired
              inputMode="decimal"
              helperText={t('storageHint')}
              error={fields('storageAllowanceM3')}
              {...plan.register('storageAllowanceM3')}
            />
            <Input
              label={t('includedServices')}
              helperText={t('servicesHint')}
              error={fields('includedServices')}
              {...plan.register('includedServices')}
            />
            <Input
              label={t('effectiveFrom')}
              isRequired
              type="date"
              error={fields('effectiveFrom')}
              {...plan.register('effectiveFrom')}
            />
          </div>
          <div className="flex justify-end border-t border-[var(--sc-border-default)] pt-4">
            <Button type="submit" isLoading={busy} disabled={!terms}>
              {t('publishPlan')}
            </Button>
          </div>
        </form>
      </section>
      <section
        role="tabpanel"
        id="commercial-plan-panel-agreement"
        aria-labelledby="commercial-plan-agreement"
        hidden={activeTab !== 'agreement'}
      >
        <form onSubmit={publish} className={section}>
          {replacementPlanId && <Alert variant="info">{t('replaceAgreementHelp')}</Alert>}
          {terms && eligiblePlans.length === 0 && (
            <Alert variant="info">{t('noEligibleAgreementPlans')}</Alert>
          )}
          {terms && (!terms.serviceTariffs.length || !terms.freightTariffs.length) && (
            <Alert variant="warning">{t('tariffsMissing')}</Alert>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label={t('planVersion')}
              isRequired
              error={agreementError('planVersionId')}
              placeholder={t('choose')}
              options={eligiblePlans.map((item) => ({
                value: item.id,
                label: `${item.name} · v${item.versionNo} · ${formatVnd(item.monthlyFeeVnd)}`,
              }))}
              {...agreement.register('planVersionId', {
                onChange: (event) => {
                  const selected = terms?.plans.find((item) => item.id === event.target.value);
                  if (selected?.code === 'BASIC') agreement.setValue('claimCapVnd', '20000000');
                  if (selected?.code === 'STANDARD') agreement.setValue('claimCapVnd', '35000000');
                },
              })}
            />
            <Input
              label={t('agreementVersion')}
              isRequired
              error={agreementError('versionRef')}
              {...agreement.register('versionRef')}
            />
            <Select
              label={t('serviceTariff')}
              isRequired
              error={agreementError('serviceTariffVersionId')}
              placeholder={t('choose')}
              options={
                terms?.serviceTariffs.map((item) => ({
                  value: item.id,
                  label: `${item.code} · v${item.versionNo}`,
                })) ?? []
              }
              {...agreement.register('serviceTariffVersionId')}
            />
            <Select
              label={t('freightTariff')}
              isRequired
              error={agreementError('freightTariffVersionId')}
              placeholder={t('choose')}
              options={
                terms?.freightTariffs.map((item) => ({
                  value: item.id,
                  label: `${item.code} · v${item.versionNo}`,
                })) ?? []
              }
              {...agreement.register('freightTariffVersionId')}
            />
            <Input
              label={t('deposit')}
              isRequired
              inputMode="numeric"
              error={agreementError('depositRequiredVnd')}
              {...agreement.register('depositRequiredVnd')}
            />
            <Input
              label={t('creditLimit')}
              isRequired
              inputMode="numeric"
              error={agreementError('creditLimitVnd')}
              {...agreement.register('creditLimitVnd')}
            />
            <Input
              label={t('claimCap')}
              isRequired
              inputMode="numeric"
              error={agreementError('claimCapVnd')}
              {...agreement.register('claimCapVnd')}
            />
            <Input
              label={t('signerRole')}
              isRequired
              error={agreementError('signerRole')}
              {...agreement.register('signerRole')}
            />
            <Input
              label={t('template')}
              helperText={t('templateHint')}
              error={agreementError('templateId')}
              {...agreement.register('templateId')}
            />
            <Select
              label={t('templateLayout')}
              isRequired
              options={[
                { value: 'BUSINESS_PROFILE_V1', label: t('businessProfileLayout') },
                { value: 'EXISTING_FIELDS', label: t('preparedLayout') },
              ]}
              {...agreement.register('compositionMode')}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sc-border-default)] pt-4">
            <p className="m-0 text-sm text-[var(--sc-text-secondary)]">{t('publicationHint')}</p>
            <Button
              type="submit"
              isLoading={busy}
              disabled={
                !eligiblePlans.length ||
                !terms?.serviceTariffs.length ||
                !terms.freightTariffs.length
              }
            >
              {t(replacementPlanId ? 'replaceAgreement' : 'publishAgreement')}
            </Button>
          </div>
        </form>
      </section>
      {selectedVersion && (
        <Modal
          isOpen
          title={selectedVersion.name}
          onClose={() => setSelectedVersionId(null)}
          width="520px"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Badge
                  status={selectedVersion.code === 'ENTERPRISE' ? 'info' : 'default'}
                  label={selectedVersion.code}
                />
                <span className="font-mono text-xs text-[var(--sc-text-secondary)]">
                  v{selectedVersion.versionNo}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-[var(--sc-text-secondary)]">{t('monthlyFee')}: </span>
                <span className="text-base font-semibold tabular-nums text-[var(--sc-text-primary)]">
                  {formatVnd(selectedVersion.monthlyFeeVnd)}
                </span>
              </div>
            </div>

            {loadingDetails ? (
              <p className="py-4 text-center text-sm text-[var(--sc-text-secondary)]" role="status">
                {t('loading')}
              </p>
            ) : selectedVersion.warehouseAllowance === undefined ? (
              <Alert variant="warning">
                {t('planDetailsUnavailable')}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void openDetails(selectedVersion)}
                >
                  {t('refresh')}
                </Button>
              </Alert>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="rounded-lg border border-[var(--sc-border-default)] p-3">
                    <p className="text-xs text-[var(--sc-text-secondary)]">
                      {t('warehouseAllowance')}
                    </p>
                    <p className="mt-1 text-base font-semibold tabular-nums text-[var(--sc-text-primary)]">
                      {selectedVersion.warehouseAllowance?.toLocaleString(locale) ?? '—'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--sc-border-default)] p-3">
                    <p className="text-xs text-[var(--sc-text-secondary)]">
                      {t('ordersAllowance')}
                    </p>
                    <p className="mt-1 text-base font-semibold tabular-nums text-[var(--sc-text-primary)]">
                      {selectedVersion.salesOrderAllowance?.toLocaleString(locale) ?? '—'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--sc-border-default)] p-3">
                    <p className="text-xs text-[var(--sc-text-secondary)]">
                      {t('storageAllowance')}
                    </p>
                    <p className="mt-1 text-base font-semibold tabular-nums text-[var(--sc-text-primary)]">
                      {selectedVersion.storageAllowanceM3 !== undefined
                        ? `${selectedVersion.storageAllowanceM3} m³`
                        : '—'}
                    </p>
                  </div>
                </div>

                {(selectedVersion.effectiveFrom || selectedVersion.effectiveTo) && (
                  <div className="flex flex-wrap gap-4 text-xs text-[var(--sc-text-secondary)]">
                    {selectedVersion.effectiveFrom && (
                      <span>
                        {t('effectiveFrom')}:{' '}
                        <strong className="font-medium text-[var(--sc-text-primary)]">
                          {formatDate(selectedVersion.effectiveFrom)}
                        </strong>
                      </span>
                    )}
                    {selectedVersion.effectiveTo && (
                      <span>
                        {t('planEffectiveTo')}:{' '}
                        <strong className="font-medium text-[var(--sc-text-primary)]">
                          {formatDate(selectedVersion.effectiveTo)}
                        </strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {selectedVersion.includedServices && (
              <div className="rounded-lg border border-[var(--sc-border-default)] p-3.5">
                <h4 className="text-xs font-medium text-[var(--sc-text-secondary)]">
                  {t('includedServices')}
                </h4>
                {selectedVersion.includedServices.length ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {[...new Set(selectedVersion.includedServices)].map((service) => (
                      <li
                        key={service}
                        className="rounded bg-[var(--sc-bg-secondary)] px-2 py-0.5 text-xs text-[var(--sc-text-primary)]"
                      >
                        {service}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-[var(--sc-text-tertiary)]">
                    {t('noIncludedServices')}
                  </p>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
