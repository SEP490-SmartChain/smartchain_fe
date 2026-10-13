import { useState } from 'react';

import { FileSignature, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <p className="mt-1 text-sm text-[var(--sc-text-secondary)]">{t('description')}</p>
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
        <p className="text-sm">
          {t('serviceStatus')}: <strong>{t(`service.${flow.state.serviceStatus}`)}</strong>
        </p>
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
      {!contract && !flow.loading && <CommercialCustomInquiry />}
      {contract && (
        <article className={style}>
          <h3 className="text-base font-semibold">
            {contract.planName
              ? t('contractTitle', { plan: contract.planName })
              : t('contractTitleGeneric')}
          </h3>
          <p className="mt-1 break-all text-xs text-[var(--sc-text-secondary)]">
            {t('version')}: {contract.agreementVersionRef}
          </p>
          {contract.monthlyFeeVnd && (
            <p className="mt-3 text-lg font-semibold">
              {t('monthlyFee')}: {money(contract.monthlyFeeVnd)} / {t('month')}
            </p>
          )}
          <p className="mt-2 text-sm">
            {t('deposit')}: {money(contract.depositRequiredVnd)} · {t('creditLimit')}:{' '}
            {money(contract.creditLimitVnd)}
          </p>
          <p className="mt-2 text-xs text-[var(--sc-text-secondary)]">{t('creditHelp')}</p>
          <p className="my-3 text-sm" role="status">
            {t('signingStatus')}:{' '}
            <strong>{request ? t(`status.${request.status}`) : contract.status}</strong>
          </p>
          {request?.status === 'PREPARING' && <p className="text-sm">{t('preparingHelp')}</p>}
          {request?.status === 'IN_PROGRESS' && (
            <Button
              isLoading={flow.busy}
              onClick={() => {
                void flow.open(request.id);
              }}
            >
              <FileSignature size={16} />
              {t('sign')}
            </Button>
          )}
          {request?.status === 'IN_PROGRESS' && (
            <Button
              variant="outline"
              onClick={() => {
                void flow.original(request.id);
              }}
            >
              {t('preparedPdf')}
            </Button>
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
          <div className="mb-3 flex flex-wrap justify-between gap-2">
            <h3 className="text-base font-semibold">{t('signWithSignNow')}</h3>
            <div className="flex gap-2">
              <a
                href={flow.signingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--sc-primary)] underline"
              >
                {t('newTab')}
              </a>
              <Button variant="ghost" size="sm" onClick={flow.close}>
                {t('close')}
              </Button>
            </div>
          </div>
          <p className="mb-3 text-xs text-[var(--sc-text-secondary)]">
            {t(signingInWindow ? 'signingWindowHint' : 'signingHint')}
          </p>
          {!signingInWindow && (
            <iframe
              src={flow.signingUrl}
              title={t('signWithSignNow')}
              className="h-[70vh] w-full rounded-lg border border-[var(--sc-border-default)]"
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
