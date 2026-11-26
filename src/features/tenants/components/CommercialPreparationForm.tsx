import { useEffect, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import { Input } from '@/components/Common/Input/Input';
import type { Warehouse } from '@/features/catalog';
import { notifyInvalidForm } from '@/lib/errorNotifications';

import { PlanWarehousePicker } from './PlanWarehousePicker';
import {
  commercialApi,
  type AgreementRates,
  type CommercialPlan,
  type ContractBusinessProfile,
} from '../api/commercialApi';
import {
  loadActivePlatformWarehouses,
  validatePlanWarehouseSelection,
} from '../lib/warehouseSelection';
import { contractBusinessProfileSchema } from '../schemas/contractBusinessProfileSchema';

import type { z } from 'zod';

interface PreparationProps {
  plan: CommercialPlan;
  busy: boolean;
  warehouseSelectionEnabled?: boolean;
  onSubmit: (profile?: ContractBusinessProfile, warehouseIds?: string[]) => Promise<void>;
  onPreview: () => void;
}

const PROFILE_FIELDS = [
  'legalName',
  'address',
  'registrationNumber',
  'representativeName',
  'representativeTitle',
  'authorityBasis',
  'phone',
] as const;

export function CommercialPreparationForm({
  plan,
  busy,
  warehouseSelectionEnabled = false,
  onSubmit,
  onPreview,
}: PreparationProps) {
  const t = useTranslations('Commercial');
  const locale = useLocale();
  const tariffText = useTranslations('ServiceTariffs');
  const [rates, setRates] = useState<AgreementRates | null>(null);
  const [ratesError, setRatesError] = useState(false);
  const [ratesRevision, setRatesRevision] = useState(0);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehousesLoading, setWarehousesLoading] = useState(false);
  const [warehousesError, setWarehousesError] = useState<string | null>(null);
  const [warehousesRevision, setWarehousesRevision] = useState(0);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<string[]>([]);
  const [warehousesConfirmed, setWarehousesConfirmed] = useState(false);
  const agreementId = plan.agreementId;
  useEffect(() => {
    if (!agreementId) return;
    const controller = new AbortController();
    void commercialApi.agreementRates(agreementId, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setRates(result);
      },
      () => {
        if (!controller.signal.aborted) setRatesError(true);
      },
    );
    return () => controller.abort();
  }, [agreementId, ratesRevision]);
  useEffect(() => {
    if (!warehouseSelectionEnabled) return;
    const controller = new AbortController();
    setWarehousesLoading(true);
    setWarehousesError(null);
    void loadActivePlatformWarehouses(controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        setWarehouses(result);
        setWarehousesLoading(false);
      },
      (failure: unknown) => {
        if (controller.signal.aborted) return;
        setWarehousesLoading(false);
        setWarehousesError(failure instanceof Error ? failure.message : t('warehouseLoadError'));
      },
    );
    return () => controller.abort();
  }, [warehouseSelectionEnabled, warehousesRevision, t]);
  const warehousePlanRule = {
    code: plan.code ?? 'BASIC',
    warehouseAllowance: plan.warehouseAllowance ?? 1,
  };
  const warehouseValidation = validatePlanWarehouseSelection(
    warehousePlanRule,
    selectedWarehouseIds,
  );
  const warehousesReady =
    !warehouseSelectionEnabled || (warehouseValidation.valid && warehousesConfirmed);
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'VND' });
  const range = (from: number | string, to: number | string | null) =>
    to === null ? t('unboundedRate', { from }) : t('boundedRate', { from, to });
  const schema = contractBusinessProfileSchema(plan.requiresBusinessProfile);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      legalName: '',
      address: '',
      registrationNumber: '',
      representativeName: '',
      representativeTitle: '',
      authorityBasis: '',
      phone: '',
      hasReviewedTerms: false,
    },
  });
  const submit = form.handleSubmit(
    async ({ hasReviewedTerms: _reviewed, registrationNumber, ...profile }) => {
      if (!rates) return;
      if (warehouseSelectionEnabled && (!warehouseValidation.valid || !warehousesConfirmed)) {
        notifyInvalidForm();
        return;
      }
      await onSubmit(
        plan.requiresBusinessProfile
          ? { ...profile, ...(registrationNumber ? { registrationNumber } : {}) }
          : undefined,
        warehouseSelectionEnabled ? warehouseValidation.normalizedIds : undefined,
      );
    },
    () => notifyInvalidForm(),
  );

  return (
    <form noValidate onSubmit={submit} className="space-y-4">
      <section
        aria-label={t('rateReview')}
        className="space-y-3 rounded-xl border border-[var(--sc-border-default)] p-4 text-sm"
      >
        <h4 className="font-semibold">{t('rateReview')}</h4>
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-[var(--sc-bg-secondary)] p-3">
          <div>
            <dt>{t('monthlyCharge')}</dt>
            <dd className="font-semibold">
              {plan.monthlyFeeVnd ? money.format(BigInt(plan.monthlyFeeVnd)) : '—'}
            </dd>
          </div>
          {typeof plan.depositRequiredVnd === 'string' && (
            <div>
              <dt>{t('initialDeposit')}</dt>
              <dd className="font-semibold">{money.format(BigInt(plan.depositRequiredVnd))}</dd>
            </div>
          )}
        </dl>
        {!rates && !ratesError && <p role="status">{t('ratesLoading')}</p>}
        {ratesError && (
          <Alert variant="error">
            <p className="m-0">{t('ratesError')}</p>
            <Button
              className="mt-2"
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setRatesError(false);
                setRatesRevision((revision) => revision + 1);
              }}
            >
              {t('ratesRetry')}
            </Button>
          </Alert>
        )}
        {rates && (
          <>
            <details className="overflow-hidden rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)]">
              <summary className="cursor-pointer bg-[var(--sc-bg-secondary)]/50 px-3.5 py-2.5 text-xs font-semibold text-[var(--sc-text-primary)]">
                {t('serviceRates')} · {rates.service.code} v{rates.service.versionNo}
              </summary>
              {rates.service.lines.length ? (
                <div className="overflow-x-auto border-t border-[var(--sc-border-default)]">
                  <table
                    aria-label={t('serviceRates')}
                    className="w-full min-w-[360px] text-left text-xs"
                  >
                    <thead className="border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/40 text-[11px] font-semibold uppercase tracking-wider text-[var(--sc-text-secondary)]">
                      <tr>
                        <th scope="col" className="px-3.5 py-2">
                          {t('rateItem')}
                        </th>
                        <th scope="col" className="px-3.5 py-2">
                          {t('rateUnit')}
                        </th>
                        <th scope="col" className="px-3.5 py-2">
                          {t('rateBand')}
                        </th>
                        <th scope="col" className="px-3.5 py-2 text-right">
                          {t('unitPrice')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--sc-border-default)]">
                      {rates.service.lines.map((line) => (
                        <tr key={[line.feeType, line.unit, line.lowerBound].join('/')}>
                          <td className="px-3.5 py-2 font-medium text-[var(--sc-text-primary)]">
                            {tariffText.has('fee_' + line.feeType)
                              ? tariffText('fee_' + line.feeType)
                              : line.feeType}
                          </td>
                          <td className="px-3.5 py-2 text-[var(--sc-text-secondary)]">
                            {tariffText.has('unit_' + line.unit)
                              ? tariffText('unit_' + line.unit)
                              : line.unit}
                          </td>
                          <td className="px-3.5 py-2 text-[var(--sc-text-secondary)]">
                            {range(line.lowerBound, line.upperBound)}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-2 text-right font-semibold tabular-nums text-[var(--sc-text-primary)]">
                            {money.format(BigInt(line.unitPriceVnd))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="m-0 px-3.5 py-2.5 text-xs text-[var(--sc-text-secondary)]">
                  {t('noRateLines')}
                </p>
              )}
            </details>
            <details className="overflow-hidden rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)]">
              <summary className="cursor-pointer bg-[var(--sc-bg-secondary)]/50 px-3.5 py-2.5 text-xs font-semibold text-[var(--sc-text-primary)]">
                {t('freightRates')} · {rates.freight.code} v{rates.freight.versionNo}
              </summary>
              {rates.freight.lines.length ? (
                <div className="overflow-x-auto border-t border-[var(--sc-border-default)]">
                  <table
                    aria-label={t('freightRates')}
                    className="w-full min-w-[500px] text-left text-xs"
                  >
                    <thead className="border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/40 text-[11px] font-semibold uppercase tracking-wider text-[var(--sc-text-secondary)]">
                      <tr>
                        <th scope="col" className="px-3.5 py-2">
                          {t('shippingLane')}
                        </th>
                        <th scope="col" className="px-3.5 py-2">
                          {t('weightBand')}
                        </th>
                        <th scope="col" className="px-3.5 py-2">
                          {t('baseRate')}
                        </th>
                        <th scope="col" className="px-3.5 py-2">
                          {t('stepRate')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--sc-border-default)]">
                      {rates.freight.lines.map((line) => (
                        <tr key={[line.direction, line.laneCode, line.minWeightG].join('/')}>
                          <td className="px-3.5 py-2 font-medium text-[var(--sc-text-primary)]">
                            {line.laneCode}
                            <span className="ml-1.5 text-[11px] font-normal text-[var(--sc-text-secondary)]">
                              · {t(line.direction === 'RETURN' ? 'returnRate' : 'outboundRate')}
                            </span>
                          </td>
                          <td className="px-3.5 py-2 text-[var(--sc-text-secondary)]">
                            {range(line.minWeightG, line.maxWeightG)}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-2 font-semibold tabular-nums text-[var(--sc-text-primary)]">
                            {money.format(BigInt(line.basePriceVnd))}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-2 tabular-nums text-[var(--sc-text-secondary)]">
                            {t('stepAmount', {
                              price: money.format(BigInt(line.stepPriceVnd)),
                              weight: line.stepWeightG,
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="m-0 px-3.5 py-2.5 text-xs text-[var(--sc-text-secondary)]">
                  {t('noRateLines')}
                </p>
              )}
            </details>
          </>
        )}
      </section>
      <p className="text-sm text-[var(--sc-text-secondary)]">{t('profileHelp')}</p>
      {plan.requiresBusinessProfile && (
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('registeredProfileHelp')}</p>
      )}
      {plan.requiresBusinessProfile && (
        <div className="grid gap-4 sm:grid-cols-2">
          {PROFILE_FIELDS.map((field) => (
            <Input
              key={field}
              label={t(`profile.${field}`)}
              required={field !== 'registrationNumber'}
              {...form.register(field)}
              disabled={busy}
              error={form.formState.errors[field] ? t('profileInvalid') : undefined}
            />
          ))}
        </div>
      )}
      {warehouseSelectionEnabled ? (
        <PlanWarehousePicker
          plan={warehousePlanRule}
          warehouses={warehouses}
          loading={warehousesLoading}
          errorMessage={warehousesError}
          selectedIds={selectedWarehouseIds}
          confirmed={warehousesConfirmed}
          disabled={busy}
          onChangeIds={setSelectedWarehouseIds}
          onChangeConfirmed={setWarehousesConfirmed}
          onRetry={() => setWarehousesRevision((count) => count + 1)}
        />
      ) : null}

      <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/30 p-3.5">
        <Checkbox
          {...form.register('hasReviewedTerms')}
          required
          disabled={busy}
          label={t('reviewedTerms')}
          error={form.formState.errors.hasReviewedTerms ? t('reviewRequired') : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sc-border-default)] pt-3.5">
        <Button type="button" variant="outline" size="sm" onClick={onPreview} disabled={busy}>
          {t('preview')}
        </Button>
        <Button
          type="submit"
          disabled={!rates || !warehousesReady}
          isLoading={busy || form.formState.isSubmitting}
        >
          {t('confirmPrepare')}
        </Button>
      </div>
    </form>
  );
}
