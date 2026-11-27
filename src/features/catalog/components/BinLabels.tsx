import { useEffect, useState } from 'react';

import { createPortal } from 'react-dom';

import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import Modal from '@/components/Common/Modal/Modal';

import type { Bin } from '../api/warehouseLayoutApi';

export function BinLabels({
  bin,
  warehouseCode,
  zoneCode,
  onClose,
}: {
  readonly bin: Bin;
  readonly warehouseCode: string;
  readonly zoneCode: string;
  readonly onClose: () => void;
}) {
  const t = useTranslations('WarehouseLayout');
  const [error, setError] = useState(false);
  const [qr, setQr] = useState<string>();
  const binTitle = t('binQrTitle', { code: bin.code });
  const location = t('binQrLocation', { warehouse: warehouseCode, zone: zoneCode });
  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(bin.barcode, { width: 160, margin: 2, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [bin.barcode]);
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
      <Modal isOpen onClose={onClose} title={t('printLabels')} width="440px">
        <div className="space-y-4">
          {error && <Alert variant="error" title={t('printError')} />}
          <figure className="space-y-2 rounded-xl border border-[var(--sc-border-default)] p-4 text-center">
            <figcaption>
              <p className="text-lg font-semibold text-[var(--sc-text-primary)]">{binTitle}</p>
              <p className="text-sm text-[var(--sc-text-secondary)]">{location}</p>
            </figcaption>
            <div className="flex min-h-[168px] items-center justify-center">
              {qr ? (
                <img
                  src={qr}
                  alt={binTitle}
                  width={168}
                  height={168}
                  className="rounded bg-white [image-rendering:pixelated]"
                />
              ) : (
                !error && <p role="status">{t('loading')}</p>
              )}
            </div>
            <p className="break-all font-mono text-sm text-[var(--sc-text-primary)]">
              {bin.barcode}
            </p>
          </figure>
          <div className="flex justify-end">
            <Button type="button" disabled={!qr} onClick={print}>
              {t('print')}
            </Button>
          </div>
        </div>
      </Modal>
      {qr &&
        createPortal(
          <div id="orca-bin-print">
            <figure className="bin-label">
              <figcaption>{binTitle}</figcaption>
              <p>{location}</p>
              <img src={qr} alt={binTitle} width={144} height={144} />
              <p>{bin.barcode}</p>
            </figure>
            <style>{`#orca-bin-print {display:none} #orca-bin-print .bin-label {box-sizing:border-box;width:50%;margin:0;padding:4mm;background:white;color:black;text-align:center;border:1px solid #d4d4d8;break-inside:avoid} #orca-bin-print img {display:block;margin:2mm auto;image-rendering:pixelated} #orca-bin-print p {font-size:9pt;margin:2mm 0;overflow-wrap:anywhere} @media print {body > * {display:none !important} body > #orca-bin-print {display:block !important} @page {size:A4 landscape;margin:10mm} }`}</style>
          </div>,
          document.body,
        )}
    </>
  );
}
