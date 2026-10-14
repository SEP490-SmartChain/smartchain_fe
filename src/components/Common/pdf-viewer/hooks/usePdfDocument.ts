import { useState, useEffect } from 'react';

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import type { PDFDocumentProxy, PDFDocumentLoadingTask } from 'pdfjs-dist';

// Setup PDF worker
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export function usePdfDocument(fileUrl: string | undefined, isOpen: boolean) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!isOpen || !fileUrl) {
      setPdfDoc(null);
      setNumPages(null);
      return;
    }

    let isMounted = true;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    const loadPdf = async () => {
      setIsLoading(true);
      setError(null);
      try {
        loadingTask = pdfjsLib.getDocument(fileUrl);
        const pdf = await loadingTask.promise;
        if (isMounted) {
          setPdfDoc(pdf);
          setNumPages(pdf.numPages);
        }
      } catch {
        if (isMounted) {
          // PDF errors can contain a private signed URL; expose only a stable local error.
          setError(new Error('PDF.LOAD_FAILED'));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadPdf();

    return () => {
      isMounted = false;
      if (loadingTask && typeof loadingTask.destroy === 'function') {
        try {
          loadingTask.destroy();
        } catch (e) {
          console.error('Error destroying loading task', e);
        }
      }
    };
  }, [fileUrl, isOpen]);

  return { pdfDoc, numPages, isLoading, error };
}
