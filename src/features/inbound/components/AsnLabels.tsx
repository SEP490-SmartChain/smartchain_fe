import { useState } from 'react';

import { createPortal } from 'react-dom';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { encodeCode128 } from '@/features/catalog';

import type { Asn } from '../types/asn.types';

export function AsnLabels({ asn }: { readonly asn: Asn }) {
  const t = useTranslations('Asns');
  const [preview, setPreview] = useState(false);
  const labels = asn.cartonLabelRefs.map((reference) => ({
    reference,
    encoded: encodeCode128(reference),
  }));
  const content = (
    <div className="asn-label-grid">
      {labels.map(({ reference, encoded }, index) => (
        <figure key={reference} className="asn-label">
          <figcaption>{t('cartonNumber', { number: index + 1, total: labels.length })}</figcaption>
          <p>{asn.asnCode}</p>
          <svg
            role="img"
            aria-label={reference}
            viewBox={`0 0 ${encoded.width} 55`}
            width={`${encoded.width * 0.25}mm`}
            height="14mm"
            style={{ maxWidth: '100%' }}
          >
            <rect width="100%" height="100%" fill="white" />
            {encoded.bars.map((bar) => (
              <rect key={bar.x} x={bar.x} width={bar.width} y={0} height={55} fill="black" />
            ))}
          </svg>
          <p>{reference}</p>
        </figure>
      ))}
    </div>
  );
  return (
    <>
      <Button variant="outline" onClick={() => setPreview(true)}>
        {t('printLabels')}
      </Button>
      {preview && (
        <Modal isOpen onClose={() => setPreview(false)} title={t('printLabels')} width="850px">
          <div className="max-h-96 overflow-auto">{content}</div>
          <Button onClick={() => window.print()}>{t('print')}</Button>
        </Modal>
      )}
      {preview &&
        createPortal(
          <div id="orca-asn-print">
            {content}
            <style>{`#orca-asn-print {display:none} .asn-label-grid {display:grid;gap:8mm} .asn-label {padding:4mm;background:white;color:black;text-align:center;break-inside:avoid;border:1px solid black} .asn-label p {font-size:9pt;margin:2mm 0;overflow-wrap:anywhere} @media print {body > * {display:none !important} body > #orca-asn-print {display:block !important} @page {size:A4 landscape;margin:10mm} }`}</style>
          </div>,
          document.body,
        )}
    </>
  );
}
