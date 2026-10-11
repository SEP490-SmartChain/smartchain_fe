import { useEffect, useState } from 'react';

import { createPortal } from 'react-dom';

import { useTranslations } from 'next-intl';

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
  useEffect(() => {
    setPreview(false);
    setError(false);
  }, [principal]);
  const labels = bins.slice(0, 200).map((bin) => ({ bin, encoded: binBarcode(bin.barcode) }));
  const content = (
    <div className="bin-label-grid">
      {labels.map(({ bin, encoded }) => (
        <figure key={bin.id} className="bin-label">
          <figcaption>
            {warehouseCode} · {bin.code}
          </figcaption>
          <svg
            role="img"
            aria-label={bin.barcode}
            viewBox={`0 0 ${encoded.width} 55`}
            width={`${encoded.width * 0.2}mm`}
            height="12mm"
            style={{ maxWidth: '100%' }}
          >
            <rect width="100%" height="100%" fill="white" />
            {encoded.bars.map((bar) => (
              <rect key={bar.x} x={bar.x} width={bar.width} y={0} height={55} fill="black" />
            ))}
          </svg>
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
        <Modal isOpen onClose={() => setPreview(false)} title={t('printLabels')} width="800px">
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
            <style>{`#orca-bin-print {display:none} .bin-label-grid {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8mm} .bin-label {padding:4mm;background:white;color:black;text-align:center;break-inside:avoid} .bin-label p {font-size:9pt;margin:2mm 0} @media print {body > * {display:none !important} body > #orca-bin-print {display:block !important} @page {size:A4 landscape;margin:10mm} #orca-bin-print .bin-label-grid {grid-template-columns:1fr} }`}</style>
          </div>,
          document.body,
        )}
    </>
  );
}
