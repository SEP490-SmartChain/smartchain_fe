import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { Select } from '@/components/Common/Select/Select';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';
import { useLocaleStore } from '@/stores/localeStore';

import { CommercialQuotaPanel } from './CommercialQuotaPanel';
import { commercialApi, type OnboardingInvoice } from '../api/commercialApi';

const pdfFiles = z.custom<FileList>(
  (value) =>
    typeof FileList !== 'undefined' &&
    value instanceof FileList &&
    value.length === 1 &&
    value[0]?.type === 'application/pdf' &&
    value[0].size <= 20 * 1024 * 1024,
);
const receiptSchema = z.object({
  bankReference: z.string().trim().min(3).max(120),
  amountVnd: z.string().regex(/^[1-9]\d{0,19}$/),
  receivedAt: z
    .string()
    .min(1)
    .refine((value) => Number.isFinite(new Date(value).getTime())),
  file: pdfFiles,
  verified: z.boolean().refine((value) => value === true),
});

function BankReceiptForm({
  tenantId,
  invoice,
  onPosted,
}: {
  tenantId: string;
  invoice: OnboardingInvoice;
  onPosted: () => Promise<void>;
}) {
  const t = useTranslations('CommercialAdmin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const operation = useRef(crypto.randomUUID());
  const evidence = useRef<{ file: File; key: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const revision = useAuthStore((state) => state.revision);
  const form = useForm<z.infer<typeof receiptSchema>>({
    resolver: zodResolver(receiptSchema),
    defaultValues: {
      bankReference: '',
      amountVnd: (BigInt(invoice.totalVnd) - BigInt(invoice.paidVnd)).toString(),
      receivedAt: '',
      verified: false,
    },
  });
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    return () => {
      abort.abort();
    };
  }, []);
  const submit = form.handleSubmit(async (input) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const file = input.file[0];
    if (!file) {
      setBusy(false);
      return;
    }
    const current = () =>
      !controller.current?.signal.aborted && revision === useAuthStore.getState().revision;
    try {
      if (evidence.current?.file !== file) {
        const uploaded = await commercialApi.bankEvidence(
          tenantId,
          invoice.id,
          file,
          controller.current?.signal,
        );
        if (!current()) return;
        evidence.current = { file, key: uploaded.evidenceKey };
      }
      if (!evidence.current) return;
      const posted = await commercialApi.postBank(
        tenantId,
        invoice.id,
        {
          operationKey: operation.current,
          bankReference: input.bankReference,
          amountVnd: input.amountVnd,
          receivedAt: new Date(input.receivedAt).toISOString(),
          evidenceKey: evidence.current.key,
        },
        controller.current?.signal,
      );
      if (!current()) return;
      setNotice(`${t('receiptSaved')} ${t('unallocated', { amount: posted.unallocatedVnd })}`);
      form.reset();
      operation.current = crypto.randomUUID();
      evidence.current = null;
      await onPosted();
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : t('saveError'));
    } finally {
      if (current()) setBusy(false);
    }
  });
  const invalid = (key: keyof z.infer<typeof receiptSchema>) =>
    form.formState.errors[key] ? t('invalid') : undefined;
  return (
    <form
      onSubmit={submit}
      className="mt-5 space-y-4 border-t border-[var(--sc-border-default)] pt-4"
    >
      <h3 className="text-base font-semibold">{t('bankReceipt')}</h3>
      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label={t('bankReference')}
          error={invalid('bankReference')}
          {...form.register('bankReference')}
        />
        <Input
          label={t('receivedAmount')}
          inputMode="numeric"
          error={invalid('amountVnd')}
          {...form.register('amountVnd')}
        />
        <Input
          label={t('receivedAt')}
          type="datetime-local"
          error={invalid('receivedAt')}
          {...form.register('receivedAt')}
        />
        <Input
          label={t('bankPdf')}
          type="file"
          accept="application/pdf"
          error={invalid('file')}
          {...form.register('file')}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...form.register('verified')} />
        {t('verifyBank')}
      </label>
      {form.formState.errors.verified && (
        <p className="text-sm text-[var(--sc-error)]">{t('invalid')}</p>
      )}
      <Button type="submit" isLoading={busy}>
        {t('postReceipt')}
      </Button>
    </form>
  );
}

export function CommercialBilling({ tenantId: fixedTenantId }: { tenantId?: string }) {
  const t = useTranslations('Commercial');
  const admin = useTranslations('CommercialAdmin');
  const userScope = useAuthStore((state) => state.user?.actorScope);
  const revision = useAuthStore((state) => state.revision);
  const locale = useLocaleStore((state) => state.locale);
  const { can } = useAccess();
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState('');
  const [invoices, setInvoices] = useState<OnboardingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const target = fixedTenantId ?? (userScope === 'PLATFORM' ? selected : undefined);
  const controller = useRef<AbortController | null>(null);
  const money = (value: string) =>
    `${BigInt(value).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')} VND`;
  useEffect(() => {
    const abort = new AbortController();
    if (userScope === 'PLATFORM' && !fixedTenantId) {
      void commercialApi
        .financialSellers(abort.signal)
        .then((result) => {
          if (!abort.signal.aborted) setSellers(result);
        })
        .catch((failure) => {
          if (!abort.signal.aborted) {
            setError(failure instanceof Error ? failure.message : admin('loadError'));
          }
        });
    }
    return () => {
      abort.abort();
    };
  }, [userScope, fixedTenantId, revision, admin]);
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    if (userScope === 'PLATFORM' && !target) {
      setLoading(false);
      return () => {
        abort.abort();
      };
    }
    setLoading(true);
    void commercialApi
      .invoices(abort.signal, target)
      .then((result) => {
        if (!abort.signal.aborted) {
          setInvoices(result);
          setError(null);
        }
      })
      .catch((failure) => {
        if (!abort.signal.aborted) {
          setError(failure instanceof Error ? failure.message : admin('loadError'));
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => {
      abort.abort();
    };
  }, [target, userScope, revision, admin]);
  const reload = async () => {
    try {
      const result = await commercialApi.invoices(controller.current?.signal, target);
      if (!controller.current?.signal.aborted && revision === useAuthStore.getState().revision) {
        setInvoices(result);
        setError(null);
      }
    } catch (failure) {
      if (!controller.current?.signal.aborted) {
        setError(failure instanceof Error ? failure.message : admin('loadError'));
      }
    }
  };
  return (
    <section className="space-y-4">
      {userScope === 'TENANT' && <CommercialQuotaPanel />}
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="text-lg font-semibold">{admin('financeTitle')}</h2>
        <Button
          variant="outline"
          size="sm"
          disabled={userScope === 'PLATFORM' && !target}
          onClick={() => {
            void reload();
          }}
        >
          {t('refresh')}
        </Button>
      </div>
      {userScope === 'PLATFORM' && !fixedTenantId && (
        <Select
          label={admin('selectSeller')}
          placeholder={admin('selectSeller')}
          options={sellers.map((seller) => ({ value: seller.id, label: seller.name }))}
          value={selected}
          onChange={(event) => {
            setInvoices([]);
            setSelected(event.target.value);
          }}
        />
      )}
      {error && <Alert variant="error">{error}</Alert>}
      {loading && <p role="status">{admin('loading')}</p>}
      {!loading && (userScope !== 'PLATFORM' || target) && invoices.length === 0 && (
        <Alert variant="info">{admin('noInvoices')}</Alert>
      )}
      {invoices.map((invoice) => (
        <article
          key={invoice.id}
          className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-5"
        >
          <h3 className="text-base font-semibold">
            {t('invoice')}: {invoice.invoiceNo}
          </h3>
          <p className="my-2 text-sm">
            {t('total')}: {money(invoice.totalVnd)} · {t('paid')}: {money(invoice.paidVnd)} ·{' '}
            {t('due')}: {invoice.dueOn}
          </p>
          <p className="text-sm">
            {t('paymentStatus')}: {t(`payment.${invoice.paymentStatus}`)}
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {invoice.obligations.map((item) => (
              <li key={item.id}>
                {t(`purpose.${item.purpose}`)}: {money(item.paidVnd)} / {money(item.amountDueVnd)}
              </li>
            ))}
          </ul>
          {target &&
            invoice.documentType === 'ONBOARDING' &&
            invoice.paymentStatus !== 'PAID' &&
            can('invoice.bankReceipt.post') && (
              <BankReceiptForm
                key={`${invoice.id}:${revision}`}
                tenantId={target}
                invoice={invoice}
                onPosted={reload}
              />
            )}
        </article>
      ))}
    </section>
  );
}
