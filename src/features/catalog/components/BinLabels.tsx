import { useEffect, useMemo, useState } from 'react';

import { createPortal } from 'react-dom';

import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import Modal from '@/components/Common/Modal/Modal';
import { useAuthStore } from '@/stores/authStore';

import { binBarcode } from '../lib/binBarcode';

import type { Bin } from '../api/warehouseLayoutApi';

export function BinLabels({
  bins,
  warehouseCode,
}: {
  readonly bins: readonly Bin[];
  readonly warehouseCode: string;
}) {
  const t = useTranslations('WarehouseLayout');
  const principal = useAuthStore((s) => s.user);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState(false);
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const visibleBins = useMemo(() => bins.slice(0, 200), [bins]);
  useEffect(() => {
    setPreview(false);
    setError(false);
  }, [principal]);
  useEffect(() => {
    if (!preview) {
      return;
    }
    let cancelled = false;
    void Promise.all(
      visibleBins.map(async (bin) => {
        const url = await QRCode.toDataURL(bin.barcode, {
          width: 140,
          margin: 2,
          errorCorrectionLevel: 'M',
        });
        return [bin.id, url] as const;
      }),
    )
      .then((entries) => {
        if (!cancelled) {
          setQrMap(Object.fromEntries(entries));
        }
      })
      .catch(() => {
        // Code 128 barcode remains available if QR data URL generation fails.
      });
    return () => {
      cancelled = true;
    };
  }, [preview, visibleBins]);
  const labels = visibleBins.map((bin) => ({ bin, encoded: binBarcode(bin.barcode) }));
  const content = (
    <div className="bin-label-grid">
      {labels.map(({ bin, encoded }) => (
        <figure key={bin.id} className="bin-label">
          <figcaption>
            {warehouseCode} · {bin.code}
          </figcaption>
          <div className="bin-label-codes">
            <svg
              role="img"
              aria-label={bin.barcode}
              viewBox={`0 0 ${encoded.width} 55`}
              width={encoded.width * 2}
              height={88}
              shapeRendering="crispEdges"
              style={{ maxWidth: '100%', height: 'auto' }}
            >
              <rect width="100%" height="100%" fill="white" />
              {encoded.bars.map((bar) => (
                <rect key={bar.x} x={bar.x} width={bar.width} y={0} height={55} fill="black" />
              ))}
            </svg>
            {qrMap[bin.id] && (
              <img
                src={qrMap[bin.id]}
                alt={`QR ${bin.barcode}`}
                width={128}
                height={128}
                className="bin-label-qr"
              />
            )}
          </div>
          <p>{bin.barcode}</p>
        </figure>
      ))}
    </div>
  );
  const print = () => {
    try {
      window.print();
      setError(false);
    } catch {
      setError(true);
    }
  };
  return (
    <>
      <Button variant="outline" onClick={() => setPreview(true)}>
        {t('printLabels')}
      </Button>
      {preview && (
        <Modal isOpen onClose={() => setPreview(false)} title={t('printLabels')} width="1040px">
          <p>{t('loadedLabels', { count: labels.length })}</p>
          {error && <Alert variant="error" title={t('printError')} />}
          <div className="max-h-96 overflow-auto">{content}</div>
          <Button onClick={print}>{t('print')}</Button>
        </Modal>
      )}
      {preview &&
        createPortal(
          <div id="orca-bin-print">
            {content}
            <style>{`#orca-bin-print {display:none} .bin-label-grid {display:grid;grid-template-columns:1fr;gap:8mm} .bin-label {padding:4mm;background:white;color:black;text-align:center;border:1px solid #d4d4d8;break-inside:avoid} .bin-label-codes {display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4mm;margin:2mm 0} .bin-label-qr {flex:0 0 auto;image-rendering:pixelated} .bin-label p {font-size:9pt;margin:2mm 0;overflow-wrap:anywhere} @media print {body > * {display:none !important} body > #orca-bin-print {display:block !important} @page {size:A4 landscape;margin:10mm} }`}</style>
          </div>,
          document.body,
        )}
    </>
  );
}
