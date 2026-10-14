import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { Select } from '@/components/Common/Select/Select';
import { useAuthStore } from '@/stores/authStore';

import { CommercialAdminControls } from './CommercialAdminControls';
import { CommercialBilling } from './CommercialBilling';
import { CommercialQuotaPanel } from './CommercialQuotaPanel';
import {
  commercialApi,
  type PublishedCommercialTerms,
  type SellerCommercialState,
} from '../api/commercialApi';

const money = z.string().regex(/^(0|[1-9]\d{0,19})$/);
const customSchema = z.object({
  planVersionId: z.string().uuid(),
  serviceTariffVersionId: z.string().uuid(),
  freightTariffVersionId: z.string().uuid(),
  agreementVersionRef: z.string().trim().min(1).max(100),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  depositRequiredVnd: money,
  creditLimitVnd: money,
  claimCapVnd: money,
});
const evidenceSchema = z.object({
  file: z.custom<FileList>(
    (value) =>
      typeof FileList !== 'undefined' &&
      value instanceof FileList &&
      value.length === 1 &&
      value[0]?.type === 'application/pdf' &&
      value[0].size <= 20 * 1024 * 1024,
  ),
});
const confirmationSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export function TenantContractTab({ tenantId }: { tenantId: string }) {
  const t = useTranslations('CommercialAdmin');
  const owner = useTranslations('Commercial');
  const [state, setState] = useState<SellerCommercialState | null>(null);
  const [inquiries, setInquiries] = useState<
    { operationKey: string; message: string; submittedAt: string }[]
  >([]);
  const [terms, setTerms] = useState<PublishedCommercialTerms | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const revision = useAuthStore((value) => value.revision);
  const custom = useForm<z.infer<typeof customSchema>>({
    resolver: zodResolver(customSchema),
    defaultValues: {
      planVersionId: '',
      serviceTariffVersionId: '',
      freightTariffVersionId: '',
      agreementVersionRef: '',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      depositRequiredVnd: '3000000',
      creditLimitVnd: '5000000',
      claimCapVnd: '',
    },
  });
  const evidence = useForm<z.infer<typeof evidenceSchema>>({
    resolver: zodResolver(evidenceSchema),
  });
  const confirmation = useForm<z.infer<typeof confirmationSchema>>({
    resolver: zodResolver(confirmationSchema),
    defaultValues: { reason: '' },
  });
  const current = () =>
    !controller.current?.signal.aborted && revision === useAuthStore.getState().revision;
  const reload = async () => {
    const result = await commercialApi.contracts(tenantId, controller.current?.signal);
    if (current()) setState(result);
  };
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    void (async () => {
      try {
        const contracts = await commercialApi.contracts(tenantId, abort.signal);
        const versions = await commercialApi.publishedTerms(abort.signal);
        const requests = await commercialApi.inquiries(tenantId, abort.signal);
        if (!abort.signal.aborted) {
          setState(contracts);
          setTerms(versions);
          setInquiries(requests);
        }
      } catch (failure) {
        if (!abort.signal.aborted) {
          setError(failure instanceof Error ? failure.message : t('loadError'));
        }
      }
    })();
    return () => {
      abort.abort();
    };
  }, [tenantId, revision, t]);
  const contract = state?.contracts.find((item) => item.id === state.currentContractId);
  const create = custom.handleSubmit(async (input) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await commercialApi.createCustom(tenantId, input, controller.current?.signal);
      if (current()) {
        setNotice(t('customCreated'));
        await reload();
      }
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : t('saveError'));
    } finally {
      if (current()) setBusy(false);
    }
  });
  const upload = evidence.handleSubmit(async (input) => {
    const file = input.file[0];
    if (!file || !contract) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await commercialApi.signedCustom(
        tenantId,
        contract.id,
        file,
        contract.version,
        controller.current?.signal,
      );
      if (current()) {
        setNotice(t('uploaded'));
        await reload();
      }
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : t('saveError'));
    } finally {
      if (current()) setBusy(false);
    }
  });
  const confirm = confirmation.handleSubmit(async (input) => {
    if (!contract) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await commercialApi.confirmCustom(
        tenantId,
        contract.id,
        contract.version,
        input.reason,
        controller.current?.signal,
      );
      if (current()) {
        setNotice(t('confirmed'));
        await reload();
      }
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : t('saveError'));
    } finally {
      if (current()) setBusy(false);
    }
  });
  const invalid = (field: keyof z.infer<typeof customSchema>) =>
    custom.formState.errors[field] ? t('invalid') : undefined;
  return (
    <section className="space-y-5">
      {error && (
        <Alert variant="error">
          {error}
          <Button
            variant="ghost"
            onClick={() => {
              void reload().catch((failure) =>
                setError(failure instanceof Error ? failure.message : t('loadError')),
              );
            }}
          >
            {t('retry')}
          </Button>
        </Alert>
      )}
      {notice && <Alert variant="success">{notice}</Alert>}
      {!state && !error && <p role="status">{t('loading')}</p>}
      {state && (
        <p>
          {owner('serviceStatus')}: <strong>{owner(`service.${state.serviceStatus}`)}</strong>
        </p>
      )}
      {inquiries.map((inquiry) => (
        <article
          key={inquiry.operationKey}
          className="rounded-lg border border-[var(--sc-border-default)] p-3"
        >
          <h3 className="text-base font-semibold">{owner('customInquiry')}</h3>
          <p className="whitespace-pre-wrap text-sm">{inquiry.message}</p>
          <time className="text-xs" dateTime={inquiry.submittedAt}>
            {inquiry.submittedAt}
          </time>
        </article>
      ))}
      {state && !contract && (
        <form className="space-y-4" onSubmit={create}>
          <h3 className="text-base font-semibold">{t('customDraft')}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label={t('planVersion')}
              placeholder={t('choose')}
              error={invalid('planVersionId')}
              options={
                terms?.plans.map((item) => ({
                  value: item.id,
                  label: `${item.name} · v${item.versionNo}`,
                })) ?? []
              }
              {...custom.register('planVersionId')}
            />
            <Input
              label={t('customVersion')}
              error={invalid('agreementVersionRef')}
              {...custom.register('agreementVersionRef')}
            />
            <Select
              label={t('serviceTariff')}
              placeholder={t('choose')}
              error={invalid('serviceTariffVersionId')}
              options={
                terms?.serviceTariffs.map((item) => ({
                  value: item.id,
                  label: `${item.code} · v${item.versionNo}`,
                })) ?? []
              }
              {...custom.register('serviceTariffVersionId')}
            />
            <Select
              label={t('freightTariff')}
              placeholder={t('choose')}
              error={invalid('freightTariffVersionId')}
              options={
                terms?.freightTariffs.map((item) => ({
                  value: item.id,
                  label: `${item.code} · v${item.versionNo}`,
                })) ?? []
              }
              {...custom.register('freightTariffVersionId')}
            />
            <Input
              label={t('effectiveFrom')}
              type="date"
              error={invalid('effectiveFrom')}
              {...custom.register('effectiveFrom')}
            />
            <Input
              label={t('deposit')}
              error={invalid('depositRequiredVnd')}
              inputMode="numeric"
              {...custom.register('depositRequiredVnd')}
            />
            <Input
              label={t('creditLimit')}
              error={invalid('creditLimitVnd')}
              inputMode="numeric"
              {...custom.register('creditLimitVnd')}
            />
            <Input
              label={t('claimCap')}
              error={invalid('claimCapVnd')}
              inputMode="numeric"
              {...custom.register('claimCapVnd')}
            />
          </div>
          <Button type="submit" isLoading={busy}>
            {t('createCustom')}
          </Button>
        </form>
      )}
      {contract && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold">
            {owner('contract')}: {contract.agreementVersionRef}
          </h3>
          <p>
            {contract.contractKind} · {contract.status}
          </p>
          <p>
            {owner('deposit')}: {contract.depositRequiredVnd} VND · {owner('creditLimit')}:{' '}
            {contract.creditLimitVnd} VND
          </p>
          {contract.contractKind === 'CUSTOM' && contract.status === 'DRAFT' && (
            <>
              <form onSubmit={upload} className="space-y-3">
                <Input
                  label={t('signedPdf')}
                  type="file"
                  accept="application/pdf"
                  error={evidence.formState.errors.file ? t('invalid') : undefined}
                  {...evidence.register('file')}
                />
                <Button variant="outline" type="submit" isLoading={busy}>
                  {t('uploadSigned')}
                </Button>
              </form>
              <form onSubmit={confirm} className="space-y-3">
                <Input
                  label={t('reason')}
                  error={confirmation.formState.errors.reason ? t('invalid') : undefined}
                  {...confirmation.register('reason')}
                />
                <Button type="submit" isLoading={busy}>
                  {t('confirmCustom')}
                </Button>
              </form>
            </>
          )}
        </div>
      )}
      {state && <CommercialAdminControls tenantId={tenantId} state={state} onChanged={reload} />}
      <CommercialQuotaPanel tenantId={tenantId} />
      <CommercialBilling tenantId={tenantId} />
    </section>
  );
}
