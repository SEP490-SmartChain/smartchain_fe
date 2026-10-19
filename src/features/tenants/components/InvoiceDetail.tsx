import { useCallback, useEffect, useRef, useState } from 'react';

import { Download, FileCheck2, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
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
    const current = abort.current;
    setLoading(true);
    setError(null);
    try {
      const [header, page] = await Promise.all([
        invoiceApi.detail(id, tenantId, current.signal),
        invoiceApi.lines(id, { tenantId, limit: 100 }, current.signal),
      ]);
      if (!current.signal.aborted) {
        setInvoice(header);
        setLines(page.items);
        setCursor(page.pagination.nextCursor);
      }
    } catch (failure) {
      if (!current.signal.aborted) {
        setError(failure instanceof Error ? failure.message : t('loadError'));
      }
    } finally {
      if (!current.signal.aborted) setLoading(false);
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
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB').format(
      new Date(`${value}T12:00:00Z`),
    );
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
            <div className="rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-[var(--sc-bg-elevated)] p-3 text-[var(--sc-primary)]">
                    <FileCheck2 size={24} aria-hidden />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-[var(--sc-primary)]">
                      {t(`kinds.${invoice.documentType}`)} · {invoice.periodKey}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold" title={invoice.invoiceNo}>
                      {invoice.invoiceNo.endsWith(invoice.id)
                        ? `${invoice.invoiceNo.slice(0, -invoice.id.length)}${invoice.id.slice(0, 8).toUpperCase()}`
                        : invoice.invoiceNo}
                    </h3>
                    <p className="mt-2 text-sm text-[var(--sc-text-secondary)]">
                      {invoice.documentType === 'SERVICE'
                        ? t('ledgerDocument')
                        : t('due', { date: date(invoice.dueOn) })}
                    </p>
                  </div>
                </div>
                <Badge
                  status={
                    invoice.documentStatus === 'DRAFT'
                      ? 'default'
                      : invoice.paymentStatus === 'PAID'
                        ? 'success'
                        : invoice.paymentStatus === 'EXPIRED'
                          ? 'error'
                          : invoice.paymentStatus === 'LEDGER'
                            ? 'info'
                            : 'warning'
                  }
                  label={t(
                    `states.${invoice.documentStatus === 'DRAFT' ? 'DRAFT' : invoice.paymentStatus}`,
                  )}
                />
              </div>
              <dl className="mt-6 grid gap-5 border-t border-[var(--sc-border-default)] pt-5 sm:grid-cols-3">
                {[
                  ['total', invoice.totalVnd],
                  ['paid', invoice.paidVnd],
                  ['outstanding', invoice.outstandingVnd],
                ].map(
                  ([key, value]) =>
                    key &&
                    value !== undefined && (
                      <div key={key}>
                        <dt className="text-xs text-[var(--sc-text-secondary)]">{t(key)}</dt>
                        <dd
                          className={`mt-2 text-xl font-semibold tabular-nums ${key === 'outstanding' ? 'text-[var(--sc-primary)]' : ''}`}
                        >
                          {money(value)}
                        </dd>
                      </div>
                    ),
                )}
              </dl>
              <details className="mt-5 text-xs text-[var(--sc-text-secondary)]">
                <summary className="cursor-pointer rounded py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)]">
                  {t('documentReference')}
                </summary>
                <p className="mt-2 break-all font-mono">{invoice.invoiceNo}</p>
              </details>
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
            {invoice.documentStatus === 'ISSUED' &&
              invoice.paymentStatus === 'UNPAID' &&
              !invoice.paymentRequired && <Alert variant="info">{t('noActiveObligation')}</Alert>}
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
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className="font-semibold">{t('lineTitle')}</h4>
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--sc-text-secondary)]">
                  <ShieldCheck size={14} aria-hidden />
                  {t('sourceTraceable')}
                </span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-[var(--sc-border-default)]">
                <table
                  className="w-full min-w-[650px] text-left text-sm"
                  aria-label={t('lineTitle')}
                >
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
                          <span className="font-medium">
                            {line.feeType && t.has(`feeTypes.${line.feeType}`)
                              ? t(`feeTypes.${line.feeType}`)
                              : invoice.documentType === 'PLAN'
                                ? t('kinds.PLAN')
                                : line.ledgerEntryId
                                  ? t('kinds.ADJUSTMENT')
                                  : line.description}
                          </span>
                          <p className="mt-1 text-xs text-[var(--sc-text-secondary)]">
                            {t.has(`units.${line.unit}`) ? t(`units.${line.unit}`) : line.unit}
                            {line.unitPriceVnd === '0' ? ` · ${t('included')}` : ''}
                          </p>
                        </td>
                        <td className="px-4 py-3 tabular-nums">{line.quantity}</td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                          {money(line.unitPriceVnd)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">
                          {money(line.amountVnd)}
                        </td>
                        <td className="max-w-80 break-all px-4 py-3 text-xs text-[var(--sc-text-secondary)]">
                          <details>
                            <summary className="cursor-pointer rounded py-1 text-[var(--sc-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)]">
                              {t('viewSource')}
                            </summary>
                            <p className="mt-2">{line.description}</p>
                            <p className="mt-2">
                              {line.refType ?? (line.ledgerEntryId ? 'ADJUST' : t('contract'))}
                            </p>
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
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
