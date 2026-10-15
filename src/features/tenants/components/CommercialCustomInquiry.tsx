import { useCallback, useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { useAuthStore } from '@/stores/authStore';

import { commercialApi } from '../api/commercialApi';

const schema = z.object({ message: z.string().trim().min(10).max(2000) });
type Inquiry = Awaited<ReturnType<typeof commercialApi.inquiries>>[number];

export function CommercialCustomInquiry({ allowSubmit = true }: { allowSubmit?: boolean }) {
  const t = useTranslations('Commercial');
  const locale = useLocale();
  const revision = useAuthStore((state) => state.revision);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { message: '' },
  });
  const operation = useRef(crypto.randomUUID());
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const rows = await commercialApi.inquiries(undefined, signal);
        if (signal?.aborted || revision !== useAuthStore.getState().revision) return;
        setInquiries(rows);
        setError(null);
      } catch (failure) {
        if (!signal?.aborted && revision === useAuthStore.getState().revision) {
          setError(failure instanceof Error ? failure.message : t('inquiryLoadFailed'));
        }
      } finally {
        if (!signal?.aborted && revision === useAuthStore.getState().revision) setLoading(false);
      }
    },
    [revision, t],
  );
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    void reload(abort.signal);
    return () => {
      abort.abort();
    };
  }, [reload]);
  const submit = form.handleSubmit(async (input) => {
    if (!allowSubmit || loading || inquiries.length > 0 || running.current) return;
    running.current = true;
    setError(null);
    const current = () =>
      !controller.current?.signal.aborted && revision === useAuthStore.getState().revision;
    try {
      const result = await commercialApi.inquire(
        input.message,
        operation.current,
        controller.current?.signal,
      );
      if (current()) {
        setSent(true);
        setInquiries([{ ...result, message: input.message }]);
        form.reset();
      }
    } catch (failure) {
      if (current()) {
        await reload(controller.current?.signal);
        if (current()) setError(failure instanceof Error ? failure.message : t('inquiryFailed'));
      }
    } finally {
      running.current = false;
    }
  });
  return (
    <section
      aria-busy={loading}
      className="space-y-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-5"
    >
      <h3 className="text-base font-semibold">{t('customInquiry')}</h3>
      <p className="text-sm text-[var(--sc-text-secondary)]">{t('customInquiryHint')}</p>
      {error && <Alert variant="error">{error}</Alert>}
      <Button
        variant="ghost"
        size="sm"
        disabled={loading || form.formState.isSubmitting}
        onClick={() => void reload(controller.current?.signal)}
      >
        {t('refresh')}
      </Button>
      {loading && <p role="status">{t('inquiryLoading')}</p>}
      {sent && <Alert variant="success">{t('inquirySubmitted')}</Alert>}
      {!loading && inquiries.length > 0 && (
        <>
          {allowSubmit && <Alert variant="info">{t('inquiryPending')}</Alert>}
          <h4 className="font-medium">{t('inquiryHistory')}</h4>
          <ul className="space-y-3">
            {inquiries.map((inquiry) => (
              <li
                key={inquiry.operationKey}
                className="rounded-lg border border-[var(--sc-border-default)] p-4"
              >
                <p className="whitespace-pre-wrap break-words">{inquiry.message}</p>
                <p className="mt-2 text-xs text-[var(--sc-text-secondary)]">
                  {t('inquirySentAt')}:{' '}
                  <time dateTime={inquiry.submittedAt}>
                    {new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'Asia/Ho_Chi_Minh',
                    }).format(new Date(inquiry.submittedAt))}
                  </time>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      {!loading && !error && inquiries.length === 0 && (
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('noInquiries')}</p>
      )}
      {allowSubmit && !loading && !error && inquiries.length === 0 && (
        <form onSubmit={submit} className="space-y-3">
          <Input
            aria-required
            label={t('inquiryMessage')}
            error={form.formState.errors.message ? t('inquiryInvalid') : undefined}
            {...form.register('message')}
          />
          <Button type="submit" isLoading={form.formState.isSubmitting}>
            {t('sendInquiry')}
          </Button>
        </form>
      )}
    </section>
  );
}
