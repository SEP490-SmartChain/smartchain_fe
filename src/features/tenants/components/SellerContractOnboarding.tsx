import { useState } from 'react';

import { useNavigate } from 'react-router-dom';

import {
  ArrowRight,
  Boxes,
  ChevronDown,
  CircleCheck,
  ExternalLink,
  FileSignature,
  FileText,
  Package,
  ReceiptText,
  RefreshCw,
  Warehouse,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';
import Modal from '@/components/Common/Modal/Modal';
import { useAccess } from '@/hooks/useAccess';
import { useLocaleStore } from '@/stores/localeStore';

import { CommercialCustomInquiry } from './CommercialCustomInquiry';
import { CommercialPdfPreview } from './CommercialPdfPreview';
import { CommercialPreparationForm } from './CommercialPreparationForm';
import { CommercialQuotaPanel } from './CommercialQuotaPanel';
import { useSellerCommercial } from '../hooks/useSellerCommercial';
import { shouldUseSigningWindow } from '../lib/signingPresentation';

import type { CommercialPlan } from '../api/commercialApi';

export function SellerContractOnboarding() {
  const t = useTranslations('Commercial');
  const navigate = useNavigate();
  const locale = useLocaleStore((state) => state.locale);
  const flow = useSellerCommercial();
  const { can } = useAccess();
  const [selectedPlan, setSelectedPlan] = useState<CommercialPlan | null>(null);
  const signingInWindow = shouldUseSigningWindow(
    typeof window === 'undefined' ? '' : window.location.origin,
  );
  const money = (value: string) =>
    `${BigInt(value).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')} VND`;
  const currentContract = flow.state?.contracts.find(
    (item) => item.id === flow.state?.currentContractId,
  );
  const canRestartSigning = flow.state?.signingRequests.some(
    (item) => item.contractId === currentContract?.id && item.canRestartSigning,
  );
  const contract = canRestartSigning ? undefined : currentContract;
  const request = flow.state?.signingRequests.find((item) => item.contractId === contract?.id);
  const signingNotice =
    request?.status === 'IN_PROGRESS' && flow.signingNotice?.requestId === request.id
      ? flow.signingNotice
      : null;
  const isCustomDraft = contract?.contractKind === 'CUSTOM' && contract.status === 'DRAFT';
  const isCustomAwaitingPayment =
    contract?.contractKind === 'CUSTOM' &&
    contract.status === 'CONFIRMED' &&
    flow.state?.serviceStatus === 'PENDING_ACTIVATION';

  const contractStatusLabel = contract
    ? isCustomDraft
      ? t('customDraftStatus')
      : isCustomAwaitingPayment
        ? t('customPaymentStatus')
        : request
          ? t(`status.${request.status}`)
          : contract.status
    : '';

  const financialItems = contract
    ? [
        ...(contract.monthlyFeeVnd
          ? [{ label: t('monthlyFee'), amount: contract.monthlyFeeVnd, monthly: true }]
          : []),
        { label: t('deposit'), amount: contract.depositRequiredVnd, monthly: false },
        { label: t('creditLimit'), amount: contract.creditLimitVnd, monthly: false },
      ]
    : [];

  const onboardingInvoices = flow.invoices.filter(
    (invoice) => invoice.documentType === 'ONBOARDING',
  );

  return (
    <section className="space-y-3.5" aria-busy={flow.loading}>
      {flow.error && (
        <Alert variant="error" title={t('error')}>
          {flow.error.message}
        </Alert>
      )}
      {!flow.configured && !flow.loading && (
        <Alert variant="warning" title={t('notConfigured')}>
          {t('notConfiguredHelp')}
        </Alert>
      )}
      {flow.loading && (
        <p role="status" className="text-sm text-[var(--sc-text-secondary)]">
          {t('loading')}
        </p>
      )}
      {canRestartSigning && <Alert variant="warning">{t('restartSigningHelp')}</Alert>}

      {/* Initial Onboarding: Plan Selection (when no active/current contract) */}
      {!contract && (
        <Card
          padding="none"
          className="overflow-hidden border border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sc-border-default)] px-5 py-4 sm:px-6">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="m-0 text-base font-semibold text-[var(--sc-text-primary)]">
                  {t('title')}
                </h2>
                {flow.state && (
                  <Badge
                    status={flow.state.serviceStatus === 'ACTIVE' ? 'success' : 'default'}
                    label={`${t('serviceStatus')}: ${t(`service.${flow.state.serviceStatus}`)}`}
                  />
                )}
              </div>
              <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)] sm:text-sm">
                {t('planIntro')}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void flow.reload();
              }}
            >
              <RefreshCw size={14} />
              {t('refresh')}
            </Button>
          </div>

          {!flow.loading && flow.state && (
            <div className="p-5 sm:p-6">
              <div className="grid items-stretch gap-4 md:grid-cols-2">
                {flow.plans
                  .filter((plan) => plan.code !== 'ENTERPRISE')
                  .map((plan) => (
                    <div
                      key={plan.id}
                      className="flex min-w-0 flex-col justify-between rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-5 transition-colors hover:border-[var(--sc-border-strong)]"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary)]">
                              <Package size={18} aria-hidden="true" />
                            </span>
                            <div>
                              <h3 className="m-0 text-base font-semibold leading-5 text-[var(--sc-text-primary)]">
                                {plan.name}
                              </h3>
                              <span className="mt-0.5 block text-[11px] font-medium text-[var(--sc-text-tertiary)]">
                                {plan.code} · {t('version')}:{' '}
                                {plan.agreementVersionRef ?? t('unpublished')}
                              </span>
                            </div>
                          </div>
                        </div>

                        <p className="mb-0 mt-4 flex flex-wrap items-baseline gap-x-1.5">
                          <span className="text-2xl font-bold tabular-nums text-[var(--sc-text-primary)]">
                            {money(plan.monthlyFeeVnd)}
                          </span>
                          <span className="text-xs text-[var(--sc-text-secondary)]">
                            / {t('month')}
                          </span>
                        </p>

                        <dl className="my-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[var(--sc-border-default)] py-3.5 text-xs">
                          <div className="flex items-center gap-2">
                            <Warehouse
                              size={15}
                              aria-hidden="true"
                              className="shrink-0 text-[var(--sc-primary)]"
                            />
                            <div>
                              <dt className="text-[var(--sc-text-secondary)]">
                                {t('planWarehouses')}
                              </dt>
                              <dd className="mt-0.5 font-semibold tabular-nums text-[var(--sc-text-primary)]">
                                {plan.warehouseAllowance.toLocaleString(locale)}
                              </dd>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Boxes
                              size={15}
                              aria-hidden="true"
                              className="shrink-0 text-[var(--sc-primary)]"
                            />
                            <div>
                              <dt className="text-[var(--sc-text-secondary)]">{t('planOrders')}</dt>
                              <dd className="mt-0.5 font-semibold tabular-nums text-[var(--sc-text-primary)]">
                                {plan.salesOrderAllowance.toLocaleString(locale)}
                              </dd>
                            </div>
                          </div>
                          {plan.depositRequiredVnd && (
                            <div>
                              <dt className="text-[var(--sc-text-secondary)]">{t('deposit')}</dt>
                              <dd className="mt-0.5 font-semibold tabular-nums text-[var(--sc-text-primary)]">
                                {money(plan.depositRequiredVnd)}
                              </dd>
                            </div>
                          )}
                          {plan.creditLimitVnd && (
                            <div>
                              <dt className="text-[var(--sc-text-secondary)]">
                                {t('planDebtLimit')}
                              </dt>
                              <dd className="mt-0.5 font-semibold tabular-nums text-[var(--sc-text-primary)]">
                                {money(plan.creditLimitVnd)}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button
                          className="flex-1"
                          disabled={
                            flow.loading ||
                            !!contract ||
                            !flow.state ||
                            !flow.configured ||
                            !plan.agreementId
                          }
                          isLoading={flow.busy}
                          aria-label={t('chooseNamedPlan', { plan: plan.name })}
                          onClick={() => {
                            setSelectedPlan(plan);
                          }}
                        >
                          {t('choosePlan')}
                          <ArrowRight size={15} aria-hidden="true" />
                        </Button>
                        {plan.agreementId && (
                          <Button
                            variant="outline"
                            onClick={() => {
                              void flow.preview(plan.agreementId);
                            }}
                          >
                            <FileText size={15} aria-hidden="true" />
                            {t('planPreview')}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                {!flow.loading && flow.plans.length === 0 && (
                  <Alert variant="info" className="md:col-span-2">
                    {t('noPlans')}
                  </Alert>
                )}
              </div>
              <p className="mb-0 mt-4 text-xs text-[var(--sc-text-secondary)]">{t('creditHelp')}</p>
            </div>
          )}
        </Card>
      )}

      {selectedPlan && !contract && (
        <Modal
          isOpen
          onClose={() => {
            if (!flow.busy && !flow.pdfUrl) setSelectedPlan(null);
          }}
          title={t('prepareTitle', { plan: selectedPlan.name })}
          width="720px"
        >
          <CommercialPreparationForm
            key={selectedPlan.id}
            plan={selectedPlan}
            busy={flow.busy}
            onPreview={() => {
              void flow.preview(selectedPlan.agreementId);
            }}
            onSubmit={async (profile) => {
              if (await flow.start(selectedPlan, profile)) setSelectedPlan(null);
            }}
          />
          {flow.error && <Alert variant="error">{flow.error.message}</Alert>}
        </Modal>
      )}

      {flow.state?.serviceStatus === 'PENDING_ACTIVATION' &&
        !flow.state.currentContractId &&
        !flow.loading && <CommercialCustomInquiry />}

      {/* Unified Contract & Onboarding Invoice Card */}
      {contract && (
        <Card
          padding="none"
          className="overflow-hidden border border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)]"
        >
          {/* Card Header: Title, Version, Status Badges & Primary Actions */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--sc-border-default)] px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary)]">
                <FileSignature size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="m-0 text-base font-semibold text-[var(--sc-text-primary)]">
                    {contract.planName
                      ? t('contractTitle', { plan: contract.planName })
                      : t('contractTitleGeneric')}
                  </h2>
                  <span
                    role="status"
                    aria-label={t('signingStatus')}
                    className="inline-flex items-center"
                  >
                    <Badge
                      status={request?.status === 'COMPLETED' ? 'success' : 'warning'}
                      label={contractStatusLabel}
                    />
                  </span>
                  {flow.state && (
                    <Badge
                      status={flow.state.serviceStatus === 'ACTIVE' ? 'success' : 'default'}
                      label={`${t('serviceStatus')}: ${t(`service.${flow.state.serviceStatus}`)}`}
                    />
                  )}
                </div>
                <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">
                  {t('contractDescription')} · {t('version')}:{' '}
                  <span className="font-mono font-medium text-[var(--sc-text-primary)]">
                    {contract.agreementVersionRef}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {request?.status === 'IN_PROGRESS' && !signingNotice && (
                <Button
                  size="sm"
                  isLoading={flow.busy}
                  onClick={() => {
                    void flow.open(request.id);
                  }}
                >
                  <FileSignature size={15} />
                  {t('sign')}
                </Button>
              )}
              {request?.status === 'IN_PROGRESS' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void flow.original(request.id);
                  }}
                >
                  <FileText size={15} />
                  {t('preparedPdf')}
                </Button>
              )}
              {contract.contractKind === 'CUSTOM' && contract.status === 'CONFIRMED' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void flow.contractPdf(contract.tenantId, contract.id);
                  }}
                >
                  <FileText size={15} />
                  {t('download')}
                </Button>
              )}
              {request?.status === 'COMPLETED' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void flow.download(request.id);
                  }}
                >
                  <FileText size={15} />
                  {t('download')}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void flow.reload();
                }}
              >
                <RefreshCw size={14} />
                {t('refresh')}
              </Button>
            </div>
          </div>

          {/* Financial Metrics Strip (divided grid instead of nested boxes) */}
          <dl
            className={`grid divide-y border-b border-[var(--sc-border-default)] sm:divide-x sm:divide-y-0 ${
              financialItems.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
            }`}
          >
            {financialItems.map((item) => (
              <div key={item.label} className="px-5 py-3.5 sm:px-6">
                <dt className="text-xs text-[var(--sc-text-secondary)]">{item.label}</dt>
                <dd className="mt-1 flex items-baseline gap-1.5 text-base font-semibold tabular-nums text-[var(--sc-text-primary)]">
                  <span>{money(item.amount)}</span>
                  {item.monthly && (
                    <span className="text-xs font-normal text-[var(--sc-text-secondary)]">
                      / {t('month')}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>

          {/* Status Notices & Active SignNow Session */}
          {(request?.status === 'PREPARING' ||
            signingNotice ||
            isCustomDraft ||
            isCustomAwaitingPayment ||
            request?.status === 'UNKNOWN' ||
            request?.errorCode ||
            (request?.status === 'COMPLETED' &&
              !flow.invoices.some((invoice) => invoice.contractId === contract.id)) ||
            flow.signingUrl) && (
            <div className="space-y-3 border-b border-[var(--sc-border-default)] px-5 py-4 sm:px-6">
              {request?.status === 'PREPARING' && (
                <p className="m-0 text-sm text-[var(--sc-text-secondary)]">{t('preparingHelp')}</p>
              )}
              {signingNotice && <Alert variant="info">{signingNotice.message}</Alert>}
              {isCustomDraft && <Alert variant="info">{t('customDraftHelp')}</Alert>}
              {isCustomAwaitingPayment && (
                <Alert variant="info">
                  {t(
                    flow.invoices.some((invoice) => invoice.contractId === contract.id)
                      ? 'customPaymentHelp'
                      : 'customInvoiceHelp',
                  )}
                </Alert>
              )}
              {request?.status === 'UNKNOWN' && <Alert variant="warning">{t('unknownHelp')}</Alert>}
              {request?.errorCode && (
                <p className="m-0 font-mono text-xs text-[var(--sc-text-secondary)]">
                  {request.errorCode}
                </p>
              )}
              {request?.status === 'COMPLETED' &&
                !flow.invoices.some((invoice) => invoice.contractId === contract.id) && (
                  <Alert variant="info">{t('invoicePendingAfterSigning')}</Alert>
                )}

              {flow.signingUrl && (
                <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-bg-surface)] text-[var(--sc-primary)] shadow-xs">
                        <FileSignature size={18} />
                      </span>
                      <div>
                        <h3 className="m-0 text-sm font-semibold">
                          {t(
                            signingInWindow
                              ? flow.popupBlocked
                                ? 'popupBlocked'
                                : 'windowOpened'
                              : 'signWithSignNow',
                          )}
                        </h3>
                        <p className="mb-0 mt-1 max-w-xl text-xs leading-5 text-[var(--sc-text-secondary)]">
                          {t(
                            signingInWindow
                              ? flow.popupBlocked
                                ? 'popupBlockedHint'
                                : 'signingWindowHint'
                              : 'signingHint',
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        isLoading={flow.busy}
                        onClick={() => {
                          if (request) void flow.open(request.id, true);
                        }}
                      >
                        <ExternalLink size={14} />
                        {t(flow.popupBlocked ? 'newTab' : 'openAgain')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={flow.close}>
                        {t('close')}
                      </Button>
                    </div>
                  </div>
                  {!signingInWindow && (
                    <iframe
                      src={flow.signingUrl}
                      title={t('signWithSignNow')}
                      className="mt-3 h-[68vh] w-full rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)]"
                      referrerPolicy="no-referrer"
                      allow="fullscreen"
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Integrated Onboarding Invoices (inside the same card) */}
          {onboardingInvoices.length > 0 && (
            <div className="divide-y divide-[var(--sc-border-default)] border-b border-[var(--sc-border-default)]">
              {onboardingInvoices.map((invoice) => (
                <div key={invoice.id} className="px-5 py-3.5 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary)]">
                        {invoice.paymentStatus === 'PAID' ? (
                          <CircleCheck size={17} aria-hidden />
                        ) : (
                          <ReceiptText size={17} aria-hidden />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[var(--sc-text-primary)]">
                            {t('invoice')}
                          </span>
                          <code className="rounded bg-[var(--sc-bg-secondary)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--sc-text-secondary)]">
                            {invoice.invoiceNo}
                          </code>
                          <Badge
                            status={
                              invoice.paymentStatus === 'PAID'
                                ? 'success'
                                : invoice.paymentStatus === 'EXPIRED'
                                  ? 'error'
                                  : 'warning'
                            }
                            label={t(`payment.${invoice.paymentStatus}`)}
                          />
                        </div>
                        <p className="mb-0 mt-0.5 text-xs text-[var(--sc-text-secondary)]">
                          <span className="font-semibold tabular-nums text-[var(--sc-text-primary)]">
                            {money(invoice.totalVnd)}
                          </span>{' '}
                          · {t('paid')}: {money(invoice.paidVnd)} · {t('due')}:{' '}
                          {new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB').format(
                            new Date(`${invoice.dueOn}T12:00:00Z`),
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void navigate(`/billing?invoiceId=${encodeURIComponent(invoice.id)}`);
                        }}
                      >
                        {t(invoice.paymentStatus === 'PAID' ? 'viewInvoice' : 'payInvoice')}
                        <ArrowRight size={14} aria-hidden />
                      </Button>
                    </div>
                  </div>

                  {invoice.obligations.length > 0 && (
                    <details className="group mt-2 text-xs text-[var(--sc-text-secondary)]">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-[var(--sc-primary)] outline-none hover:underline [&::-webkit-details-marker]:hidden">
                        {t('invoiceBreakdown')}
                        <ChevronDown
                          size={13}
                          aria-hidden
                          className="transition-transform group-open:rotate-180 motion-reduce:transition-none"
                        />
                      </summary>
                      <dl className="mt-2 grid gap-2 rounded-lg bg-[var(--sc-bg-secondary)]/60 p-3 sm:grid-cols-2">
                        {invoice.obligations.map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-2">
                            <dt>{t(`purpose.${item.purpose}`)}</dt>
                            <dd className="font-medium tabular-nums text-[var(--sc-text-primary)]">
                              {money(item.paidVnd)} / {money(item.amountDueVnd)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Compact Footer Caption */}
          <div className="bg-[var(--sc-bg-secondary)]/40 px-5 py-2.5 text-xs text-[var(--sc-text-secondary)] sm:px-6">
            {t('creditHelp')}
          </div>
        </Card>
      )}

      {can('contract.sign') &&
        contract &&
        ['ACCEPTED', 'CONFIRMED', 'TERMINATING'].includes(contract.status) && (
          <CommercialQuotaPanel key={contract.id} />
        )}

      {flow.pdfUrl && (
        <CommercialPdfPreview
          key={flow.pdfUrl}
          url={flow.pdfUrl}
          onClose={flow.closePdf}
          title={t(flow.pdfKind === 'sample' ? 'samplePdfTitle' : 'preparedPdfTitle')}
          hint={t(flow.pdfKind === 'sample' ? 'samplePdfHelp' : 'preparedPdfHelp')}
        />
      )}
    </section>
  );
}
