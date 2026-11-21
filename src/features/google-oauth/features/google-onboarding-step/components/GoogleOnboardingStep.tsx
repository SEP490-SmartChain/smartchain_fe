import { useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import { Input } from '@/components/Common/Input/Input';

import { notifyInvalidForm } from '@/lib/errorNotifications';

import {
  googleOnboardingRegisterSchema,
  type GoogleOAuthApiPort,
  type GoogleOnboardingFormData,
  type GoogleOnboardingProfileDto,
} from '../../../shared';
import { useGoogleOnboarding } from '../hooks/useGoogleOnboarding';
import { buildGoogleOnboardingDefaults } from '../lib/buildGoogleOnboardingDefaults';

type TaxLookupState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'found'; address?: string }
  | { status: 'not_found' }
  | { status: 'error' };

export interface GoogleOnboardingStepProps {
  api: GoogleOAuthApiPort;
  onboardingToken: string;
  googleProfile: GoogleOnboardingProfileDto;
  rememberSession?: boolean;
  onError?: (message?: string) => void;
}

/**
 * Step 3 of the Google sign-up flow. Google already verified the email, so the
 * form only collects business details and never asks for a password.
 */
export function GoogleOnboardingStep({
  api,
  onboardingToken,
  googleProfile,
  rememberSession,
  onError,
}: GoogleOnboardingStepProps) {
  const t = useTranslations('Auth');
  const defaults = buildGoogleOnboardingDefaults(googleProfile);
  const { submit, isSubmitting, hasError } = useGoogleOnboarding({
    api,
    onboardingToken,
    ...(rememberSession === undefined ? {} : { rememberSession }),
    ...(onError ? { onError } : {}),
  });
  const [lookup, setLookup] = useState<TaxLookupState>({ status: 'idle' });
  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    trigger,
    watch,
    formState: { errors },
  } = useForm<GoogleOnboardingFormData>({
    resolver: zodResolver(googleOnboardingRegisterSchema),
    mode: 'onTouched',
    defaultValues: {
      onboardingToken,
      email: defaults.email,
      fullName: defaults.fullName,
      phone: '',
      taxId: '',
      companyName: '',
    },
  });

  const taxId = watch('taxId');

  const handleTaxLookup = async () => {
    const value = (getValues('taxId') ?? '').trim();
    if (!value || !(await trigger('taxId'))) {
      notifyInvalidForm();
      return;
    }

    setLookup({ status: 'searching' });
    try {
      const business = await api.lookupBusinessTaxId(value);
      if ((getValues('taxId') ?? '').trim() !== value) return;
      if (!business) {
        setLookup({ status: 'not_found' });
        return;
      }
      setValue('companyName', business.name, { shouldValidate: true, shouldDirty: true });
      setLookup(
        business.address ? { status: 'found', address: business.address } : { status: 'found' },
      );
    } catch {
      if ((getValues('taxId') ?? '').trim() === value) {
        setLookup({ status: 'error' });
      }
    }
  };

  const onSubmit = async (values: GoogleOnboardingFormData) => {
    await submit(values);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit, () => notifyInvalidForm())}
      noValidate
      aria-label={t('google_onboarding_heading')}
      className="flex w-full flex-col gap-5"
    >
      <div>
        <h2 className="m-0 text-xl font-semibold text-[var(--sc-text-primary)]">
          {t('google_onboarding_heading')}
        </h2>
        <p className="mb-0 mt-2 text-sm leading-5 text-[var(--sc-text-secondary)]">
          {t('google_onboarding_subheading')}
        </p>
      </div>

      <Badge
        status="success"
        variant="solid"
        label={t('google_onboarding_badge', { email: googleProfile.email })}
      />
      <p className="m-0 text-xs leading-5 text-[var(--sc-text-secondary)]">
        {t('google_onboarding_no_password')}
      </p>

      {hasError && <Alert variant="error">{t('google_error_generic')}</Alert>}

      <input type="hidden" {...register('onboardingToken')} />
      <input type="hidden" {...register('email')} />
      <input type="hidden" {...register('fullName')} />

      <Input
        id="google-onboarding-phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        label={t('phone_label')}
        placeholder={t('phone_placeholder')}
        required
        disabled={isSubmitting}
        {...register('phone')}
        error={errors.phone?.message}
        aria-invalid={!!errors.phone}
      />

      <div>
        <div className="flex items-end gap-2">
          <Input
            id="google-onboarding-tax-id"
            inputMode="numeric"
            label={t('tax_id_label')}
            placeholder={t('tax_id_placeholder')}
            disabled={isSubmitting || lookup.status === 'searching'}
            {...register('taxId', {
              onChange: () => setLookup({ status: 'idle' }),
            })}
            error={errors.taxId?.message}
            aria-invalid={!!errors.taxId}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={handleTaxLookup}
            isLoading={lookup.status === 'searching'}
            disabled={!taxId || isSubmitting || lookup.status === 'searching'}
            className="shrink-0"
          >
            {lookup.status !== 'searching' ? <Search aria-hidden="true" size={16} /> : null}
            {lookup.status === 'searching' ? t('tax_lookup_searching') : t('tax_lookup_button')}
          </Button>
        </div>

        {lookup.status === 'found' && (
          <p role="status" className="mb-0 mt-1.5 text-xs text-[var(--sc-success-dark)]">
            {t('tax_lookup_found')}
            {lookup.address ? ` — ${t('tax_lookup_address_label')}: ${lookup.address}` : null}
          </p>
        )}
        {lookup.status === 'not_found' && (
          <p role="status" className="mb-0 mt-1.5 text-xs text-[var(--sc-warning-dark)]">
            {t('tax_lookup_not_found')}
          </p>
        )}
        {lookup.status === 'error' && (
          <Alert variant="error" compact className="mt-1.5">
            {t('tax_lookup_error')}
          </Alert>
        )}
      </div>

      <Input
        id="google-onboarding-company-name"
        autoComplete="organization"
        label={t('company_name_label')}
        placeholder={t('company_name_placeholder')}
        required
        disabled={isSubmitting}
        {...register('companyName')}
        error={errors.companyName?.message}
        aria-invalid={!!errors.companyName}
      />

      <Checkbox
        id="google-onboarding-terms"
        label={t('agree_to_terms_label')}
        required
        disabled={isSubmitting}
        {...register('agreeToTerms')}
        error={errors.agreeToTerms?.message}
      />

      <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting} className="w-full">
        {t(isSubmitting ? 'google_onboarding_submitting' : 'google_onboarding_submit')}
      </Button>
    </form>
  );
}
