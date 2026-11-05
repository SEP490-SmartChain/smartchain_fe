import { useEffect, useState } from 'react';

import { QrCode, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';

import { Button } from '@/components/Common/Button/Button';
import { useLocaleStore } from '@/stores/localeStore';

import type { InvoicePayment } from '../api/invoiceApi';

export function InvoiceBankTransfer({
  payment,
  busy,
  onRefresh,
}: {
  payment: InvoicePayment;
  busy: boolean;
  onRefresh: () => void;
}) {
  const t = useTranslations('Invoices');
  const locale = useLocaleStore((state) => state.locale);
  const transfer = payment.bankTransfer;
  const payload = transfer?.qrPayload;
  const [image, setImage] = useState<{ payload: string; url: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (payload) {
      // Render in this browser; receiving account and invoice never go to an image service.
      void QRCode.toDataURL(payload, { width: 256, margin: 4, errorCorrectionLevel: 'M' })
        .then((url) => {
          if (!cancelled) setImage({ payload, url });
        })
        .catch(() => {
          if (!cancelled) setFailed(payload);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [payload]);
  const money = `${BigInt(payment.amountVnd).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')} VND`;
  const readyImage = image?.payload === payload ? image : null;
  return (
    <section
      className="overflow-hidden rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]"
      aria-label={t('bankTitle')}
    >
      <div className="flex items-center gap-3 border-b border-[var(--sc-border-default)] px-5 py-4">
        <QrCode size={22} className="text-[var(--sc-primary)]" aria-hidden />
        <h4 className="font-semibold">{t('bankTitle')}</h4>
      </div>
      <div
        className={`grid gap-6 p-5 sm:p-6 ${transfer ? 'md:grid-cols-[256px_minmax(0,1fr)]' : ''}`}
      >
        {transfer && (
          <div className="flex flex-col items-center justify-center gap-2">
            {readyImage ? (
              <img
                src={readyImage.url}
                alt={t('qrAlt')}
                width={256}
                height={256}
                className="h-auto max-w-full rounded-xl"
              />
            ) : (
              <p role="status" className="p-6 text-sm text-[var(--sc-text-secondary)]">
                {failed === payload ? t('qrError') : t('qrLoading')}
              </p>
            )}
            <span className="text-xs text-[var(--sc-text-secondary)]">{t('qrCaption')}</span>
          </div>
        )}
        <div className="min-w-0 self-center">
          <p className="text-xs text-[var(--sc-text-secondary)]">{t('outstanding')}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--sc-primary)]">
            {money}
          </p>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            {transfer && (
              <>
                <div>
                  <dt className="text-xs text-[var(--sc-text-secondary)]">{t('receivingBank')}</dt>
                  <dd className="mt-1 font-medium">{transfer.bankCode}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--sc-text-secondary)]">
                    {t('receivingAccount')}
                  </dt>
                  <dd className="mt-1 break-all font-medium tabular-nums">
                    {transfer.accountNumber}
                  </dd>
                </div>
                {transfer.accountName && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-[var(--sc-text-secondary)]">
                      {t('accountHolder')}
                    </dt>
                    <dd className="mt-1 font-medium">{transfer.accountName}</dd>
                  </div>
                )}
              </>
            )}
            <div className="sm:col-span-2">
              <dt className="text-xs text-[var(--sc-text-secondary)]">{t('reference')}</dt>
              <dd className="mt-2 break-all rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-3 font-mono text-xs font-medium">
                {transfer?.content ?? payment.reference}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-5 text-[var(--sc-text-secondary)]">
            {transfer ? t('qrHelp') : t('bankHelp')}
          </p>
          <Button variant="outline" className="mt-4" disabled={busy} onClick={onRefresh}>
            <RefreshCw size={15} aria-hidden />
            {t('checkPayment')}
          </Button>
        </div>
      </div>
    </section>
  );
}
