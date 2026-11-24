import { useCallback, useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, MessageSquare, RefreshCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { notifyInvalidForm } from '@/lib/errorNotifications';
import { createUuid } from '@/lib/uuid';
import { useAuthStore } from '@/stores/authStore';

import { commercialApi } from '../api/commercialApi';

const schema = z.object({ message: z.string().trim().min(10).max(2000) });
type Inquiry = Awaited<ReturnType<typeof commercialApi.inquiries>>[number];

export function CommercialCustomInquiry() {
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
  const submit = form.handleSubmit(
    async (input) => {
      if (loading || inquiries.length > 0 || running.current) return;
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
    },
    () => notifyInvalidForm(),
  );
  return (
    <details
      aria-busy={loading}
      open={inquiries.length > 0 || !!error}
      className="group overflow-hidden rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] shadow-[var(--sc-shadow-section)]"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 outline-none transition-colors hover:bg-[var(--sc-bg-secondary)]/40 focus-visible:ring-2 focus-visible:ring-[var(--sc-primary)] sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary)]">
          <MessageSquare size={16} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--sc-text-primary)]">
            {t('customInquiry')}
          </span>
          <span className="mt-0.5 block text-xs text-[var(--sc-text-secondary)]">
            {t(inquiries.length > 0 ? 'inquiryHistory' : 'customInquiryHint')}
          </span>
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="shrink-0 text-[var(--sc-text-secondary)] transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="space-y-3 border-t border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/30 px-5 py-4 sm:px-6">
        {error && <Alert variant="error">{error}</Alert>}
        {loading && (
          <p role="status" className="m-0 text-xs text-[var(--sc-text-secondary)]">
            {t('inquiryLoading')}
          </p>
        )}
        {sent && <Alert variant="success">{t('inquirySubmitted')}</Alert>}
        {!loading && inquiries.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--sc-text-secondary)]">
                {t('inquiryHistory')}
              </h4>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || form.formState.isSubmitting}
                onClick={() => void reload(controller.current?.signal)}
              >
                <RefreshCw size={13} />
                {t('refresh')}
              </Button>
            </div>
            <Alert variant="info" compact>
              {t('inquiryPending')}
            </Alert>
            <ul className="space-y-2">
              {inquiries.map((inquiry) => (
                <li
                  key={inquiry.operationKey}
                  className="rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-3.5 text-sm"
                >
                  <p className="m-0 whitespace-pre-wrap break-words text-[var(--sc-text-primary)]">
                    {inquiry.message}
                  </p>
                  <p className="mb-0 mt-1.5 text-xs text-[var(--sc-text-secondary)]">
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
          </div>
        )}
        {!loading && !error && inquiries.length === 0 && (
          <form
            onSubmit={submit}
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
          >
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
