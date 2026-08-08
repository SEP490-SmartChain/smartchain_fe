import { useState, useEffect } from 'react';

import * as pdfjsLib from 'pdfjs-dist';

import type { PDFDocumentProxy, PDFDocumentLoadingTask } from 'pdfjs-dist';

// Setup PDF worker
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
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
      } catch (err: unknown) {
        if (isMounted) {
          const error = err instanceof Error ? err : new Error('Failed to load PDF');
          console.error('Error loading PDF', error);
          setError(error);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadPdf();

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
