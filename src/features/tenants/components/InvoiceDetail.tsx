import { useCallback, useEffect, useRef, useState } from 'react';

import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import Modal from '@/components/Common/Modal/Modal';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';
import { useLocaleStore } from '@/stores/localeStore';

import { BankReceiptForm } from './BankReceiptForm';
import {
  invoiceApi,
  type FeeInvoice,
  type FeeInvoiceLine,
  type InvoicePayment,
} from '../api/invoiceApi';

export function InvoiceDetail({
  id,
  tenantId,
  onClose,
  onChanged,
}: {
  id: string;
  tenantId?: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('Invoices');
  const locale = useLocaleStore((s) => s.locale);
  const scope = useAuthStore((s) => s.user?.actorScope);
  const { can } = useAccess();
  const [invoice, setInvoice] = useState<FeeInvoice | null>(null),
    [lines, setLines] = useState<FeeInvoiceLine[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [payment, setPayment] = useState<InvoicePayment | null>(null);
  const abort = useRef(new AbortController());
  useEffect(() => {
    const current = new AbortController();
    abort.current = current;
    return () => {
      current.abort();
    };
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [header, page] = await Promise.all([
        invoiceApi.detail(id, tenantId, abort.current.signal),
        invoiceApi.lines(id, { tenantId, limit: 100 }, abort.current.signal),
      ]);
      if (!abort.current.signal.aborted) {
        setInvoice(header);
        setLines(page.items);
        setCursor(page.pagination.nextCursor);
      }
    } catch (failure) {
      if (!abort.current.signal.aborted) {
        setError(failure instanceof Error ? failure.message : t('loadError'));
      }
    } finally {
      if (!abort.current.signal.aborted) setLoading(false);
    }
  }, [id, tenantId, t]);
  useEffect(() => {
    void load();
  }, [load]);
  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      if (!abort.current.signal.aborted) {
        setError(failure instanceof Error ? failure.message : t('loadError'));
      }
    } finally {
      if (!abort.current.signal.aborted) setBusy(false);
    }
  };
  const money = (value: string) =>
    `${BigInt(value).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')} VND`;
  const download = async () => {
    const blob = await invoiceApi.pdf(id, tenantId, abort.current.signal);
    if (abort.current.signal.aborted) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `invoice-${id}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Modal isOpen onClose={onClose} title={t('detailTitle')} width="1100px">
      <div className="space-y-5">
        {error && (
          <Alert variant="error">
            {error}
            <Button
              variant="ghost"
              onClick={() => {
                void load();
              }}
            >
              {t('retry')}
            </Button>
          </Alert>
        )}
        {loading && <p role="status">{t('loading')}</p>}
        {invoice && (
          <>
            <div className="flex flex-wrap justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase text-[var(--sc-primary)]">
                  {t(`kinds.${invoice.documentType}`)} · {invoice.periodKey}
                </p>
                <h3 className="mt-2 break-all text-base font-semibold">{invoice.invoiceNo}</h3>
                <p className="mt-2 text-sm text-[var(--sc-text-secondary)]">
                  {t('due', { date: invoice.dueOn })}
                </p>
              </div>
              <p className="text-xl font-semibold tabular-nums">{money(invoice.totalVnd)}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                disabled={busy || invoice.documentStatus !== 'ISSUED'}
                onClick={() => {
                  void perform(download);
                }}
              >
                <Download size={16} />
                {t('pdf')}
              </Button>
              {scope === 'TENANT' && invoice.paymentRequired && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    void perform(async () => {
                      const result = await invoiceApi.payment(id, abort.current.signal);
                      if (!abort.current.signal.aborted) setPayment(result);
                    });
                  }}
                >
                  {t('pay')}
                </Button>
              )}
            </div>
            {invoice.paymentStatus === 'LEDGER' && <Alert variant="info">{t('ledgerHelp')}</Alert>}
            {payment && (
              <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-4">
                <h4 className="font-semibold">{t('bankTitle')}</h4>
                <p className="mt-2 text-sm leading-6">{t('bankHelp')}</p>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt>{t('reference')}</dt>
                    <dd className="break-all font-medium">{payment.reference}</dd>
                  </div>
                  <div>
                    <dt>{t('outstanding')}</dt>
                    <dd className="font-medium">{money(payment.amountVnd)}</dd>
                  </div>
                </dl>
              </div>
            )}
            <div className="overflow-x-auto rounded-xl border border-[var(--sc-border-default)]">
              <table className="w-full text-left text-sm" aria-label={t('lineTitle')}>
                <thead className="bg-[var(--sc-bg-secondary)]">
                  <tr>
                    {['descriptionColumn', 'quantity', 'rate', 'amount', 'source'].map((key) => (
                      <th key={key} className="px-4 py-3 text-xs font-medium">
                        {t(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="border-t border-[var(--sc-border-default)]">
                      <td className="px-4 py-3">
                        {line.description}
                        <p className="mt-1 text-xs text-[var(--sc-text-secondary)]">{line.unit}</p>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{line.quantity}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                        {money(line.unitPriceVnd)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">
                        {money(line.amountVnd)}
                      </td>
                      <td className="max-w-80 break-all px-4 py-3 text-xs text-[var(--sc-text-secondary)]">
                        {line.refType ?? (line.ledgerEntryId ? 'ADJUST' : t('contract'))}
                        <p className="mt-1 font-mono">
                          {line.refId ?? line.ledgerEntryId ?? invoice.contractId}
                        </p>
                        {line.billableEventId && (
                          <p className="mt-2 font-mono">
                            {t('event')}: {line.billableEventId}
                          </p>
                        )}
                        {line.tariffVersionRef && (
                          <p className="mt-2 font-mono">
                            {t('tariff')}: {line.tariffVersionRef}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cursor && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  void perform(async () => {
                    const page = await invoiceApi.lines(
                      id,
                      { tenantId, cursor, limit: 100 },
                      abort.current.signal,
                    );
                    if (!abort.current.signal.aborted) {
                      setLines((old) => [...old, ...page.items]);
                      setCursor(page.pagination.nextCursor);
                    }
                  });
                }}
              >
                {t('more')}
              </Button>
            )}
            {tenantId &&
              can('invoice.bankReceipt.post') &&
              invoice.paymentRequired &&
              (invoice.documentType === 'ONBOARDING' || invoice.documentType === 'PLAN') && (
                <BankReceiptForm
                  invoice={invoice}
                  tenantId={tenantId}
                  onPosted={async () => {
                    await load();
                    await onChanged();
                  }}
                />
              )}
          </>
        )}
      </div>
    </Modal>
  );
}
