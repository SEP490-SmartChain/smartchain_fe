import { useState } from 'react';

import {
  ArrowRight,
  CircleCheck,
  ReceiptText,
  Boxes,
  ChevronDown,
  ExternalLink,
  FileSignature,
  FileText,
  Package,
  RefreshCw,
  Warehouse,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useNavigate } from 'react-router-dom';

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
  const contract = flow.state?.contracts.find((item) => item.id === flow.state?.currentContractId);
  const request = flow.state?.signingRequests.find((item) => item.contractId === contract?.id);
  const style = 'rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-5';

  return (
    <section className="space-y-4" aria-busy={flow.loading}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--sc-text-secondary)]">
            {t(contract ? 'contractDescription' : 'planIntro')}
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
      {flow.loading && <p role="status">{t('loading')}</p>}
      {flow.state && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--sc-text-secondary)]">
          <span>{t('serviceStatus')}</span>
          <Badge
            status={flow.state.serviceStatus === 'ACTIVE' ? 'success' : 'default'}
            label={t(`service.${flow.state.serviceStatus}`)}
          />
        </div>
      )}
      {!contract && !flow.loading && flow.state && (
        <div className="grid items-stretch gap-5 md:grid-cols-2">
          {flow.plans
            .filter((plan) => plan.code !== 'ENTERPRISE')
            .map((plan) => (
              <Card key={plan.id} padding="none" className="flex min-w-0 flex-col overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary)]">
                      <Package size={20} aria-hidden="true" />
                    </span>
                    <h3 className="min-w-0 text-lg font-semibold leading-6 [overflow-wrap:anywhere]">
                      {plan.name}
                    </h3>
                  </div>
                  <span className="shrink-0 rounded-md bg-[var(--sc-bg-secondary)] px-2 py-1 text-[11px] font-medium text-[var(--sc-text-secondary)]">
                    {plan.code}
                  </span>
                </div>
                <div className="flex flex-1 flex-col px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
                  <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-3xl font-semibold leading-tight tabular-nums">
                      {money(plan.monthlyFeeVnd)}
                    </span>
                    <span className="text-sm text-[var(--sc-text-secondary)]">/ {t('month')}</span>
                  </p>
                  <dl className="my-5 grid grid-cols-2 gap-3 rounded-xl bg-[var(--sc-bg-secondary)] p-3.5">
                    <div className="flex items-center gap-2.5">
                      <Warehouse
                        size={18}
                        aria-hidden="true"
                        className="shrink-0 text-[var(--sc-primary)]"
                      />
                      <div>
                        <dt className="text-xs text-[var(--sc-text-secondary)]">
                          {t('planWarehouses')}
                        </dt>
                        <dd className="mt-0.5 font-semibold tabular-nums">
                          {plan.warehouseAllowance.toLocaleString(locale)}
                        </dd>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 border-l border-[var(--sc-border-default)] pl-3">
                      <Boxes
                        size={18}
                        aria-hidden="true"
                        className="shrink-0 text-[var(--sc-primary)]"
                      />
                      <div>
                        <dt className="text-xs text-[var(--sc-text-secondary)]">
                          {t('planOrders')}
                        </dt>
                        <dd className="mt-0.5 font-semibold tabular-nums">
                          {plan.salesOrderAllowance.toLocaleString(locale)}
                        </dd>
                      </div>
                    </div>
                  </dl>
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    {plan.depositRequiredVnd && (
                      <div>
                        <dt className="text-xs text-[var(--sc-text-secondary)]">{t('deposit')}</dt>
                        <dd className="mt-1 font-medium tabular-nums">
                          {money(plan.depositRequiredVnd)}
                        </dd>
                      </div>
                    )}
                    {plan.creditLimitVnd && (
                      <div>
                        <dt className="text-xs text-[var(--sc-text-secondary)]">
                          {t('planDebtLimit')}
                        </dt>
                        <dd className="mt-1 font-medium tabular-nums">
                          {money(plan.creditLimitVnd)}
                        </dd>
                      </div>
                    )}
                  </dl>
                  <details className="group mt-4 border-t border-[var(--sc-border-light)] pt-3 text-xs text-[var(--sc-text-secondary)]">
                    <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-primary)] [&::-webkit-details-marker]:hidden">
                      {t('planDetails')}
                      <ChevronDown
                        size={14}
                        aria-hidden="true"
                        className="transition-transform group-open:rotate-180 motion-reduce:transition-none"
                      />
                    </summary>
                    <p className="mt-2 leading-5">{t('creditHelp')}</p>
                    <p className="mt-2 break-words leading-5 [overflow-wrap:anywhere]">
                      {t('version')}: {plan.agreementVersionRef ?? t('unpublished')}
                    </p>
                  </details>
                  <div className="mt-auto grid gap-2 pt-4 sm:grid-cols-[1fr_auto]">
                    <Button
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
                      <ArrowRight size={16} aria-hidden="true" />
                    </Button>
                    {plan.agreementId && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          void flow.preview(plan.agreementId);
                        }}
                      >
                        <FileText size={16} aria-hidden="true" />
                        {t('planPreview')}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          {!flow.loading && flow.plans.length === 0 && <Alert variant="info">{t('noPlans')}</Alert>}
        </div>
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
      {flow.state && !flow.loading && (
        <CommercialCustomInquiry
          allowSubmit={!contract && flow.state.serviceStatus === 'PENDING_ACTIVATION'}
        />
      )}
      {contract && (
        <article className={style}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">
                {contract.planName
                  ? t('contractTitle', { plan: contract.planName })
                  : t('contractTitleGeneric')}
              </h3>
            </div>
            <div role="status" aria-label={t('signingStatus')}>
              <Badge
                status={request?.status === 'COMPLETED' ? 'success' : 'warning'}
                label={request ? t(`status.${request.status}`) : contract.status}
              />
            </div>
          </div>
          <dl className="my-5 grid gap-3 sm:grid-cols-3">
            {[
              ...(contract.monthlyFeeVnd
                ? [{ label: t('monthlyFee'), amount: contract.monthlyFeeVnd, monthly: true }]
                : []),
              { label: t('deposit'), amount: contract.depositRequiredVnd, monthly: false },
              { label: t('creditLimit'), amount: contract.creditLimitVnd, monthly: false },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-[var(--sc-bg-secondary)] p-4">
                <dt className="text-xs text-[var(--sc-text-secondary)]">{item.label}</dt>
                <dd className="mt-2 text-lg font-semibold tabular-nums">
                  {money(item.amount)}
                  {item.monthly && (
                    <span className="mt-1 block text-xs font-normal text-[var(--sc-text-secondary)]">
                      / {t('month')}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {request?.status === 'PREPARING' && <p className="text-sm">{t('preparingHelp')}</p>}
          {request?.status === 'IN_PROGRESS' && (
            <div className="flex flex-wrap gap-3 border-t border-[var(--sc-border-default)] pt-4">
              <Button
                isLoading={flow.busy}
                onClick={() => {
                  void flow.open(request.id);
                }}
              >
                <FileSignature size={16} />
                {t('sign')}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void flow.original(request.id);
                }}
              >
                <FileText size={16} />
                {t('preparedPdf')}
              </Button>
            </div>
          )}
          {contract.contractKind === 'CUSTOM' && contract.status === 'CONFIRMED' && (
            <Button
              variant="outline"
              onClick={() => {
                void flow.contractPdf(contract.tenantId, contract.id);
              }}
            >
              {t('download')}
            </Button>
          )}
          {request?.status === 'UNKNOWN' && <Alert variant="warning">{t('unknownHelp')}</Alert>}
          {request?.errorCode && <p className="mt-2 text-xs">{request.errorCode}</p>}
          {request?.status === 'COMPLETED' && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  void flow.download(request.id);
                }}
              >
                {t('download')}
              </Button>
            </>
          )}
          <details className="group mt-4 border-t border-[var(--sc-border-light)] pt-3 text-xs text-[var(--sc-text-secondary)]">
            <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 rounded font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)] [&::-webkit-details-marker]:hidden">
              {t('planDetails')}
              <ChevronDown
                size={14}
                aria-hidden
                className="transition-transform group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <p className="mt-2 max-w-3xl leading-5">{t('creditHelp')}</p>
            <p className="mt-2 break-all">
              {t('version')}: {contract.agreementVersionRef}
            </p>
          </details>
        </article>
      )}
      {flow.signingUrl && (
        <div className={style}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-[var(--sc-bg-secondary)] p-3 text-[var(--sc-primary)]">
                <FileSignature size={20} />
              </div>
              <div>
                <h3 className="text-base font-semibold">
                  {t(
                    signingInWindow
                      ? flow.popupBlocked
                        ? 'popupBlocked'
                        : 'windowOpened'
                      : 'signWithSignNow',
                  )}
                </h3>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--sc-text-secondary)]">
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
              className="mt-4 h-[70vh] w-full rounded-lg border border-[var(--sc-border-default)]"
              referrerPolicy="no-referrer"
              allow="fullscreen"
            />
          )}
        </div>
      )}
      {flow.invoices.map((invoice) => (
        <article
          key={invoice.id}
          className="overflow-hidden rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary)]">
                {invoice.paymentStatus === 'PAID' ? (
                  <CircleCheck size={21} aria-hidden />
                ) : (
                  <ReceiptText size={21} aria-hidden />
                )}
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{t('invoice')}</h3>
                <p className="mt-1 text-xl font-semibold tabular-nums">{money(invoice.totalVnd)}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
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
          <details className="group border-t border-[var(--sc-border-light)] px-5 py-3 text-xs text-[var(--sc-text-secondary)]">
            <summary className="flex min-h-7 cursor-pointer list-none items-center justify-between gap-3 rounded font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)] [&::-webkit-details-marker]:hidden">
              {t('invoiceBreakdown')}
              <ChevronDown
                size={14}
                aria-hidden
                className="transition-transform group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <dl className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <dt>{t('paid')}</dt>
                <dd className="mt-1 font-medium text-[var(--sc-text-primary)]">
                  {money(invoice.paidVnd)}
                </dd>
              </div>
              <div>
                <dt>{t('due')}</dt>
                <dd className="mt-1 font-medium text-[var(--sc-text-primary)]">
                  {new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB').format(
                    new Date(`${invoice.dueOn}T12:00:00Z`),
                  )}
                </dd>
              </div>
              {invoice.obligations.map((item) => (
                <div key={item.id}>
                  <dt>{t(`purpose.${item.purpose}`)}</dt>
                  <dd className="mt-1 font-medium text-[var(--sc-text-primary)]">
                    {money(item.paidVnd)} / {money(item.amountDueVnd)}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mb-1 mt-4 break-all font-mono">{invoice.invoiceNo}</p>
          </details>
        </article>
      ))}
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
