import { useEffect, useRef, useState } from 'react';

import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { zodResolver } from '@hookform/resolvers/zod';
import { FileText, ReceiptText, Upload, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { Select } from '@/components/Common/Select/Select';
import { useIsRealtimeConnected, useRealtimeSync } from '@/features/realtime-notifications';
import { notifyInvalidForm } from '@/lib/errorNotifications';
import { useAuthStore } from '@/stores/authStore';

import { CommercialAdminControls } from './CommercialAdminControls';
import { CommercialBilling } from './CommercialBilling';
import { CommercialDisclosure } from './CommercialDisclosure';
import {
  commercialApi,
  type OnboardingInvoice,
  type PublishedCommercialTerms,
  type SellerCommercialState,
} from '../api/commercialApi';
import { freightTariffLabel } from '../lib/freightTariffLabel';

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
  const [payment, setPayment] = useState<{
    contractId: string;
    invoice?: OnboardingInvoice;
    failed?: boolean;
  }>();
  const locale = useLocale();
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
  const isRealtimeConnected = useIsRealtimeConnected();
  const custom = useForm<z.infer<typeof customSchema>>({
    resolver: zodResolver(customSchema),
    defaultValues: {
      planVersionId: '',
      serviceTariffVersionId: '',
      freightTariffVersionId: '',
      agreementVersionRef: '',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      depositRequiredVnd: '',
      creditLimitVnd: '',
      claimCapVnd: '',
    },
  });
  const evidence = useForm<z.infer<typeof evidenceSchema>>({
    resolver: zodResolver(evidenceSchema),
    shouldFocusError: false,
  });
  const selectedFiles = useWatch({ control: evidence.control, name: 'file' });
  const fileInput = useRef<HTMLInputElement>(null);
  const fileField = evidence.register('file');
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
  useRealtimeSync(['commercial.onboarding', 'commercial.billing'], () => {
    void reload();
  });
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pollContracts = async () => {
      try {
        const contracts = await commercialApi.contracts(tenantId, abort.signal);
        if (!abort.signal.aborted) setState(contracts);
      } catch {
        // Keep the last visible contract and the explicit refresh action available.
      } finally {
        if (!abort.signal.aborted && !isRealtimeConnected) {
          timer = setTimeout(() => void pollContracts(), 10000);
        }
      }
    };
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
      } finally {
        if (!abort.signal.aborted && !isRealtimeConnected) {
          timer = setTimeout(() => void pollContracts(), 10000);
        }
      }
    })();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [tenantId, revision, isRealtimeConnected, t]);
  const contract = state?.contracts.find((item) => item.id === state.currentContractId);
  const isCustomDraft = contract?.contractKind === 'CUSTOM' && contract.status === 'DRAFT';
  const payableContractId =
    contract && ['ACCEPTED', 'CONFIRMED'].includes(contract.status) ? contract.id : undefined;
  const currentPayment = payment?.contractId === payableContractId ? payment : undefined;
  useEffect(() => {
    if (!payableContractId) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const rows = await commercialApi.invoices(abort.signal, tenantId);
        if (abort.signal.aborted) return;
        const invoice = rows.find(
          (row) => row.contractId === payableContractId && row.documentType === 'ONBOARDING',
        );
        setPayment({ contractId: payableContractId, invoice });
        if (invoice?.paymentStatus !== 'PAID' && !isRealtimeConnected) {
          timer = setTimeout(() => void check(), 10000);
        }
      } catch {
        if (!abort.signal.aborted) setPayment({ contractId: payableContractId, failed: true });
      }
    };
    void check();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [payableContractId, tenantId, revision, isRealtimeConnected]);
  const selectedFile = isCustomDraft ? selectedFiles?.[0] : undefined;
  const enterprisePlans = terms?.plans.filter((item) => item.code === 'ENTERPRISE') ?? [];
  const selectedPlanId = useWatch({ control: custom.control, name: 'planVersionId' });
  const deposit = useWatch({ control: custom.control, name: 'depositRequiredVnd' });
  const selectedPlan = enterprisePlans.find((plan) => plan.id === selectedPlanId);
  const formatVnd = (value: bigint) => `${value.toLocaleString(locale)} VND`;
  const create = custom.handleSubmit(
    async (input) => {
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
    },
    () => notifyInvalidForm(),
  );
  const upload = evidence.handleSubmit(
    async (input) => {
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
          evidence.reset();
        }
      } catch (failure) {
        if (current()) setError(failure instanceof Error ? failure.message : t('saveError'));
      } finally {
        if (current()) setBusy(false);
      }
    },
    () => notifyInvalidForm(),
  );
  const viewSavedPdf = async () => {
    if (!contract?.hasSignedEvidence) return;
    setBusy(true);
    setError(null);
    try {
      const { downloadUrl } = await commercialApi.contractPdf(
        tenantId,
        contract.id,
        controller.current?.signal,
      );
      if (current()) {
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = 'hop-dong-da-ky.pdf';
        document.body.append(link);
        link.click();
        link.remove();
      }
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : t('downloadPdfError'));
    } finally {
      if (current()) setBusy(false);
    }
  };
  const confirm = confirmation.handleSubmit(
    async (input) => {
      if (!contract?.hasSignedEvidence || selectedFiles?.length) return;
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
    },
    () => notifyInvalidForm(),
  );
  const invalid = (field: keyof z.infer<typeof customSchema>) =>
    custom.formState.errors[field] ? t('invalid') : undefined;
  const inquiryHistory = inquiries.map((inquiry) => (
    <article
      key={inquiry.operationKey}
      className="space-y-1 rounded-lg bg-[var(--sc-bg-secondary)] p-3"
    >
      <p className="whitespace-pre-wrap break-words text-sm">{inquiry.message}</p>
      <time
        className="block text-xs text-[var(--sc-text-secondary)]"
        dateTime={inquiry.submittedAt}
      >
        {new Date(inquiry.submittedAt).toLocaleString(locale)}
      </time>
    </article>
  ));
  return (
    <section className="space-y-4">
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
      <div className="space-y-4">
        {state && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--sc-border-default)] px-4 py-2.5">
            <span className="text-sm font-medium">{owner('serviceStatus')}</span>
            <Badge
              status={
                state.serviceStatus === 'ACTIVE'
                  ? 'success'
                  : state.serviceStatus === 'PENDING_ACTIVATION'
                    ? 'warning'
                    : 'default'
              }
              label={owner(`service.${state.serviceStatus}`)}
            />
          </div>
        )}
        {!contract && inquiryHistory.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">{owner('customInquiry')}</h3>
            {inquiryHistory}
          </section>
        )}
        {state && !contract && inquiries.length === 0 && (
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('noContract')}</p>
        )}
        {state?.serviceStatus === 'PENDING_ACTIVATION' && !contract && inquiries.length > 0 && (
          <form
            className="space-y-4 rounded-xl border border-[var(--sc-border-default)] p-4 sm:p-5"
            onSubmit={create}
          >
            <div className="space-y-1">
              <h3 className="text-base font-semibold">{t('customDraft')}</h3>
              <p className="text-sm text-[var(--sc-text-secondary)]">{t('enterpriseTermsHelp')}</p>
              <Link
                to="/admin/plans"
                className="inline-block text-sm font-medium text-[var(--sc-primary)] underline underline-offset-2"
              >
                {t('manageEnterprisePlans')}
              </Link>
            </div>
            {terms && enterprisePlans.length === 0 && (
              <Alert variant="warning">{t('enterprisePlanMissing')}</Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label={t('enterprisePlanVersion')}
                isRequired
                placeholder={t('choose')}
                error={invalid('planVersionId')}
                options={enterprisePlans.map((item) => ({
                  value: item.id,
                  label: `${item.name} · v${item.versionNo} · ${formatVnd(BigInt(item.monthlyFeeVnd))}`,
                }))}
                {...custom.register('planVersionId')}
              />
              <Input
                label={t('customVersion')}
                isRequired
                error={invalid('agreementVersionRef')}
                {...custom.register('agreementVersionRef')}
              />
              <Select
                label={t('serviceTariff')}
                isRequired
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
                isRequired
                placeholder={t('choose')}
                error={invalid('freightTariffVersionId')}
                options={
                  terms?.freightTariffs.map((item) => ({
                    value: item.id,
                    label: freightTariffLabel(item, t('freightCarrierApi')),
                  })) ?? []
                }
                {...custom.register('freightTariffVersionId')}
              />
              <Input
                label={t('effectiveFrom')}
                isRequired
                type="date"
                error={invalid('effectiveFrom')}
                {...custom.register('effectiveFrom')}
              />
              <Input
                label={t('deposit')}
                isRequired
                error={invalid('depositRequiredVnd')}
                inputMode="numeric"
                {...custom.register('depositRequiredVnd')}
              />
              <Input
                label={t('creditLimit')}
                isRequired
                error={invalid('creditLimitVnd')}
                inputMode="numeric"
                {...custom.register('creditLimitVnd')}
              />
              <Input
                label={t('claimCap')}
                isRequired
                error={invalid('claimCapVnd')}
                inputMode="numeric"
                {...custom.register('claimCapVnd')}
              />
            </div>
            {selectedPlan && money.safeParse(deposit).success && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--sc-bg-secondary)] px-4 py-3 text-sm">
                <span>{t('initialInvoicePreview')}</span>
                <strong>{formatVnd(BigInt(selectedPlan.monthlyFeeVnd) + BigInt(deposit))}</strong>
              </div>
            )}
            <Button type="submit" isLoading={busy} disabled={!enterprisePlans.length}>
              {t('createCustom')}
            </Button>
          </form>
        )}
        {contract && (
          <section className="space-y-4 rounded-xl border border-[var(--sc-border-default)] p-4 sm:p-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold">{owner('contract')}</h3>
                <p className="break-all text-sm text-[var(--sc-text-secondary)]">
                  {contract.agreementVersionRef}
                </p>
              </div>
              <span className="rounded-full bg-[var(--sc-bg-secondary)] px-2.5 py-1 text-xs font-medium">
                {contract.status === 'DRAFT'
                  ? t('draftStatus')
                  : contract.status === 'CONFIRMED'
                    ? t('contractConfirmed')
                    : contract.status}
              </span>
            </header>
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-[var(--sc-bg-secondary)] px-3 py-2.5 text-sm">
              <div>
                <dt className="text-[var(--sc-text-secondary)]">{owner('deposit')}</dt>
                <dd className="font-semibold">{formatVnd(BigInt(contract.depositRequiredVnd))}</dd>
              </div>
              <div>
                <dt className="text-[var(--sc-text-secondary)]">{owner('creditLimit')}</dt>
                <dd className="font-semibold">{formatVnd(BigInt(contract.creditLimitVnd))}</dd>
              </div>
            </dl>
            {(isCustomDraft || contract.hasSignedEvidence) && (
              <form
                onSubmit={upload}
                className="space-y-2 rounded-lg border border-[var(--sc-border-default)] p-3"
              >
                {isCustomDraft && (
                  <input
                    type="file"
                    hidden
                    accept="application/pdf,.pdf"
                    {...fileField}
                    ref={(element) => {
                      fileField.ref(element);
                      fileInput.current = element;
                    }}
                    onChange={(event) => {
                      evidence.clearErrors('file');
                      void fileField.onChange(event);
                    }}
                  />
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-bg-secondary)] text-[var(--sc-primary)]">
                    <FileText size={19} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1 basis-36">
                    <p className="truncate text-sm font-semibold" title={selectedFile?.name}>
                      {selectedFile?.name ?? t('signedPdf')}
                    </p>
                    <p className="text-xs text-[var(--sc-text-secondary)]">
                      {t(
                        selectedFile
                          ? 'pdfPendingSave'
                          : contract.hasSignedEvidence
                            ? 'pdfSaved'
                            : 'pdfRequirements',
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedFile ? (
                      <>
                        <Button size="sm" type="submit" isLoading={busy}>
                          {t('uploadSigned')}
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          variant="ghost"
                          disabled={busy}
                          aria-label={t('clearSelectedPdf')}
                          title={t('clearSelectedPdf')}
                          onClick={() => evidence.reset()}
                        >
                          <X size={16} aria-hidden="true" />
                        </Button>
                      </>
                    ) : (
                      <>
                        {contract.hasSignedEvidence && (
                          <Button
                            size="sm"
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void viewSavedPdf()}
                          >
                            {t('previewSavedPdf')}
                          </Button>
                        )}
                        {isCustomDraft && (
                          <Button
                            size="sm"
                            type="button"
                            variant={contract.hasSignedEvidence ? 'ghost' : 'outline'}
                            disabled={busy}
                            onClick={() => fileInput.current?.click()}
                          >
                            <Upload size={15} aria-hidden="true" />
                            {t(contract.hasSignedEvidence ? 'replacePdf' : 'choosePdf')}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {evidence.formState.errors.file && (
                  <Alert variant="error" compact>
                    {t('invalidPdf')}
                  </Alert>
                )}
              </form>
            )}
            {isCustomDraft && contract.hasSignedEvidence && (
              <form
                onSubmit={confirm}
                className="space-y-3 border-t border-[var(--sc-border-default)] pt-4"
              >
                <Input
                  label={t('confirmationReason')}
                  isRequired
                  error={
                    confirmation.formState.errors.reason ? t('confirmationReasonLength') : undefined
                  }
                  {...confirmation.register('reason')}
                />
                <Button type="submit" disabled={Boolean(selectedFiles?.length)} isLoading={busy}>
                  {t('confirmCustom')}
                </Button>
              </form>
            )}
          </section>
        )}
        {payableContractId && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--sc-border-default)] px-4 py-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--sc-bg-secondary)] text-[var(--sc-primary)]">
              <ReceiptText size={18} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">{t('initialInvoiceTitle')}</h3>
              <p className="text-xs text-[var(--sc-text-secondary)]">
                {currentPayment?.invoice
                  ? formatVnd(BigInt(currentPayment.invoice.totalVnd))
                  : t(
                      currentPayment?.failed
                        ? 'initialInvoiceUnavailable'
                        : currentPayment
                          ? 'initialInvoicePending'
                          : 'loading',
                    )}
              </p>
            </div>
            {currentPayment?.invoice && (
              <Badge
                status={currentPayment.invoice.paymentStatus === 'PAID' ? 'success' : 'warning'}
                label={owner(`payment.${currentPayment.invoice.paymentStatus}`)}
              />
            )}
          </div>
        )}
        {state && <CommercialAdminControls tenantId={tenantId} state={state} onChanged={reload} />}
      </div>
      <CommercialDisclosure title={t('billingTab')}>
        <CommercialBilling tenantId={tenantId} />
      </CommercialDisclosure>
      {contract && inquiryHistory.length > 0 && (
        <CommercialDisclosure title={t('inquiryTab')}>
          <div className="space-y-2">{inquiryHistory}</div>
        </CommercialDisclosure>
      )}
    </section>
  );
}
