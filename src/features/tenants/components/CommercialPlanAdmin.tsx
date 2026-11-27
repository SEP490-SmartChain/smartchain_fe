import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { Controller, useForm, useWatch } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, FileSignature, Layers, Plus, RefreshCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { PageHeader } from '@/components/Common/PageHeader/PageHeader';
import { Select } from '@/components/Common/Select/Select';
import { Tabs } from '@/components/Common/Tabs/Tabs';
import { calendarDateSchema, vietnamToday } from '@/lib/dateValidation';
import { notifyInvalidForm } from '@/lib/errorNotifications';
import { storageVolumeSchema } from '@/lib/volumeValidation';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { PlanIncludedServices, planServiceLabel } from './PlanIncludedServices';
import { commercialApi, type PublishedCommercialTerms } from '../api/commercialApi';
import { freightTariffLabel } from '../lib/freightTariffLabel';

const money = z.string().regex(/^(0|[1-9]\d{0,19})$/);
const planSchema = z.object({
  code: z.enum(['BASIC', 'STANDARD', 'ENTERPRISE']),
  name: z.string().trim().min(1).max(100),
  monthlyFeeVnd: money,
  salesOrderAllowance: z.number().int().min(0).max(100000000),
  warehouseAllowance: z.number().int().min(1).max(100000),
  storageAllowanceM3: storageVolumeSchema,
  includedServices: z.array(z.string().min(1).max(200)).max(100),
  effectiveFrom: calendarDateSchema,
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
const agreementDefaults: z.infer<typeof agreementSchema> = {
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
};
type AdminPlan = PublishedCommercialTerms['plans'][number];

function canPublishPlan(plan: AdminPlan, now: number): boolean {
  return (
    (plan.code === 'BASIC' || plan.code === 'STANDARD') &&
    !plan.supersededByPlanVersionNo &&
    (!plan.effectiveTo || Date.parse(plan.effectiveTo) > now)
  );
}

export function CommercialPlanAdmin() {
  const revision = useAuthStore((state) => state.revision);
  return <CommercialPlanAdminContent key={revision} revision={revision} />;
}

function CommercialPlanAdminContent({ revision }: { revision: number }) {
  const t = useTranslations('CommercialAdmin');
  const dateText = useTranslations('DateValidation');
  const volumeText = useTranslations('VolumeValidation');
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState('versions');
  const [replacementPlanId, setReplacementPlanId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [terms, setTerms] = useState<PublishedCommercialTerms | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [planSource, setPlanSource] = useState<AdminPlan>();
  const [planNeedsReload, setPlanNeedsReload] = useState(false);
  const planSourceInitialized = useRef(false);
  const publishingPlan = useRef(false);
  const active = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const termsRequest = useRef(0);
  const serviceHelpId = useId();
  const serviceErrorId = useId();
  const plan = useForm<z.infer<typeof planSchema>>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      code: 'BASIC',
      name: 'Basic',
      monthlyFeeVnd: '4000000',
      salesOrderAllowance: 500,
      warehouseAllowance: 1,
      storageAllowanceM3: '10',
      includedServices: [],
      effectiveFrom: vietnamToday(),
    },
  });
  const agreement = useForm<z.infer<typeof agreementSchema>>({
    resolver: zodResolver(agreementSchema),
    defaultValues: agreementDefaults,
  });
  const [planVersionId, serviceTariffVersionId, freightTariffVersionId] = useWatch({
    control: agreement.control,
    name: ['planVersionId', 'serviceTariffVersionId', 'freightTariffVersionId'],
  });
  const { getValues, resetField } = plan;
  const serviceOptions = terms?.includedServiceOptions;
  const beginPlanVersion = useCallback(
    (result: PublishedCommercialTerms, code: string) => {
      if (!result.includedServiceOptions) return;
      const previous = result.plans.reduce<AdminPlan | undefined>(
        (latest, item) =>
          item.code === code && item.versionNo > (latest?.versionNo ?? 0) ? item : latest,
        undefined,
      );
      const validCodes = new Set(result.includedServiceOptions.map((item) => item.code));
      resetField('includedServices', {
        defaultValue:
          previous?.includedServiceSelections
            ?.map((item) => item.code)
            .filter((code) => validCodes.has(code)) ?? [],
      });
      setPlanSource(previous);
      setPlanNeedsReload(false);
      planSourceInitialized.current = true;
    },
    [resetField],
  );
  const current = useCallback(
    () => active.current && revision === useAuthStore.getState().revision,
    [revision],
  );
  const reload = useCallback(
    async (signal?: AbortSignal, resetSource = false) => {
      const request = ++termsRequest.current;
      try {
        const result = await commercialApi.publishedTerms(signal);
        if (current() && !signal?.aborted && request === termsRequest.current) {
          setTerms(result);
          if (resetSource || !planSourceInitialized.current) {
            beginPlanVersion(result, getValues('code'));
          }
          setError(null);
        }
      } catch (failure) {
        if (current() && !signal?.aborted && request === termsRequest.current) {
          setError(failure instanceof Error ? failure.message : t('loadError'));
        }
      }
    },
    [beginPlanVersion, current, getValues, t],
  );
  useEffect(() => {
    active.current = true;
    const abort = new AbortController();
    controller.current = abort;
    void reload(abort.signal);
    return () => {
      active.current = false;
      abort.abort();
    };
  }, [reload]);
  const savePlan = plan.handleSubmit(
    async (value) => {
      if (publishingPlan.current || !serviceOptions || planNeedsReload) return;
      if (
        value.includedServices.some((code) => !serviceOptions.some((item) => item.code === code))
      ) {
        setPlanNeedsReload(true);
        return;
      }
      publishingPlan.current = true;
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const result = await commercialApi.createPlan(
          { ...value, expectedVersionNo: planSource?.versionNo ?? 0 },
          controller.current?.signal,
        );
        if (!current()) return;
        agreement.setValue('planVersionId', value.code === 'ENTERPRISE' ? '' : result.id);
        setNotice(t('planSaved'));
        setTerms(null);
        planSourceInitialized.current = false;
        await reload(controller.current?.signal, true);
        if (current()) setActiveTab('versions');
      } catch (failure) {
        if (current()) {
          if (
            failure instanceof ApiError &&
            ['COMMERCIAL.PLAN_VERSION_STALE', 'COMMERCIAL.INVALID_INCLUDED_SERVICE_CODE'].includes(
              failure.code,
            )
          ) {
            setPlanNeedsReload(true);
          }
          setError(failure instanceof Error ? failure.message : t('saveError'));
        }
      } finally {
        publishingPlan.current = false;
        if (current()) setBusy(false);
      }
    },
    () => notifyInvalidForm(),
  );
  const replacement = terms?.plans.find(
    (item) => item.id === replacementPlanId,
  )?.publishedAgreement;
  const now = Date.now();
  const eligiblePlans =
    terms?.plans.filter((item) => {
      if (!canPublishPlan(item, now)) return false;
      return replacementPlanId
        ? item.id === replacementPlanId && Boolean(item.publishedAgreement)
        : !item.publishedAgreementVersionRef;
    }) ?? [];
  const publish = agreement.handleSubmit(
    async (value) => {
      if (!eligiblePlans.some((item) => item.id === value.planVersionId)) return;
      if (terms?.plans.some((item) => item.publishedAgreementVersionRef === value.versionRef)) {
        agreement.setError('versionRef', { type: 'manual', message: t('agreementRefAlreadyUsed') });
        return;
      }
      if (!terms?.serviceTariffs.some((item) => item.id === value.serviceTariffVersionId)) {
        agreement.setError('serviceTariffVersionId', {
          type: 'manual',
          message: t('chooseCurrentTariff'),
        });
        return;
      }
      if (!terms.freightTariffs.some((item) => item.id === value.freightTariffVersionId)) {
        agreement.setError('freightTariffVersionId', {
          type: 'manual',
          message: t('chooseCurrentTariff'),
        });
        return;
      }
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
          agreement.reset(agreementDefaults);
          setReplacementPlanId(null);
          setActiveTab('versions');
          await reload(controller.current?.signal);
        }
      } catch (failure) {
        if (current()) setError(failure instanceof Error ? failure.message : t('saveError'));
      } finally {
        if (current()) setBusy(false);
      }
    },
    () => notifyInvalidForm(),
  );
  const openAgreement = (item: AdminPlan) => {
    const published = item.publishedAgreement;
    if (item.publishedAgreementVersionRef && !published) {
      setError(t('agreementSettingsUnavailable'));
      return;
    }
    setError(null);
    setNotice(null);
    agreement.reset({
      ...agreementDefaults,
      ...published,
      planVersionId: item.id,
      versionRef: '',
      claimCapVnd:
        published?.claimCapVnd ??
        (item.code === 'STANDARD' ? '35000000' : agreementDefaults.claimCapVnd),
      compositionMode:
        published?.compositionMode === 'BUSINESS_PROFILE_V1'
          ? 'BUSINESS_PROFILE_V1'
          : 'EXISTING_FIELDS',
    });
    setReplacementPlanId(published ? item.id : null);
    setActiveTab('agreement');
  };
  const fields = (key: keyof z.infer<typeof planSchema>) =>
    plan.formState.errors[key] ? t('invalid') : undefined;
  const agreementError = (key: keyof z.infer<typeof agreementSchema>) => {
    const fieldError = agreement.formState.errors[key];
    return fieldError?.type === 'manual'
      ? fieldError.message
      : fieldError
        ? t('invalid')
        : undefined;
  };
  const tariffOptions = (
    tariffs: PublishedCommercialTerms['serviceTariffs'],
    previousId?: string,
    labelOf: (item: PublishedCommercialTerms['serviceTariffs'][number]) => string = (item) =>
      `${item.code} · v${item.versionNo}`,
  ) => [
    ...tariffs.map((item) => ({ value: item.id, label: labelOf(item) })),
    ...(previousId && !tariffs.some((item) => item.id === previousId)
      ? [{ value: previousId, label: t('previousTariffUnavailable'), disabled: true }]
      : []),
  ];
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
  const previousServiceText = planSource?.includedServiceSelections
    ? planSource.includedServiceSelections
        .filter((selection) => !serviceOptions?.some(({ code }) => code === selection.code))
        .map((item) => planServiceLabel(item, locale))
    : (planSource?.includedServices ?? []);
  const sortedPlans = [...(terms?.plans ?? [])].sort(
    (a, b) => a.code.localeCompare(b.code) || b.versionNo - a.versionNo,
  );
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
            agreement.reset(agreementDefaults);
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
              className="w-full min-w-[850px] border-collapse text-left text-sm"
            >
              <thead className="border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] text-xs font-semibold text-[var(--sc-text-secondary)]">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    {t('planName')}
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3 py-3">
                    {t('planVersion')}
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3 py-3 text-right">
                    {t('monthlyFee')}
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3 py-3">
                    {t('agreementStatus')}
                  </th>
                  <th scope="col" className="px-3 py-3">
                    {t('agreementRef')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    {t('actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sc-border-default)]">
                {sortedPlans.map((item) => (
                  <tr
                    key={item.id}
                    className="transition-colors hover:bg-[var(--sc-bg-secondary)]/40"
                  >
                    <th scope="row" className="min-w-36 px-4 py-3 text-[var(--sc-text-primary)]">
                      <div className="space-y-1.5">
                        <div className="font-semibold leading-snug">{item.name}</div>
                        <Badge
                          status={item.code === 'BASIC' ? 'default' : 'info'}
                          label={item.code}
                        />
                      </div>
                    </th>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Badge
                        status="default"
                        variant="outline"
                        label={t('planVersionTag', { version: item.versionNo })}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <span className="text-sm font-semibold tabular-nums text-[var(--sc-text-primary)]">
                        {formatVnd(item.monthlyFeeVnd)}
                      </span>
                    </td>

                    <td className="px-3 py-3">
                      {item.code === 'ENTERPRISE' ? (
                        <Badge status="info" label={t('customAgreement')} />
                      ) : item.supersededByPlanVersionNo ? (
                        <div className="space-y-1">
                          <Badge status="default" label={t('agreementSuperseded')} />
                          <div className="text-xs text-[var(--sc-text-secondary)]">
                            {t('agreementSupersededBy', {
                              version: item.supersededByPlanVersionNo,
                            })}
                          </div>
                        </div>
                      ) : item.availableAgreementVersionRef ? (
                        <Badge status="success" label={t('agreementPublished')} />
                      ) : item.publishedAgreementVersionRef ? (
                        <Badge status="warning" label={t('agreementUnavailable')} />
                      ) : (
                        <Badge status="default" label={t('agreementUnpublished')} />
                      )}
                    </td>
                    <td className="min-w-36 max-w-56 px-3 py-3">
                      {item.publishedAgreementVersionRef ? (
                        <span className="select-all break-words font-mono text-xs font-semibold text-[var(--sc-text-primary)]">
                          {item.publishedAgreementVersionRef}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--sc-text-tertiary)]">—</span>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canPublishPlan(item, now) && (
                          <Button
                            type="button"
                            size="sm"
                            variant={item.publishedAgreementVersionRef ? 'outline' : 'primary'}
                            onClick={() => openAgreement(item)}
                            disabled={busy}
                          >
                            <FileSignature size={15} aria-hidden="true" />
                            {t(
                              item.publishedAgreementVersionRef
                                ? 'replaceAgreementAction'
                                : 'publishAgreement',
                            )}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void openDetails(item)}
                          aria-label={t('planDetailsLabel', {
                            name: item.name,
                            version: item.versionNo,
                          })}
                        >
                          <Eye size={15} aria-hidden="true" />
                          <span className="hidden 2xl:inline">{t('viewDetails')}</span>
                        </Button>
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
              disabled={busy}
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
                  }
                  if (terms) beginPlanVersion(terms, code);
                },
              })}
              error={plan.formState.errors?.code?.message}
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
              helperText={`${t('storageHint')} ${volumeText('decimalHint')}`}
              error={plan.formState.errors.storageAllowanceM3 ? volumeText('invalid') : undefined}
              {...plan.register('storageAllowanceM3')}
            />
            <Input
              label={t('effectiveFrom')}
              isRequired
              type="date"
              error={fields('effectiveFrom') ? dateText('invalidDate') : undefined}
              {...plan.register('effectiveFrom')}
            />
          </div>
          <fieldset className="space-y-2" disabled={!serviceOptions || busy || planNeedsReload}>
            <legend className="text-sm font-medium text-[var(--sc-text-primary)]">
              {t('includedServices')}
            </legend>
            <Controller
              control={plan.control}
              name="includedServices"
              render={({ field, fieldState }) => (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {serviceOptions?.map((option, index) => (
                      <Checkbox
                        key={option.code}
                        ref={index === 0 ? field.ref : undefined}
                        name={field.name}
                        label={planServiceLabel(option, locale)}
                        checked={field.value.includes(option.code)}
                        onBlur={field.onBlur}
                        onChange={(event) => {
                          field.onChange(
                            event.target.checked
                              ? [...field.value, option.code]
                              : field.value.filter((code) => code !== option.code),
                          );
                        }}
                        aria-describedby={
                          fieldState.invalid ? `${serviceHelpId} ${serviceErrorId}` : serviceHelpId
                        }
                        aria-invalid={fieldState.invalid || undefined}
                      />
                    ))}
                  </div>
                  {fieldState.invalid && (
                    <Alert id={serviceErrorId} variant="error" compact>
                      {t('invalid')}
                    </Alert>
                  )}
                </>
              )}
            />
            <p id={serviceHelpId} className="m-0 text-xs text-[var(--sc-text-secondary)]">
              {t('servicesHint')}
            </p>
          </fieldset>
          {!serviceOptions && (
            <p role="status" className="m-0 text-sm text-[var(--sc-text-secondary)]">
              {terms || error ? t('serviceOptionsUnavailable') : t('loading')}
            </p>
          )}
          {planNeedsReload && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void reload(controller.current?.signal, true)}
            >
              {t('reloadPlanServices')}
            </Button>
          )}
          {previousServiceText.length > 0 && (
            <div className="rounded-lg border border-[var(--sc-border-default)] p-3 text-sm">
              <p className="m-0 font-medium">{t('previousServiceText')}</p>
              <ul className="mb-0 mt-2 list-disc space-y-1 pl-5 text-[var(--sc-text-secondary)]">
                {[...new Set(previousServiceText)].map((item) => (
                  <li key={item} className="whitespace-pre-wrap break-words">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end border-t border-[var(--sc-border-default)] pt-4">
            <Button type="submit" isLoading={busy} disabled={!serviceOptions || planNeedsReload}>
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
              value={planVersionId}
              {...agreement.register('planVersionId', {
                onChange: (event) => {
                  if (replacementPlanId) return;
                  const selected = terms?.plans.find((item) => item.id === event.target.value);
                  if (selected?.code === 'BASIC') agreement.setValue('claimCapVnd', '20000000');
                  if (selected?.code === 'STANDARD') agreement.setValue('claimCapVnd', '35000000');
                },
              })}
            />
            <Input
              label={t('agreementVersion')}
              helperText={
                replacement ? t('newAgreementRefHint', { ref: replacement.versionRef }) : undefined
              }
              isRequired
              error={agreementError('versionRef')}
              {...agreement.register('versionRef')}
            />
            <Select
              label={t('serviceTariff')}
              isRequired
              error={agreementError('serviceTariffVersionId')}
              placeholder={t('choose')}
              options={tariffOptions(
                terms?.serviceTariffs ?? [],
                replacement?.serviceTariffVersionId,
              )}
              value={serviceTariffVersionId}
              {...agreement.register('serviceTariffVersionId')}
            />
            <Select
              label={t('freightTariff')}
              isRequired
              error={agreementError('freightTariffVersionId')}
              placeholder={t('choose')}
              options={tariffOptions(
                terms?.freightTariffs ?? [],
                replacement?.freightTariffVersionId,
                (item) => freightTariffLabel(item, t('freightCarrierApi')),
              )}
              value={freightTariffVersionId}
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
              error={agreement.formState.errors?.compositionMode?.message}
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
                  {t('planVersionTag', { version: selectedVersion.versionNo })}
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

            <PlanIncludedServices
              labels={
                selectedVersion.includedServiceSelections ??
                selectedVersion.includedServices?.map((label) => ({
                  labelVi: label,
                  labelEn: label,
                }))
              }
              className="rounded-lg border border-[var(--sc-border-default)] p-3.5"
              showEmpty={selectedVersion.includedServices !== undefined}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
