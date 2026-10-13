import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import Modal from '@/components/Common/Modal/Modal';
import { PdfPage } from '@/components/Common/pdf-viewer/components/PdfPage';
import { usePdfDocument } from '@/components/Common/pdf-viewer/hooks/usePdfDocument';

interface CommercialPdfPreviewProps {
  url: string;
  onClose: () => void;
  title?: string;
  hint?: string;
}

export function CommercialPdfPreview({ url, onClose, title, hint }: CommercialPdfPreviewProps) {
  const t = useTranslations('Commercial');
  const [page, setPage] = useState(1);
  const { pdfDoc, numPages, isLoading, error } = usePdfDocument(url, true);

  return (
    <Modal isOpen onClose={onClose} title={title ?? t('pdfTitle')} width="900px">
      {hint && <p className="mb-4 text-sm text-[var(--sc-text-secondary)]">{hint}</p>}
      {isLoading && <p role="status">{t('pdfLoading')}</p>}
      {error && <Alert variant="error">{t('pdfError')}</Alert>}
      {pdfDoc && numPages && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              {t('pdfPrevious')}
            </Button>
            <p role="status">{t('pdfPage', { page, total: numPages })}</p>
            <Button
              variant="outline"
              size="sm"
              disabled={page === numPages}
              onClick={() => setPage((value) => value + 1)}
            >
              {t('pdfNext')}
            </Button>
          </div>
          <div className="overflow-auto rounded-lg bg-[var(--sc-bg-secondary)] p-3">
            <PdfPage
              key={page}
              pdfDoc={pdfDoc}
              pageNumber={page}
              scale={1}
              onVisible={() => undefined}
            />
          </div>
        </>
      )}
    </Modal>
  );
}
