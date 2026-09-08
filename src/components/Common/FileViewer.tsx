import { useEffect, useState } from 'react';

import { createPortal } from 'react-dom';

import { FileText, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { PdfPage } from '@/components/Common/pdf-viewer/components/PdfPage';
import { PdfThumbnail } from '@/components/Common/pdf-viewer/components/PdfThumbnail';
import { ViewerControls } from '@/components/Common/pdf-viewer/components/ViewerControls';
import { usePdfDocument } from '@/components/Common/pdf-viewer/hooks/usePdfDocument';
import { useViewerState } from '@/components/Common/pdf-viewer/hooks/useViewerState';

interface FileViewerProps {
  isOpen: boolean;
  onClose: () => void;
  fileName?: string;
}

export function FileViewer({
  isOpen,
  onClose,
  fileName = 'Bao-gia-NCC-Vat-tu-T01.pdf',
}: FileViewerProps) {
  const t = useTranslations('Common');
  const [mounted, setMounted] = useState(false);
  const fileUrl = fileName === 'Bao-gia-NCC-Vat-tu-T01.pdf' ? '/sample.pdf' : fileName;

  const { pdfDoc, numPages, isLoading, error } = usePdfDocument(fileUrl, isOpen);

  const { activePage, scale, zoomOut, zoomIn, scrollToPage, onPageVisible, resetState } =
    useViewerState();

  useEffect(() => {
    setMounted(true);
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
      resetState();
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, resetState]);

  // Sync thumbnail sidebar scroll with active page
  useEffect(() => {
    if (!isOpen) return;
    const thumbEl = document.getElementById(`thumb-page-${activePage}`);
    const thumbList = document.getElementById('thumbnail-list-container');

    if (thumbEl && thumbList) {
      const thumbRect = thumbEl.getBoundingClientRect();
      const listRect = thumbList.getBoundingClientRect();

      if (thumbRect.top < listRect.top || thumbRect.bottom > listRect.bottom) {
        thumbEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activePage, isOpen]);

  if (!isOpen || !mounted) return null;

  const handleScrollToTop = () => {
    document.getElementById('main-viewer-area')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const modalContent = (
    <div className="fixed inset-0 bg-gray-900/60 z-[100] flex items-center justify-center p-6 backdrop-blur-[2px]">
      <div className="bg-white rounded-xl w-full max-w-[80rem] h-[90vh] flex flex-col overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] animate-[slideUp_0.3s_ease-out_forwards]">
        <div className="flex-1 flex min-h-0">
          {/* Left Sidebar */}
          <div className="w-[250px] bg-slate-50 border-r border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-2 border border-gray-300 rounded-lg py-2 px-3">
                <FileText size={16} className="text-gray-400" />
                <input
                  type="text"
                  placeholder={t('digital_sign')}
                  defaultValue={t('digital_sign')}
                  className="border-none bg-transparent outline-none text-sm w-full"
                />
              </div>
            </div>

            <div
              id="thumbnail-list-container"
              className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 items-center"
            >
              {numPages &&
                Array.from(new Array(numPages), (_, index) => (
                  <PdfThumbnail
                    key={`thumb_${index + 1}`}
                    pdfDoc={pdfDoc}
                    pageNumber={index + 1}
                    isActive={activePage === index + 1}
                    onClick={() => scrollToPage(index + 1)}
                  />
                ))}
              {isLoading && (
                <div className="p-4 text-gray-400 text-sm text-center">{t('loading_file')}</div>
              )}
              {error && (
                <div className="p-4 text-red-500 text-sm text-center">{t('error_loading_pdf')}</div>
              )}
            </div>
          </div>

          {/* Main Viewer Wrapper */}
          <div className="flex-1 relative flex flex-col min-w-0 bg-[#E2E8F0]">
            <ViewerControls
              activePage={activePage}
              numPages={numPages}
              scale={scale}
              zoomIn={zoomIn}
              zoomOut={zoomOut}
              onClose={onClose}
              onScrollToTop={handleScrollToTop}
            />

            {/* Main Scrolling View Area */}
            <div
              id="main-viewer-area"
              className="flex-1 relative overflow-y-auto flex justify-center py-8 px-4 bg-transparent"
            >
              <div className="bg-transparent w-full max-w-[800px] min-h-[1000px] shadow-none p-0 relative">
                <div className="flex flex-col items-center">
                  {isLoading && (
                    <div className="p-16 text-center text-gray-500 absolute inset-0 flex items-center justify-center">
                      {t('processing_pdf')}
                    </div>
                  )}

                  {pdfDoc &&
                    numPages &&
                    Array.from(new Array(numPages), (_, index) => (
                      <PdfPage
                        key={`mainpage_${index + 1}`}
                        pdfDoc={pdfDoc}
                        pageNumber={index + 1}
                        scale={scale}
                        showSignatureBox={index === Math.min(numPages - 1, 6)} // show placeholder on page 7 or last page
                        onVisible={onPageVisible}
                      />
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="py-4 px-6 bg-white border-t border-gray-200 flex items-center justify-end">
          <button
            className="inline-flex items-center gap-2 py-2 px-4 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 cursor-pointer transition-colors hover:bg-gray-50"
            onClick={onClose}
          >
            <X size={16} />
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
