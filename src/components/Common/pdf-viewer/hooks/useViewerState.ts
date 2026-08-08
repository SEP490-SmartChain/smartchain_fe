import { useState, useCallback } from 'react';

export function useViewerState() {
  const [activePage, setActivePage] = useState(1);
  const [scale, setScale] = useState(1.0);

  const zoomOut = useCallback(() => setScale((s) => Math.max(0.5, s - 0.1)), []);
  const zoomIn = useCallback(() => setScale((s) => Math.min(2.5, s + 0.1)), []);

  const scrollToPage = useCallback((pageNum: number) => {
    setActivePage(pageNum);
    const element = document.getElementById(`viewer-page-${pageNum}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const onPageVisible = useCallback((pageNum: number) => {
    setActivePage(pageNum);
  }, []);

  const resetState = useCallback(() => {
    setActivePage(1);
    setScale(1.0);
  }, []);

  return {
    activePage,
    scale,
    zoomOut,
    zoomIn,
    scrollToPage,
    onPageVisible,
    resetState,
  };
}
