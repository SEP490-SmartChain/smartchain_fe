import { useEffect, useState } from 'react';

import { createPortal } from 'react-dom';

import { QrCode } from 'lucide-react';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';

import { Button } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';

import type { Asn } from '../types/asn.types';

export function AsnLabels({ asn }: { readonly asn: Asn }) {
  const t = useTranslations('Asns');
  const [preview, setPreview] = useState(false);
  const [qrMap, setQrMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!preview || asn.cartonLabelRefs.length === 0) return;
    let cancelled = false;
    void Promise.all(
      asn.cartonLabelRefs.map(async (reference) => {
        const url = await QRCode.toDataURL(reference, {
          width: 168,
          margin: 2,
          errorCorrectionLevel: 'M',
        });
        return [reference, url] as const;
      }),
    )
      .then((entries) => {
        if (!cancelled) setQrMap(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) setQrMap({});
      });
    return () => {
      cancelled = true;
    };
  }, [preview, asn.cartonLabelRefs]);

  const content = (
    <div className="asn-label-grid">
      {asn.cartonLabelRefs.map((reference, index) => (
        <figure key={reference} className="asn-label">
          <figcaption>
            {t('cartonNumber', { number: index + 1, total: asn.cartonLabelRefs.length })}
          </figcaption>
          <p>{asn.asnCode}</p>
          <div className="asn-label-codes">
            {qrMap[reference] && (
              <img
                src={qrMap[reference]}
                alt={`QR ${reference}`}
                width={148}
                height={148}
                className="asn-label-qr"
              />
            )}
          </div>
          <p>{reference}</p>
        </figure>
      ))}
    </div>
  );
  return (
    <>
      <Button variant="outline" onClick={() => setPreview(true)}>
        <QrCode size={16} aria-hidden="true" />
        {t('printLabels')}
      </Button>
      {preview && (
        <Modal isOpen onClose={() => setPreview(false)} title={t('printLabels')} width="850px">
          <div className="space-y-4">
            <div className="max-h-96 overflow-auto">
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {asn.cartonLabelRefs.map((reference, index) => (
                  <figure
                    key={reference}
                    className="flex flex-col items-center rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-3 text-center"
                  >
                    <figcaption className="text-xs font-semibold text-[var(--sc-text-primary)]">
                      {t('cartonNumber', { number: index + 1, total: asn.cartonLabelRefs.length })}
                    </figcaption>
                    <p className="mt-0.5 text-xs text-[var(--sc-text-secondary)]">{asn.asnCode}</p>
                    <div className="my-2 flex min-h-[148px] items-center justify-center">
                      {qrMap[reference] && (
                        <img
                          src={qrMap[reference]}
                          alt={`QR ${reference}`}
                          width={148}
                          height={148}
                          className="rounded border border-[var(--sc-border-default)] bg-white p-1"
                          style={{ imageRendering: 'pixelated' }}
                        />
                      )}
                    </div>
                    <p className="break-all font-mono text-xs text-[var(--sc-text-primary)]">
                      {reference}
                    </p>
                  </figure>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => window.print()}>{t('print')}</Button>
            </div>
          </div>
        </Modal>
      )}
      {preview &&
        createPortal(
          <div id="orca-asn-print">
            {content}
            <style>{`#orca-asn-print {display:none} .asn-label-grid {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6mm} .asn-label {padding:4mm;background:white;color:black;text-align:center;break-inside:avoid;border:1px solid black} .asn-label-codes {display:flex;align-items:center;justify-content:center;margin:2mm 0} .asn-label-qr {display:block;width:36mm;height:36mm;image-rendering:pixelated} .asn-label p {font-size:9pt;margin:2mm 0;overflow-wrap:anywhere;font-family:monospace} @media print {body > * {display:none !important} body > #orca-asn-print {display:block !important} @page {size:A4 landscape;margin:10mm} }`}</style>
          </div>,
          document.body,
        )}
    </>
  );
}
