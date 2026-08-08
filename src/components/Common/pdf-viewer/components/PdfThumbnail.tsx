import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

interface PdfThumbnailProps {
  pdfDoc: PDFDocumentProxy | null;
  pageNumber: number;
  isActive: boolean;
  onClick: () => void;
}

export function PdfThumbnail({ pdfDoc, pageNumber, isActive, onClick }: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let renderTask: RenderTask | null = null;
    let isMounted = true;

    const renderPage = async () => {
      if (!pdfDoc || !canvasRef.current) return;

      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (!isMounted) return;

        const viewport = page.getViewport({ scale: 1 });
        const scale = 140 / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = scaledViewport.height;
        canvas.width = scaledViewport.width;

        renderTask = page.render({
          canvasContext: context,
          viewport: scaledViewport,
          canvas: canvas,
        });

        await renderTask.promise;
      } catch (e: unknown) {
        if (e instanceof Error && e.name !== 'RenderingCancelledException') {
          console.error(`Error rendering thumbnail page ${pageNumber}:`, e);
        }
      }
    };

    renderPage();

    return () => {
      isMounted = false;
      if (renderTask) renderTask.cancel();
    };
  }, [pdfDoc, pageNumber]);

  return (
    <div
      id={`thumb-page-${pageNumber}`}
      className="flex flex-col items-center gap-2 cursor-pointer"
      onClick={onClick}
    >
      <div
        className={cn(
          'w-[140px] h-[180px] bg-white border rounded shadow-sm flex items-center justify-center overflow-hidden transition-colors duration-200',
          isActive ? 'border-2 border-sky-500' : 'border-gray-300',
        )}
      >
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>
      <span className="text-[13px] text-gray-500 font-medium">{pageNumber}</span>
    </div>
  );
}
