import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { Select } from '@/components/Common/Select/Select';
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
  compositionMode: z.enum(['EXISTING_FIELDS', 'ORCA_REFERENCE_16_V1', 'BUSINESS_PROFILE_V1']),
  depositRequiredVnd: money,
  creditLimitVnd: money,
  claimCapVnd: money,
});

export function CommercialPlanAdmin() {
  const t = useTranslations('CommercialAdmin');
  const [terms, setTerms] = useState<PublishedCommercialTerms | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const revision = useAuthStore((state) => state.revision);
  const plan = useForm<z.infer<typeof planSchema>>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      code: 'BASIC',
      name: 'Basic',
      monthlyFeeVnd: '7000000',
      salesOrderAllowance: 500,
      warehouseAllowance: 1,
      storageAllowanceM3: '',
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
      claimCapVnd: '',
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
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : t('saveError'));
    } finally {
      if (current()) setBusy(false);
    }
  });
  const publish = agreement.handleSubmit(async (value) => {
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
    'space-y-4 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-5';
  return (
    <div className="space-y-5">
      <div className="flex justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-[var(--sc-text-secondary)]">{t('description')}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void reload(controller.current?.signal);
          }}
        >
          {t('refresh')}
        </Button>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}
      <form onSubmit={savePlan} className={section}>
        <h2 className="text-lg font-semibold">{t('newPlan')}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label={t('planCode')}
            options={['BASIC', 'STANDARD', 'ENTERPRISE'].map((value) => ({ value, label: value }))}
            {...plan.register('code', {
              onChange: (event) => {
                const code: string = event.target.value;
                if (code === 'BASIC' || code === 'STANDARD') {
                  plan.setValue('monthlyFeeVnd', code === 'BASIC' ? '7000000' : '12000000');
                  plan.setValue('salesOrderAllowance', code === 'BASIC' ? 500 : 1500);
                  plan.setValue('warehouseAllowance', code === 'BASIC' ? 1 : 3);
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
          <Input label={t('planName')} error={fields('name')} {...plan.register('name')} />
          <Input
            label={t('monthlyFee')}
            inputMode="numeric"
            error={fields('monthlyFeeVnd')}
            {...plan.register('monthlyFeeVnd')}
          />
          <Input
            label={t('warehouseAllowance')}
            type="number"
            min={1}
            error={fields('warehouseAllowance')}
            {...plan.register('warehouseAllowance', { valueAsNumber: true })}
          />
          <Input
            label={t('ordersAllowance')}
            type="number"
            min={0}
            error={fields('salesOrderAllowance')}
            {...plan.register('salesOrderAllowance', { valueAsNumber: true })}
          />
          <Input
            label={t('storageAllowance')}
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
            type="date"
            error={fields('effectiveFrom')}
            {...plan.register('effectiveFrom')}
          />
        </div>
        <Button type="submit" isLoading={busy}>
          {t('publishPlan')}
        </Button>
      </form>
      <form onSubmit={publish} className={section}>
        <h2 className="text-lg font-semibold">{t('newAgreement')}</h2>
        {terms && (!terms.serviceTariffs.length || !terms.freightTariffs.length) && (
          <Alert variant="warning">{t('tariffsMissing')}</Alert>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label={t('planVersion')}
            error={agreementError('planVersionId')}
            placeholder={t('choose')}
            options={
              terms?.plans
                .filter((item) => item.code === 'BASIC' || item.code === 'STANDARD')
                .map((item) => ({
                  value: item.id,
                  label: `${item.name} · v${item.versionNo} · ${item.monthlyFeeVnd} VND`,
                })) ?? []
            }
            {...agreement.register('planVersionId')}
          />
          <Input
            label={t('agreementVersion')}
            error={agreementError('versionRef')}
            {...agreement.register('versionRef')}
          />
          <Select
            label={t('serviceTariff')}
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
            inputMode="numeric"
            error={agreementError('depositRequiredVnd')}
            {...agreement.register('depositRequiredVnd')}
          />
          <Input
            label={t('creditLimit')}
            inputMode="numeric"
            error={agreementError('creditLimitVnd')}
            {...agreement.register('creditLimitVnd')}
          />
          <Input
            label={t('claimCap')}
            inputMode="numeric"
            error={agreementError('claimCapVnd')}
            {...agreement.register('claimCapVnd')}
          />
          <Input
            label={t('signerRole')}
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
            options={[
              { value: 'ORCA_REFERENCE_16_V1', label: t('referenceLayout') },
              { value: 'BUSINESS_PROFILE_V1', label: t('businessProfileLayout') },
              { value: 'EXISTING_FIELDS', label: t('preparedLayout') },
            ]}
            {...agreement.register('compositionMode')}
          />
        </div>
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('publicationHint')}</p>
        <Button
          type="submit"
          isLoading={busy}
          disabled={!terms?.serviceTariffs.length || !terms.freightTariffs.length}
        >
          {t('publishAgreement')}
        </Button>
      </form>
      {terms && (
        <section className={section}>
          <h2 className="text-lg font-semibold">{t('publishedPlans')}</h2>
          {terms.plans.map((item) => (
            <p className="text-sm" key={item.id}>
              {item.name} · v{item.versionNo} · {item.monthlyFeeVnd} VND
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
