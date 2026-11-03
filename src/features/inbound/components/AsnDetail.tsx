import { useNavigate } from 'react-router-dom';

import { Copy } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Badge, Button } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { useAccess } from '@/hooks/useAccess';

import { AsnLabels } from './AsnLabels';

import type { Asn } from '../types/asn.types';

interface AsnDetailProps {
  asn: Asn;
  statusTone: string;
  onClose: () => void;
}

const QUANTITIES = [
  ['declaredQty', 'declaredQuantity'],
  ['receivedQty', 'receivedQuantity'],
  ['acceptedQty', 'qualityAccepted'],
  ['quarantinedQty', 'quarantined'],
  ['rejectedQty', 'rejected'],
] as const;

export function AsnDetail({ asn, statusTone, onClose }: AsnDetailProps) {
  const t = useTranslations('Asns');
  const locale = useLocale();
  const navigate = useNavigate();
  const { can } = useAccess();
  const number = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
  const canViewInventory = can('inventory.positions.view') || can('inventory.view');
  const referenceGroups = [
    ['labels', asn.cartonLabelRefs],
    ['receipts', asn.receiptIds],
    ['discrepancies', asn.discrepancyIds],
  ] as const;

  function handleViewInventory() {
    onClose();
    void navigate('/inventory');
  }

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(asn.asnCode);
      toast.success(t('codeCopied'));
    } catch {
      toast.error(t('copyCodeError'));
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={t('detailTitle')} width="1000px">
      <div className="space-y-5 text-sm text-[var(--sc-text-primary)]">
        <section aria-label={t('statusLabel')} className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-[var(--sc-text-secondary)]">{t('yourReference')}</p>
              <p className="mt-1 break-all text-lg font-semibold leading-6">
                {asn.externalReference || t('noExternalReference')}
              </p>
            </div>
            <Badge status={statusTone} label={t(`status.${asn.status}`)} size="md" />
          </div>
          <p className="leading-5 text-[var(--sc-text-secondary)]">
            {t(`statusHelp.${asn.status}`)}
          </p>
          <dl className="grid gap-3 rounded-lg bg-[var(--sc-bg-primary)] p-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[var(--sc-text-secondary)]">{t('arrival')}</dt>
              <dd className="mt-1 font-medium">
                {asn.expectedArrivalAt ? date.format(new Date(asn.expectedArrivalAt)) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--sc-text-secondary)]">{t('actualArrival')}</dt>
              <dd className="mt-1 font-medium">
                {asn.arrivedAt ? date.format(new Date(asn.arrivedAt)) : t('notArrived')}
              </dd>
            </div>
          </dl>
          {asn.cancellationReason && (
            <p>
              {t('cancelReason')}: {asn.cancellationReason}
            </p>
          )}
        </section>

        <section aria-label={t('receivingSummary')} className="space-y-3">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {QUANTITIES.map(([field, label]) => (
              <div key={field} className="rounded-xl border border-[var(--sc-border-default)] p-3">
                <dt className="text-xs text-[var(--sc-text-secondary)]">{t(label)}</dt>
                <dd className="mt-2 text-2xl font-semibold leading-7 tabular-nums">
                  {number.format(asn.lines.reduce((total, line) => total + line[field], 0))}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs leading-5 text-[var(--sc-text-secondary)]">
            {t('qualityAcceptedHint')}
          </p>
        </section>

        <section aria-label={t('productsAndQuantities')} className="space-y-3">
          <h3 className="text-base font-semibold leading-6">{t('productsAndQuantities')}</h3>
          <div className="overflow-x-auto rounded-xl border border-[var(--sc-border-default)]">
            <table
              aria-label={t('productsAndQuantities')}
              className="w-full min-w-[660px] text-left text-sm"
            >
              <thead className="bg-[var(--sc-bg-primary)] text-xs text-[var(--sc-text-secondary)]">
                <tr>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('product')}
                  </th>
                  {QUANTITIES.map(([field, label]) => (
                    <th key={field} scope="col" className="px-3 py-3 text-right font-medium">
                      {t(label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {asn.lines.map((line) => (
                  <tr key={line.id} className="border-t border-[var(--sc-border-default)]">
                    <td className="max-w-64 px-3 py-3">
                      <p className="break-words font-medium">{line.productName}</p>
                      <p className="mt-1 break-all text-xs text-[var(--sc-text-secondary)]">
                        {line.sku}
                      </p>
                      {line.declaredLotCode && (
                        <p className="mt-1 break-all text-xs text-[var(--sc-text-secondary)]">
                          {t('lot')}: {line.declaredLotCode}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-[var(--sc-text-secondary)]">
                        {t('expiry')}: {line.declaredExpiryOn?.slice(0, 10) || t('notDeclared')}
                      </p>
                    </td>
                    {QUANTITIES.map(([field]) => (
                      <td className="px-3 py-3 text-right tabular-nums" key={field}>
                        {number.format(line[field])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold leading-6">{t('cartonLabelsTitle')}</h3>
              <p className="mt-1 text-xs text-[var(--sc-text-secondary)]">
                {asn.cartonLabelRefs.length
                  ? t('cartonLabelsHint', { count: asn.cartonLabelRefs.length })
                  : t('labelsPending')}
              </p>
            </div>
            {asn.cartonLabelRefs.length > 0 && asn.status !== 'CANCELLED' && (
              <AsnLabels asn={asn} />
            )}
          </div>
        </section>

        <div className="grid gap-3 border-t border-[var(--sc-border-default)] pt-4 sm:grid-cols-2">
          <div>
            <p className="font-medium">{t('receiptDocuments')}</p>
            <p className="mt-1 text-xs text-[var(--sc-text-secondary)]">
              {asn.receiptIds.length
                ? t('receiptCount', { count: asn.receiptIds.length })
                : t('noReceipts')}
            </p>
          </div>
          <div>
            <p className="font-medium">{t('discrepancyDocuments')}</p>
            <p className="mt-1 text-xs text-[var(--sc-text-secondary)]">
              {asn.discrepancyIds.length
                ? t('discrepancyCount', { count: asn.discrepancyIds.length })
                : t('noDiscrepancies')}
            </p>
          </div>
        </div>

        <details className="rounded-lg border border-[var(--sc-border-default)] p-3">
          <summary className="font-medium">{t('lookupCodes')}</summary>
          <dl className="mt-3 space-y-3 text-xs">
            <div>
              <dt className="text-[var(--sc-text-secondary)]">{t('code')}</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2">
                <span className="break-all font-mono">{asn.asnCode}</span>
                <Button variant="ghost" size="sm" onClick={() => void handleCopyCode()}>
                  <Copy size={14} aria-hidden="true" />
                  {t('copyCode')}
                </Button>
              </dd>
            </div>
            {referenceGroups.map(([label, references]) => (
              <div key={label}>
                <dt className="text-[var(--sc-text-secondary)]">{t(label)}</dt>
                <dd className="mt-1 space-y-1 break-all font-mono">
                  {references.length
                    ? references.map((reference) => <p key={reference}>{reference}</p>)
                    : '—'}
                </dd>
              </div>
            ))}
          </dl>
        </details>

        {canViewInventory && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sc-border-default)] pt-4">
            <p className="max-w-lg text-xs leading-5 text-[var(--sc-text-secondary)]">
              {t('inventoryLookupHint')}
            </p>
            <Button onClick={handleViewInventory}>{t('viewInventory')}</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
