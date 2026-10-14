import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/Common/Button/Button';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import { Input } from '@/components/Common/Input/Input';

import { contractBusinessProfileSchema } from '../schemas/contractBusinessProfileSchema';

import type { CommercialPlan, ContractBusinessProfile } from '../api/commercialApi';
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
      await onSubmit(
        plan.requiresBusinessProfile
          ? { ...profile, ...(registrationNumber ? { registrationNumber } : {}) }
          : undefined,
      );
    },
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-[var(--sc-text-secondary)]">{t('profileHelp')}</p>
      {plan.requiresBusinessProfile && (
        <div className="grid gap-4 sm:grid-cols-2">
          {PROFILE_FIELDS.map((field) => (
            <Input
              key={field}
              label={t(`profile.${field}`)}
              {...form.register(field)}
              disabled={busy}
              error={form.formState.errors[field] ? t('profileInvalid') : undefined}
            />
          ))}
        </div>
      )}
      <Button variant="outline" onClick={onPreview} disabled={busy}>
        {t('preview')}
      </Button>
      <Checkbox
        {...form.register('hasReviewedTerms')}
        disabled={busy}
        label={t('reviewedTerms')}
        error={form.formState.errors.hasReviewedTerms ? t('reviewRequired') : undefined}
      />
      <Button type="submit" isLoading={busy || form.formState.isSubmitting}>
        {t('confirmPrepare')}
      </Button>
    </form>
  );
}
