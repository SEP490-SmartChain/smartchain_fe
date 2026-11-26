import { useCallback, useEffect, useRef, useState } from 'react';

import { Download, FileCheck2, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';
import Modal from '@/components/Common/Modal/Modal';
import {
  LivePaymentSuccessBanner,
  subscribeUiSync,
  useCommercialLiveSync,
} from '@/features/realtime-notifications';
import { useAccess } from '@/hooks/useAccess';
import { apiClient } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';
import { useLocaleStore } from '@/stores/localeStore';

import { BankReceiptForm } from './BankReceiptForm';
import { InvoiceBankTransfer } from './InvoiceBankTransfer';
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
  const nt = useTranslations('Notifications');
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
    setPayment(null);
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

  const syncCommercial = useCallback(async () => {
    await load();
    await onChanged();
  }, [load, onChanged]);

  const refreshProfileAndInvoice = useCallback(async () => {
    if (scope === 'TENANT') {
      await apiClient.currentUser();
    }
    await load();
    await onChanged();
  }, [load, onChanged, scope]);

  const live = useCommercialLiveSync({
    subscribeUiSync,
    onRefetchCommercial: syncCommercial,
    onRefreshUser: refreshProfileAndInvoice,
  });
  const liveMatchesThisInvoice = Boolean(
    invoice &&
    live.isPaymentLiveConfirmed &&
    (!live.state.lastInvoiceNumber || live.state.lastInvoiceNumber === invoice.invoiceNo),
  );

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

  const formatInvoiceCode = (inv: FeeInvoice) =>
    inv.invoiceNo.endsWith(inv.id)
      ? `${inv.invoiceNo.slice(0, -inv.id.length)}${inv.id.slice(0, 8).toUpperCase()}`
      : inv.invoiceNo;

  const formatSourceLabel = (line: FeeInvoiceLine, inv: FeeInvoice) => {
    if (line.feeType && t.has(`feeTypes.${line.feeType}`)) {
      return t(`feeTypes.${line.feeType}`);
    }
    if (line.ledgerEntryId) {
      return t('kinds.ADJUSTMENT');
    }
    if (inv.documentType === 'PLAN') {
      return t('kinds.PLAN');
    }
    return t('contract');
  };

  return (
    <Modal isOpen onClose={onClose} title={t('detailTitle')} width="960px">
      <div className="space-y-4">
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
        {loading && (
          <p role="status" className="text-sm text-[var(--sc-text-secondary)]">
            {t('loading')}
          </p>
        )}
        {invoice && (
          <>
            {/* Unified Card 1: Invoice Summary Header, Actions & 3-Column Financial Strip */}
            <Card
              padding="none"
              className="overflow-hidden border border-[var(--sc-border-default)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--sc-border-default)] px-5 py-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary)]">
                    <FileCheck2 size={18} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="m-0 text-base font-semibold text-[var(--sc-text-primary)]">
                        {formatInvoiceCode(invoice)}
                      </h3>
                      <span className="rounded-md bg-[var(--sc-bg-secondary)] px-2 py-0.5 text-xs font-medium text-[var(--sc-text-secondary)]">
                        {t(`kinds.${invoice.documentType}`)}
                        {!invoice.periodKey.startsWith('INITIAL') ? ` · ${invoice.periodKey}` : ''}
                      </span>
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
                    <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">
                      {invoice.documentType === 'SERVICE'
                        ? t('ledgerDocument')
                        : t('due', { date: date(invoice.dueOn) })}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || invoice.documentStatus !== 'ISSUED'}
                    onClick={() => {
                      void perform(download);
                    }}
                  >
                    <Download size={14} />
                    {t('pdf')}
                  </Button>
                  {scope === 'TENANT' && invoice.paymentRequired && (
                    <Button
                      size="sm"
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
              </div>

              {/* 3-Column Financial Strip */}
              <dl className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {[
                  ['total', invoice.totalVnd],
                  ['paid', invoice.paidVnd],
                  ['outstanding', invoice.outstandingVnd],
                ].map(
                  ([key, value]) =>
                    key &&
                    value !== undefined && (
                      <div key={key} className="px-5 py-3.5">
                        <dt className="text-xs text-[var(--sc-text-secondary)]">{t(key)}</dt>
                        <dd
                          className={`mt-1 text-lg font-bold tabular-nums ${
                            key === 'outstanding'
                              ? BigInt(value) > BigInt(0)
                                ? 'text-[var(--sc-warning-dark)]'
                                : 'text-[var(--sc-primary)]'
                              : 'text-[var(--sc-text-primary)]'
                          }`}
                        >
                          {money(value)}
                        </dd>
                      </div>
                    ),
                )}
              </dl>

              {invoice.paymentStatus === 'LEDGER' && (
                <div className="border-t border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/40 px-5 py-2.5 text-xs text-[var(--sc-text-secondary)]">
                  {t('ledgerHelp')}
                </div>
              )}
              {invoice.documentStatus === 'ISSUED' &&
                invoice.paymentStatus === 'UNPAID' &&
                !invoice.paymentRequired &&
                !liveMatchesThisInvoice && (
                  <div className="border-t border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/40 px-5 py-2.5 text-xs text-[var(--sc-text-secondary)]">
                    {t('noActiveObligation')}
                  </div>
                )}
            </Card>

            {liveMatchesThisInvoice && (
              <LivePaymentSuccessBanner
                status={live.isServiceLiveActivated ? 'ACTIVATED' : 'POSTED'}
                invoiceNumber={live.state.lastInvoiceNumber ?? invoice.invoiceNo}
                amountVnd={live.state.lastAmountVnd}
                receiptId={live.state.lastReceiptId}
                locale={locale === 'en' ? 'en' : 'vi'}
                badgeLabel={nt(
                  live.isServiceLiveActivated ? 'banner.activatedBadge' : 'banner.postedBadge',
                )}
                title={nt(
                  live.isServiceLiveActivated ? 'banner.activatedTitle' : 'banner.postedTitle',
                )}
                description={nt(
                  live.isServiceLiveActivated
                    ? 'banner.activatedDescription'
                    : 'banner.postedDescription',
                )}
                continueLabel={nt(
                  live.isServiceLiveActivated
                    ? 'banner.activatedContinue'
                    : 'banner.postedContinue',
                )}
                onContinue={onClose}
              />
            )}

            {payment &&
              invoice.paymentRequired &&
              invoice.paymentStatus !== 'PAID' &&
              !liveMatchesThisInvoice && (
                <InvoiceBankTransfer
                  payment={payment}
                  busy={busy}
                  onRefresh={() => {
                    void perform(async () => {
                      await load();
                      await onChanged();
                    });
                  }}
                />
              )}

            {/* Unified Card 2: Fee Lines Table */}
            <Card
              padding="none"
              className="overflow-hidden border border-[var(--sc-border-default)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sc-border-default)] px-5 py-3.5">
                <h4 className="m-0 text-sm font-semibold text-[var(--sc-text-primary)]">
                  {t('lineTitle')}
                </h4>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--sc-primary-alpha-08)] px-2.5 py-1 text-xs font-medium text-[var(--sc-primary)]">
                  <ShieldCheck size={14} aria-hidden />
                  {t('sourceTraceable')}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table
                  className="w-full min-w-[600px] text-left text-sm"
                  aria-label={t('lineTitle')}
                >
                  <thead className="border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/60 text-xs font-semibold uppercase tracking-wider text-[var(--sc-text-secondary)]">
                    <tr>
                      <th className="px-5 py-3">{t('descriptionColumn')}</th>
                      <th className="px-5 py-3">{t('quantity')}</th>
                      <th className="px-5 py-3 text-right">{t('rate')}</th>
                      <th className="px-5 py-3 text-right">{t('amount')}</th>
                      <th className="px-5 py-3">{t('source')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--sc-border-default)]">
                    {lines.map((line) => (
                      <tr
                        key={line.id}
                        className="transition-colors hover:bg-[var(--sc-bg-secondary)]/25"
                      >
                        <td className="px-5 py-3.5">
                          <span className="font-medium text-[var(--sc-text-primary)]">
                            {line.description === 'CLAIM_CREDIT'
                              ? t('feeTypes.CLAIM_CREDIT')
                              : line.feeType && t.has(`feeTypes.${line.feeType}`)
                                ? t(`feeTypes.${line.feeType}`)
                                : invoice.documentType === 'PLAN'
                                  ? t('kinds.PLAN')
                                  : line.ledgerEntryId
                                    ? t('kinds.ADJUSTMENT')
                                    : line.description}
                          </span>
                          <p className="mb-0 mt-0.5 text-xs text-[var(--sc-text-secondary)]">
                            {t.has(`units.${line.unit}`) ? t(`units.${line.unit}`) : line.unit}
                            {line.unitPriceVnd === '0' ? ` · ${t('included')}` : ''}
                          </p>
                        </td>
                        <td className="px-5 py-3.5 tabular-nums text-[var(--sc-text-secondary)]">
                          {line.quantity}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-right tabular-nums text-[var(--sc-text-secondary)]">
                          {money(line.unitPriceVnd)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-right font-semibold tabular-nums text-[var(--sc-text-primary)]">
                          {money(line.amountVnd)}
                        </td>
                        <td className="px-5 py-3.5 text-xs">
                          <span className="inline-flex items-center rounded-md border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/60 px-2.5 py-1 font-medium text-[var(--sc-text-secondary)]">
                            {formatSourceLabel(line, invoice)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {cursor && (
                <div className="border-t border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/40 px-5 py-2.5 text-right">
                  <Button
                    size="sm"
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
                </div>
              )}
            </Card>

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
