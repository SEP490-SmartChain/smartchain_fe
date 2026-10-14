import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { useAuthStore } from '@/stores/authStore';

import { commercialApi } from '../api/commercialApi';

const schema = z.object({ message: z.string().trim().min(10).max(2000) });
export function CommercialCustomInquiry() {
  const t = useTranslations('Commercial');
  const revision = useAuthStore((state) => state.revision);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { message: '' },
  });
  const operation = useRef(crypto.randomUUID());
  const controller = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    return () => {
      abort.abort();
    };
  }, []);
  const submit = form.handleSubmit(async (input) => {
    setError(null);
    const current = () =>
      !controller.current?.signal.aborted && revision === useAuthStore.getState().revision;
    try {
      await commercialApi.inquire(input.message, operation.current, controller.current?.signal);
      if (current()) {
        setSent(true);
        form.reset();
      }
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : t('inquiryFailed'));
    }
  });
  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-5"
    >
      <h3 className="text-base font-semibold">{t('customInquiry')}</h3>
      <p className="text-sm text-[var(--sc-text-secondary)]">{t('customInquiryHint')}</p>
      {error && <Alert variant="error">{error}</Alert>}
      {sent ? (
        <Alert variant="success">{t('inquirySubmitted')}</Alert>
      ) : (
        <>
          <Input
            label={t('inquiryMessage')}
            error={form.formState.errors.message ? t('inquiryInvalid') : undefined}
            {...form.register('message')}
          />
          <Button type="submit" isLoading={form.formState.isSubmitting}>
            {t('sendInquiry')}
          </Button>
        </>
      )}
    </form>
  );
}
