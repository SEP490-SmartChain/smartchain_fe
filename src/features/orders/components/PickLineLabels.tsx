import { useEffect, useMemo, useState } from 'react';

import { createPortal } from 'react-dom';

import { QrCode } from 'lucide-react';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import Modal from '@/components/Common/Modal/Modal';
import { useAuthStore } from '@/stores/authStore';

import type { PickLine } from '../api/pickingApi';

type PickLabelKind = 'all' | 'bin' | 'sku' | 'lot';

interface PickQrEntry {
  key: string;
  orderLabel: string;
  title: string;
  value: string;
}

export function PickLineLabels({
  waveCode,
  lines,
  label,
  size = 'sm',
}: {
  readonly waveCode: string;
  readonly lines: readonly PickLine[];
  readonly label?: string;
  readonly size?: 'sm' | 'md';
}) {
  const t = useTranslations('Picking');
  const principal = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PickLabelKind>('all');
  const [index, setIndex] = useState(0);
  const [error, setError] = useState(false);
  const [qrMap, setQrMap] = useState(() => new Map<string, string>());

  useEffect(() => {
    setOpen(false);
    setError(false);
  }, [principal]);

  const entries = useMemo<PickQrEntry[]>(() => {
    const visible = lines.slice(0, 200);
    const items: PickQrEntry[] = [];
    for (const line of visible) {
      const orderLabel = t('pickForOrder', {
        orderCode: line.orderCode,
        parcelNo: line.parcelNo,
      });
      if (kind === 'all' || kind === 'bin') {
        items.push({
          key: `${line.id}:bin`,
          orderLabel,
          title: `${t('labelBin')} · ${line.binCode}`,
          value: line.binCode,
        });
      }
      if (kind === 'all' || kind === 'sku') {
        items.push({
          key: `${line.id}:sku`,
          orderLabel,
          title: `${t('labelSku')} · ${line.productName}`,
          value: line.sku,
        });
      }
      if (kind === 'all' || kind === 'lot') {
        items.push({
          key: `${line.id}:lot`,
          orderLabel,
          title: `${t('labelLot')} · ${line.sku}`,
          value: line.lotCode,
        });
      }
    }
    return items;
  }, [kind, lines, t]);

  useEffect(() => {
    if (!open || entries.length === 0) return;
    let cancelled = false;
    void Promise.all(
      entries.map(async (entry) => {
        const url = await QRCode.toDataURL(entry.value, {
          width: 168,
          margin: 2,
          errorCorrectionLevel: 'M',
        });
        return [entry.value, url] as const;
      }),
    )
      .then((pairs) => {
        if (!cancelled) {
          setQrMap(new Map(pairs));
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, entries]);

  if (!lines.length) return null;

  const activeIndex = Math.min(index, entries.length - 1);
  const active = entries[activeIndex];
  const content = (
    <div className="pick-label-grid">
      {entries.map((entry) => (
        <figure key={entry.key} className="pick-label">
          <figcaption className="pick-label-title">{entry.title}</figcaption>
          <p className="pick-label-meta">{entry.orderLabel}</p>
          <div className="pick-label-codes">
            {qrMap.has(entry.value) && (
              <img
                src={qrMap.get(entry.value)}
                alt={`QR ${entry.value}`}
                width={152}
                height={152}
                className="pick-label-qr"
              />
            )}
          </div>
          <p className="pick-label-value">{entry.value}</p>
        </figure>
      ))}
    </div>
  );

  const printLabels = () => {
    try {
      window.print();
      setError(false);
    } catch {
      setError(true);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={() => {
          setKind('all');
          setIndex(0);
          setOpen(true);
        }}
      >
        <QrCode size={16} aria-hidden="true" />
        {label ?? t('viewQrLabels')}
      </Button>
      {open && (
        <Modal
          isOpen
          onClose={() => setOpen(false)}
          title={`${t('pickLabelsTitle')} · ${waveCode}`}
          width="520px"
        >
          <div className="space-y-4">
            {entries.length > 1 && (
              <p className="text-sm text-[var(--sc-text-secondary)]">{t('pickLabelsHint')}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {(['all', 'bin', 'sku', 'lot'] as const).map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={kind === option ? 'primary' : 'outline'}
                  aria-pressed={kind === option}
                  onClick={() => {
                    setKind(option);
                    setIndex(0);
                  }}
                >
                  {t(`labelFilter.${option}`)}
                </Button>
              ))}
            </div>
            {error && <Alert variant="error" title={t('printError')} />}
            {active && (
              <figure
                key={active.key}
                className="flex flex-col items-center rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-3 text-center"
              >
                <figcaption
                  aria-live="polite"
                  className="text-sm font-semibold text-[var(--sc-text-primary)]"
                >
                  {active.title}
                </figcaption>
                <p className="mt-0.5 text-xs text-[var(--sc-text-secondary)]">
                  {active.orderLabel}
                </p>
                <div className="my-2 flex min-h-[152px] items-center justify-center">
                  {qrMap.has(active.value) && (
                    <img
                      src={qrMap.get(active.value)}
                      alt={`QR ${active.value}`}
                      width={152}
                      height={152}
                      className="rounded border border-[var(--sc-border-default)] bg-white p-1"
                    />
                  )}
                </div>
                <p className="break-all font-mono text-xs text-[var(--sc-text-primary)]">
                  {active.value}
                </p>
              </figure>
            )}
            {entries.length > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={activeIndex === 0}
                  onClick={() => setIndex(activeIndex - 1)}
                >
                  {t('previousLabel')}
                </Button>
                <span className="text-xs text-[var(--sc-text-secondary)]">
                  {t('labelProgress', { step: activeIndex + 1, total: entries.length })}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={activeIndex === entries.length - 1}
                  onClick={() => setIndex(activeIndex + 1)}
                >
                  {t('nextLabel')}
                </Button>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('closeLabels')}
              </Button>
              <Button
                type="button"
                disabled={entries.some((entry) => !qrMap.has(entry.value))}
                onClick={printLabels}
              >
                {t('printLabels')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {open &&
        createPortal(
          <div id="orca-pick-print">
            {content}
            <style>{`#orca-pick-print {display:none} .pick-label-grid {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6mm} .pick-label {padding:4mm;background:white;color:black;text-align:center;break-inside:avoid;border:1px solid black} .pick-label-title {font-size:9pt;font-weight:700;margin-bottom:1mm} .pick-label-meta {font-size:8pt;margin:0 0 2mm} .pick-label-codes {display:flex;justify-content:center;margin:2mm 0} .pick-label-qr {display:block;width:36mm;height:36mm;image-rendering:pixelated} .pick-label-value {font-size:8pt;margin:2mm 0 0;overflow-wrap:anywhere;font-family:monospace} @media print {body > * {display:none !important} body > #orca-pick-print {display:block !important} @page {size:A4;margin:10mm} }`}</style>
          </div>,
          document.body,
        )}
    </>
  );
}
