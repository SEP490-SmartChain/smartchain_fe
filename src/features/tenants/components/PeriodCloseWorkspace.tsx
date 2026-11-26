import { useEffect, useMemo, useState } from 'react';

import { useLocale, useTranslations } from 'next-intl';

import { Alert, Badge, Button, Card, SearchableSelect, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import {
  periodCloseApi,
  type PeriodInvoice,
  type PeriodPreview,
  type PeriodSeller,
} from '@/features/tenants/api/periodCloseApi';

const MONTHS_TO_OFFER = 12;

/** Completed business months only (Asia/Ho_Chi_Minh), newest first. */
function completedMonths(now: Date): string[] {
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  let year = local.getFullYear();
  let month = local.getMonth() + 1; // 1-based: the current month is not completed yet
  const months: string[] = [];
  for (let i = 0; i < MONTHS_TO_OFFER; i += 1) {
    month -= 1;
    if (month === 0) {
      year -= 1;
      month = 12;
    }
    months.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return months;
}

/** Accountant closes a completed month for one seller and sees the invoices it produced. */
export function PeriodCloseWorkspace() {
  const t = useTranslations('PeriodClose');
  const locale = useLocale();
  const months = useMemo(() => completedMonths(new Date()), []);
  const [sellers, setSellers] = useState<PeriodSeller[]>([]),
    [sellersLoading, setSellersLoading] = useState(true),
    [sellersError, setSellersError] = useState(false),
    [tenantId, setTenantId] = useState(''),
    [month, setMonth] = useState(months[0] ?? ''),
    [confirming, setConfirming] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [result, setResult] = useState<{ month: string; count: number } | null>(null),
    [invoices, setInvoices] = useState<PeriodInvoice[]>([]),
    [invoicesLoading, setInvoicesLoading] = useState(false),
    [loaded, setLoaded] = useState(false),
    [downloadingId, setDownloadingId] = useState<string | null>(null),
    [preview, setPreview] = useState<PeriodPreview | null>(null),
    [previewLoading, setPreviewLoading] = useState(false),
    [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    periodCloseApi
      .sellers(controller.signal)
      .then(setSellers)
      .catch(() => {
        if (!controller.signal.aborted) setSellersError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSellersLoading(false);
      });
    return () => controller.abort();
  }, []);

  const money = (value: string) => Number(value).toLocaleString(locale);
  const selectedSeller = sellers.find((seller) => seller.id === tenantId);

  async function loadInvoices(seller: string) {
    setInvoicesLoading(true);
    setError(null);
    try {
      setInvoices(await periodCloseApi.invoices(seller, null));
      setLoaded(true);
    } catch {
      setError(t('loadError'));
    } finally {
      setInvoicesLoading(false);
    }
  }

  function chooseSeller(value: string) {
    setTenantId(value);
    setInvoices([]);
    setLoaded(false);
    setResult(null);
    setError(null);
    if (value) void loadInvoices(value);
  }

  async function openConfirm() {
    setConfirming(true);
    setPreview(null);
    setPreviewError(false);
    setPreviewLoading(true);
    try {
      setPreview(await periodCloseApi.preview(tenantId, month));
    } catch {
      setPreviewError(true);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function close() {
    setBusy(true);
    setError(null);
    try {
      const closed = await periodCloseApi.close(tenantId, month);
      setInvoices(await periodCloseApi.invoices(tenantId, null));
      setLoaded(true);
      setResult({ month, count: closed.invoiceIds.length });
      setConfirming(false);
    } catch {
      setError(t('closeError'));
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf(invoice: PeriodInvoice) {
    setDownloadingId(invoice.id);
    setError(null);
    try {
      const blob = await periodCloseApi.pdf(invoice.id, tenantId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${invoice.invoiceNo}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t('pdfError'));
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="m-0 text-2xl font-medium">{t('title')}</h1>
        <p className="m-0 mt-1 text-sm text-[var(--sc-text-secondary)]">{t('description')}</p>
      </div>

      <Card className="grid gap-4 p-5 sm:grid-cols-[minmax(0,260px)_200px_auto] sm:items-end">
        <SearchableSelect
          className={tenantId ? undefined : "[&_button[aria-haspopup='listbox']]:pr-10"}
          label={t('seller')}
          placeholder={t('sellerPlaceholder')}
          searchPlaceholder={t('sellerSearch')}
          emptyMessage={t('sellerEmpty')}
          loading={sellersLoading}
          loadingMessage={t('sellersLoading')}
          error={sellersError ? t('sellersError') : undefined}
          value={tenantId}
          onChange={chooseSeller}
          options={sellers.map((seller) => ({
            value: seller.id,
            label: seller.name,
            sublabel: seller.slug,
          }))}
        />
        <Select
          label={t('month')}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          options={months.map((m) => ({ value: m, label: m }))}
        />
        <div className="flex gap-2">
          <Button disabled={!tenantId || !month} onClick={() => void openConfirm()}>
            {t('close')}
          </Button>
        </div>
      </Card>

      {error && <Alert variant="error" title={error} />}
      {result && result.count > 0 && (
        <Alert
          variant="success"
          title={t('closedWithInvoices', { month: result.month, count: result.count })}
        />
      )}
      {result && result.count === 0 && (
        <Alert variant="info" title={t('closedNoInvoice', { month: result.month })} />
      )}

      {tenantId && invoicesLoading && <p role="status">{t('invoicesLoading')}</p>}
      {loaded && !invoicesLoading && invoices.length === 0 && (
        <Alert variant="info" title={t('noInvoices')} />
      )}

      {invoices.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <p className="m-0 px-3 pt-3 text-sm font-medium">
            {t('invoicesOf', { seller: selectedSeller?.name ?? '' })}
          </p>
          <table className="w-full text-sm" aria-label={t('tableLabel')}>
            <thead className="text-left text-xs text-[var(--sc-text-secondary)]">
              <tr>
                <th className="p-3 font-medium">{t('invoiceNo')}</th>
                <th className="p-3 font-medium">{t('period')}</th>
                <th className="p-3 text-right font-medium">{t('total')}</th>
                <th className="p-3 text-right font-medium">{t('outstanding')}</th>
                <th className="p-3 font-medium">{t('paymentStatus')}</th>
                <th className="p-3 font-medium">{t('file')}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-[var(--sc-border-default)]">
                  <td className="p-3 font-mono text-xs">{inv.invoiceNo}</td>
                  <td className="p-3">{inv.periodKey}</td>
                  <td className="p-3 text-right tabular-nums">{money(inv.totalVnd)} VND</td>
                  <td className="p-3 text-right tabular-nums">{money(inv.outstandingVnd)} VND</td>
                  <td className="p-3">
                    {inv.totalVnd === '0' ? (
                      <Badge status="info" label={t('payment.NO_DUE')} />
                    ) : (
                      <Badge
                        status={inv.paymentStatus === 'PAID' ? 'success' : 'warning'}
                        label={t(`payment.${inv.paymentStatus}`)}
                      />
                    )}
                  </td>
                  <td className="p-3">
                    <Button
                      variant="outline"
                      size="sm"
                      isLoading={downloadingId === inv.id}
                      onClick={() => void downloadPdf(inv)}
                    >
                      {t('downloadPdf')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        isOpen={confirming}
        title={t('confirmTitle')}
        width="480px"
        onClose={() => {
          if (!busy) setConfirming(false);
        }}
      >
        <div className="space-y-5">
          <p className="m-0 text-sm">
            {t('confirmBody', { seller: selectedSeller?.name ?? '', month })}
          </p>
          {previewLoading && (
            <p role="status" className="m-0 text-sm">
              {t('previewLoading')}
            </p>
          )}
          {previewError && <Alert variant="error" title={t('previewError')} />}
          {preview && (
            <div className="space-y-2 rounded-[var(--sc-radius-md)] bg-[var(--sc-bg-muted)] p-3 text-sm">
              {preview.alreadyClosed && <p className="m-0">{t('previewClosed')}</p>}
              {preview.billableEventCount === 0 && preview.adjustmentCount === 0 ? (
                <p className="m-0">{t('previewEmpty')}</p>
              ) : (
                <>
                  <p className="m-0 tabular-nums">
                    {t('previewFees', {
                      count: preview.billableEventCount,
                      total: money(preview.billableTotalVnd),
                    })}
                  </p>
                  <p className="m-0 tabular-nums">
                    {t('previewAdjustments', {
                      count: preview.adjustmentCount,
                      total: money(preview.adjustmentTotalVnd),
                    })}
                  </p>
                </>
              )}
              {preview.hasMore && <p className="m-0">{t('previewMore')}</p>}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
              {t('cancel')}
            </Button>
            <Button isLoading={busy} onClick={() => void close()}>
              {t('confirmClose')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
