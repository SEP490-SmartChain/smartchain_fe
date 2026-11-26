import { useEffect, useState } from 'react';

import { createPortal } from 'react-dom';

import { QrCode } from 'lucide-react';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';

import { Alert, Button } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';

interface AsnLabelsProps {
  readonly asnCode: string;
  readonly cartonCount: number;
}

interface QrResult {
  readonly code: string;
  readonly src: string | null;
}

const PRINT_STYLES = `
  #orca-asn-print { display: none; }
  @media print {
    @page { size: A4 portrait; margin: 10mm; }
    body > * { display: none !important; }
    body > #orca-asn-print { display: block !important; }
    #orca-asn-print figure {
      width: 80mm;
      margin: 0;
      padding: 4mm;
      border: 1px solid black;
      background: white;
      color: black;
      text-align: center;
      overflow-wrap: anywhere;
      break-inside: avoid;
    }
    #orca-asn-print img { display: block; width: 42mm; height: 42mm; margin: 2mm auto; }
  }
`;

export function AsnLabels({ asnCode, cartonCount }: AsnLabelsProps) {
  const t = useTranslations('Asns');
  const [preview, setPreview] = useState(false);
  const [result, setResult] = useState<QrResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const currentResult = result?.code === asnCode ? result : null;
  const qrSrc = currentResult?.src;
  const cartonSummary = t('declaredCartons', { count: cartonCount });

  useEffect(() => {
    if (!preview) return;

    let active = true;
    void QRCode.toDataURL(asnCode, { scale: 6, margin: 4, errorCorrectionLevel: 'M' })
      .then(async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        if (active) setResult({ code: asnCode, src });
      })
      .catch(() => {
        if (active) setResult({ code: asnCode, src: null });
      });

    return () => {
      active = false;
    };
  }, [preview, asnCode, attempt]);

  function closePreview() {
    setPreview(false);
    setResult(null);
  }

  function retryQr() {
    setResult(null);
    setAttempt((value) => value + 1);
  }

  const qrImage = qrSrc && (
    <img
      src={qrSrc}
      alt={t('asnQrAlt', { code: asnCode })}
      width={168}
      height={168}
      className="bg-white [image-rendering:pixelated]"
    />
  );

  return (
    <>
      <Button variant="outline" onClick={() => setPreview(true)}>
        <QrCode size={16} aria-hidden="true" />
        {t('viewAsnQr')}
      </Button>
      {preview && (
        <Modal isOpen onClose={closePreview} title={t('asnQrTitle')} width="420px">
          <div className="space-y-4">
            <figure className="flex flex-col items-center gap-2 text-center">
              <figcaption className="break-all font-mono text-sm font-medium">{asnCode}</figcaption>
              {qrImage}
              <p className="text-sm text-[var(--sc-text-secondary)]">{cartonSummary}</p>
            </figure>
            {!currentResult && (
              <p role="status" className="text-center text-sm text-[var(--sc-text-secondary)]">
                {t('asnQrLoading')}
              </p>
            )}
            {currentResult && !qrSrc && (
              <Alert variant="error" compact>
                <p>{t('asnQrError')}</p>
                <Button variant="outline" size="sm" onClick={retryQr}>
                  {t('retry')}
                </Button>
              </Alert>
            )}
            <div className="flex justify-end">
              <Button disabled={!qrSrc} onClick={() => window.print()}>
                {t('print')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {preview &&
        qrImage &&
        createPortal(
          <div id="orca-asn-print">
            <figure>
              <figcaption>{t('asnQrTitle')}</figcaption>
              <p>{asnCode}</p>
              {qrImage}
              <p>{cartonSummary}</p>
            </figure>
            <style>{PRINT_STYLES}</style>
          </div>,
          document.body,
        )}
    </>
  );
}
