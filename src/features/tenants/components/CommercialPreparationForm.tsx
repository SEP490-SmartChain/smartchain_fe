import { useEffect, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/Common/Button/Button';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import { Input } from '@/components/Common/Input/Input';

import {
  commercialApi,
  type AgreementRates,
  type CommercialPlan,
  type ContractBusinessProfile,
} from '../api/commercialApi';
import { contractBusinessProfileSchema } from '../schemas/contractBusinessProfileSchema';

import type { z } from 'zod';

interface PreparationProps {
  plan: CommercialPlan;
  busy: boolean;
  onSubmit: (profile?: ContractBusinessProfile) => Promise<void>;
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

export function CommercialPreparationForm({ plan, busy, onSubmit, onPreview }: PreparationProps) {
  const t = useTranslations('Commercial');
  const locale = useLocale();
  const tariffText = useTranslations('ServiceTariffs');
  const [rates, setRates] = useState<AgreementRates | null>(null);
  const [ratesError, setRatesError] = useState(false);
  const [ratesRevision, setRatesRevision] = useState(0);
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
      await onSubmit(
        plan.requiresBusinessProfile
          ? { ...profile, ...(registrationNumber ? { registrationNumber } : {}) }
          : undefined,
      );
    },
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
          <div role="alert" className="space-y-2">
            <p>{t('ratesError')}</p>
            <Button
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
          </div>
        )}
        {rates && (
          <>
            <details className="rounded-lg border border-[var(--sc-border-default)] p-3">
              <summary className="cursor-pointer font-semibold">
                {t('serviceRates')} · {rates.service.code} v{rates.service.versionNo}
              </summary>
              {rates.service.lines.length ? (
                <div className="mt-2 overflow-x-auto">
                  <table aria-label={t('serviceRates')} className="w-full min-w-[360px] text-left">
                    <thead>
                      <tr>
                        <th scope="col">{t('rateItem')}</th>
                        <th scope="col">{t('rateUnit')}</th>
                        <th scope="col">{t('rateBand')}</th>
                        <th scope="col" className="text-right">
                          {t('unitPrice')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--sc-border-default)]">
                      {rates.service.lines.map((line) => (
                        <tr key={[line.feeType, line.unit, line.lowerBound].join('/')}>
                          <td className="py-2">
                            {tariffText.has('fee_' + line.feeType)
                              ? tariffText('fee_' + line.feeType)
                              : line.feeType}
                          </td>
                          <td>
                            {tariffText.has('unit_' + line.unit)
                              ? tariffText('unit_' + line.unit)
                              : line.unit}
                          </td>
                          <td>{range(line.lowerBound, line.upperBound)}</td>
                          <td className="whitespace-nowrap text-right font-medium">
                            {money.format(BigInt(line.unitPriceVnd))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-2">{t('noRateLines')}</p>
              )}
            </details>
            <details className="rounded-lg border border-[var(--sc-border-default)] p-3">
              <summary className="cursor-pointer font-semibold">
                {t('freightRates')} · {rates.freight.code} v{rates.freight.versionNo}
              </summary>
              {rates.freight.lines.length ? (
                <div className="mt-2 overflow-x-auto">
                  <table aria-label={t('freightRates')} className="w-full min-w-[500px] text-left">
                    <thead>
                      <tr>
                        <th scope="col">{t('shippingLane')}</th>
                        <th scope="col">{t('weightBand')}</th>
                        <th scope="col">{t('baseRate')}</th>
                        <th scope="col">{t('stepRate')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--sc-border-default)]">
                      {rates.freight.lines.map((line) => (
                        <tr key={[line.direction, line.laneCode, line.minWeightG].join('/')}>
                          <td className="py-2">
                            {line.laneCode}
                            <br />
                            {t(line.direction === 'RETURN' ? 'returnRate' : 'outboundRate')}
                          </td>
                          <td>{range(line.minWeightG, line.maxWeightG)}</td>
                          <td className="whitespace-nowrap font-medium">
                            {money.format(BigInt(line.basePriceVnd))}
                          </td>
                          <td className="whitespace-nowrap">
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
                <p className="mt-2">{t('noRateLines')}</p>
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
      <Button type="button" variant="outline" onClick={onPreview} disabled={busy}>
        {t('preview')}
      </Button>
      <Checkbox
        {...form.register('hasReviewedTerms')}
        required
        disabled={busy}
        label={t('reviewedTerms')}
        error={form.formState.errors.hasReviewedTerms ? t('reviewRequired') : undefined}
      />
      <Button type="submit" disabled={!rates} isLoading={busy || form.formState.isSubmitting}>
        {t('confirmPrepare')}
      </Button>
    </form>
  );
}
