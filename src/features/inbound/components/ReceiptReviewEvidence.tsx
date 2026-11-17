import { useLocale, useTranslations } from 'next-intl';

import type { DiscrepancyState } from '../api/discrepancyApi';
import type { ReceivingState } from '../api/receivingApi';
import type { ReviewState } from '../api/reviewApi';

interface Props {
  records: ReviewState['records'];
  reports: DiscrepancyState['items'];
  lines: ReceivingState['lines'];
}

/** Reports remain separate evidence; the final decision still binds the whole receipt. */
export function ReceiptReviewEvidence({ records, reports, lines }: Props) {
  const t = useTranslations('Receiving');
  const locale = useLocale();
  const label = (line: ReceivingState['lines'][number] | undefined) =>
    line ? `${line.sku} — ${line.productName}` : t('reviewUnknownLine');
  const recordLine = (id: string) =>
    lines.find((line) => line.count?.lots.some((lot) => lot.recordId === id));

  return (
    <div className="space-y-4">
      {records.length > 0 && (
        <section
          aria-label={t('reviewLotDetails', { count: records.length })}
          className="space-y-2"
        >
          <h3 className="text-sm font-semibold">
            {t('reviewLotDetails', { count: records.length })}
          </h3>
          {records.map((record) => (
            <details
              key={record.receivingRecordId}
              className="rounded-lg border border-[var(--sc-border-default)] p-3 text-sm"
            >
              <summary className="cursor-pointer font-medium">
                {label(recordLine(record.receivingRecordId))} · {record.lotCode}
              </summary>
              <div className="mt-2 space-y-2">
                <p>{t('countSaved', { quantity: record.receivedQty })}</p>
                {record.inspection ? (
                  <>
                    <p>
                      {t('reviewPartition', {
                        accepted: record.inspection.acceptedQty,
                        quarantine: record.inspection.quarantinedQty,
                        rejected: record.inspection.rejectedQty,
                      })}
                    </p>
                    {record.inspection.reason && (
                      <p className="break-words">{record.inspection.reason}</p>
                    )}
                    <p>{t('qcAttached', { count: record.inspection.photoIds.length })}</p>
                  </>
                ) : (
                  <p>{t('reviewQcPending')}</p>
                )}
              </div>
            </details>
          ))}
        </section>
      )}
      <section
        aria-label={t('reviewReportsTitle', { count: reports.length })}
        className="space-y-2"
      >
        <h3 className="text-sm font-semibold">
          {t('reviewReportsTitle', { count: reports.length })}
        </h3>
        {reports.map((report, index) => {
          const line = lines.find((row) => row.id === report.inboundLineId);
          const lot = records.find((row) => row.receivingRecordId === report.receivingRecordId);
          return (
            <article
              key={report.id}
              className="space-y-2 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-3 text-sm"
            >
              <h4 className="text-sm font-semibold">
                {t('reviewReportNumber', { number: index + 1 })} ·{' '}
                {t(`discrepancy${report.discrepancyType}`)}
              </h4>
              <p className="font-medium">
                {label(line)}
                {lot ? ` · ${lot.lotCode}` : ''}
              </p>
              <p>
                {t('discrepancyReported', {
                  type: t(`discrepancy${report.discrepancyType}`),
                  qty: report.qty,
                })}
              </p>
              <p className="whitespace-pre-wrap break-words">{report.reason}</p>
              <p>{t('qcAttached', { count: report.photoIds.length })}</p>
              <p className="text-xs text-[var(--sc-text-secondary)]">
                {new Date(report.reportedAt).toLocaleString(locale)}
              </p>
            </article>
          );
        })}
        {reports.length === 0 && (
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('reviewNoReports')}</p>
        )}
      </section>
    </div>
  );
}
