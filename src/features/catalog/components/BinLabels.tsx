import { useEffect, useMemo, useState } from 'react';

import { createPortal } from 'react-dom';

import { QrCode } from 'lucide-react';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import Modal from '@/components/Common/Modal/Modal';
import { useAuthStore } from '@/stores/authStore';

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
          width: 160,
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
        setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [preview, visibleBins]);
  const content = (
    <div className="bin-label-grid">
      {visibleBins.map((bin) => (
        <figure key={bin.id} className="bin-label">
          <figcaption>
            {warehouseCode} · {bin.code}
          </figcaption>
          <div className="bin-label-codes">
            {qrMap[bin.id] && (
              <img
                src={qrMap[bin.id]}
                alt={`QR ${bin.barcode}`}
                width={144}
                height={144}
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
        <QrCode size={16} aria-hidden="true" />
        {t('printLabels')}
      </Button>
      {preview && (
        <Modal isOpen onClose={() => setPreview(false)} title={t('printLabels')} width="800px">
          <p>{t('loadedLabels', { count: visibleBins.length })}</p>
          {error && <Alert variant="error" title={t('printError')} />}
          <div className="max-h-96 overflow-auto">{content}</div>
          <Button onClick={print}>{t('print')}</Button>
        </Modal>
      )}
      {preview &&
        createPortal(
          <div id="orca-bin-print">
            {content}
            <style>{`#orca-bin-print {display:none} .bin-label-grid {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8mm} .bin-label {padding:4mm;background:white;color:black;text-align:center;border:1px solid #d4d4d8;break-inside:avoid} .bin-label-codes {display:flex;align-items:center;justify-content:center;margin:2mm 0} .bin-label-qr {flex:0 0 auto;image-rendering:pixelated} .bin-label p {font-size:9pt;margin:2mm 0;overflow-wrap:anywhere} @media print {body > * {display:none !important} body > #orca-bin-print {display:block !important} @page {size:A4 landscape;margin:10mm} }`}</style>
          </div>,
          document.body,
        )}
    </>
  );
}
