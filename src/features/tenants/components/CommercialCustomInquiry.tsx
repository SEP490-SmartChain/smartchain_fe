import { useCallback, useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, MessageSquare } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { createUuid } from '@/lib/uuid';
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
  const operation = useRef(createUuid());
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
    <details
      aria-busy={loading}
      open={inquiries.length > 0 || !!error}
      className="group rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] shadow-[var(--sc-shadow-section)]"
    >
      <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 rounded-2xl px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-primary)] sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)]">
          <MessageSquare size={19} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{t('customInquiry')}</span>
          <span className="mt-0.5 block text-xs leading-5 text-[var(--sc-text-secondary)]">
            {t(inquiries.length > 0 ? 'inquiryHistory' : 'customInquiryHint')}
          </span>
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="shrink-0 text-[var(--sc-text-secondary)] transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="space-y-3 border-t border-[var(--sc-border-light)] px-5 py-4 sm:px-6">
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
        {allowSubmit && !loading && !error && inquiries.length === 0 && (
          <form onSubmit={submit} className="space-y-3">
            <Input
              label={t('inquiryMessage')}
              error={form.formState.errors.message ? t('inquiryInvalid') : undefined}
              {...form.register('message')}
            />
            <Button type="submit" isLoading={form.formState.isSubmitting}>
              {t('sendInquiry')}
            </Button>
          </form>
        )}
      </div>
    </details>
  );
}
