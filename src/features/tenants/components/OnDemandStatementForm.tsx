import { useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarRange } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';
import { Input } from '@/components/Common/Input/Input';

import { payoutApi } from '../api/payoutApi';
import {
  onDemandPayoutSchema,
  onDemandPeriod,
  payoutReadError,
  vietnamToday,
  type OnDemandPayoutValues,
} from '../schemas/payoutSchema';

interface OnDemandStatementFormProps {
  tenantId: string;
  onCreated: (statementId: string) => void;
  onCancel: () => void;
}

export function OnDemandStatementForm({
  tenantId,
  onCreated,
  onCancel,
}: OnDemandStatementFormProps) {
  const t = useTranslations('Payouts.onDemand');
  const [error, setError] = useState<string | null>(null);
  // One operation key per intent, so a retry after a lost response cannot create a second statement.
  const operationKey = useRef<string>(crypto.randomUUID());
  const today = vietnamToday(new Date());
  const form = useForm<OnDemandPayoutValues>({
    resolver: zodResolver(onDemandPayoutSchema),
    defaultValues: { periodFrom: today, periodTo: today },
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  const handleCreate = async (values: OnDemandPayoutValues) => {
    setError(null);
    try {
      const result = await payoutApi.createOnDemand(
        { operationKey: operationKey.current, ...onDemandPeriod(values, new Date()) },
        tenantId,
      );
      onCreated(result.statementId);
    } catch (failure) {
      setError(payoutReadError(failure, t('error')));
    }
  };

  return (
    <Card className="sc-card-enter">
      <form className="space-y-4" onSubmit={handleSubmit(handleCreate)} noValidate>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-lg bg-[var(--sc-primary-alpha-08)] p-2 text-[var(--sc-primary)]">
            <CalendarRange size={18} aria-hidden />
          </span>
          <div>
            <h3 className="font-semibold">{t('title')}</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--sc-text-secondary)]">
              {t('help')}
            </p>
          </div>
        </div>
        {error && <Alert variant="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            type="date"
            label={t('from')}
            max={today}
            isRequired
            disabled={isSubmitting}
            error={errors.periodFrom ? t('invalidDate') : undefined}
            {...register('periodFrom')}
          />
          <Input
            type="date"
            label={t('to')}
            max={today}
            isRequired
            disabled={isSubmitting}
            helperText={t('toHelp')}
            error={errors.periodTo ? t('invalidRange') : undefined}
            {...register('periodTo')}
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" disabled={isSubmitting} onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {t('submit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
