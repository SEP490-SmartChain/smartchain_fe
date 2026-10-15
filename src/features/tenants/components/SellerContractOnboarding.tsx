import { useState } from 'react';

import { ExternalLink, FileSignature, FileText, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import Modal from '@/components/Common/Modal/Modal';
import { useLocaleStore } from '@/stores/localeStore';

import { CommercialCustomInquiry } from './CommercialCustomInquiry';
import { CommercialPdfPreview } from './CommercialPdfPreview';
import { CommercialPreparationForm } from './CommercialPreparationForm';
import { useSellerCommercial } from '../hooks/useSellerCommercial';
import { shouldUseSigningWindow } from '../lib/signingPresentation';

import type { CommercialPlan } from '../api/commercialApi';

export function SellerContractOnboarding() {
  const t = useTranslations('Commercial');
  const locale = useLocaleStore((state) => state.locale);
  const flow = useSellerCommercial();
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
            {t(contract ? 'contractDescription' : 'description')}
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
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[var(--sc-text-secondary)]">{t('serviceStatus')}</span>
          <Badge
            status={flow.state.serviceStatus === 'ACTIVE' ? 'success' : 'default'}
            label={t(`service.${flow.state.serviceStatus}`)}
          />
        </div>
      )}
      {!contract && !flow.loading && flow.state && (
        <div className="grid gap-4 md:grid-cols-2">
          {flow.plans
            .filter((plan) => plan.code !== 'ENTERPRISE')
            .map((plan) => (
              <article key={plan.id} className={style}>
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-2 text-2xl font-semibold">
                  {money(plan.monthlyFeeVnd)}
                  <span className="ml-1 text-sm font-normal">/ {t('month')}</span>
                </p>
                {plan.depositRequiredVnd && (
                  <p className="mt-2 text-sm">
                    {t('deposit')}: {money(plan.depositRequiredVnd)}
                  </p>
                )}
                {plan.creditLimitVnd && (
                  <p className="mt-1 text-sm">
                    {t('creditLimit')}: {money(plan.creditLimitVnd)}
                  </p>
                )}
                <p className="my-3 text-sm">
                  {t('allowances', {
                    warehouses: plan.warehouseAllowance,
                    orders: plan.salesOrderAllowance,
                  })}
                </p>
                <p className="mb-4 text-xs text-[var(--sc-text-secondary)]">
                  {t('version')}: {plan.agreementVersionRef ?? t('unpublished')}
                </p>
                <Button
                  disabled={
                    flow.loading ||
                    !!contract ||
                    !flow.state ||
                    !flow.configured ||
                    !plan.agreementId
                  }
                  isLoading={flow.busy}
                  onClick={() => {
                    setSelectedPlan(plan);
                  }}
                >
                  <FileSignature size={16} />
                  {t('prepare')}
                </Button>
                {plan.agreementId && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      void flow.preview(plan.agreementId);
                    }}
                  >
                    {t('preview')}
                  </Button>
                )}
              </article>
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
              <p className="mt-1 break-all text-xs text-[var(--sc-text-secondary)]">
                {t('version')}: {contract.agreementVersionRef}
              </p>
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
          <p className="mb-5 max-w-3xl text-xs leading-relaxed text-[var(--sc-text-secondary)]">
            {t('creditHelp')}
          </p>
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
              <p className="mb-3 text-sm">{t('completedHelp')}</p>
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
        <article key={invoice.id} className={style}>
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
        </article>
      ))}
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
