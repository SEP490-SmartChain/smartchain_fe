import { Minus, Plus, X, ChevronUp } from 'lucide-react';

interface ViewerControlsProps {
  activePage: number;
  numPages: number | null;
  scale: number;
  zoomOut: () => void;
  zoomIn: () => void;
  onClose: () => void;
  onScrollToTop: () => void;
}

export function ViewerControls({
  activePage,
  numPages,
  scale,
  zoomOut,
  zoomIn,
  onClose,
  onScrollToTop,
}: ViewerControlsProps) {
  return (
    <>
      <div className="absolute top-4 right-6 flex items-center gap-2 z-10">
        <div className="flex items-center bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <span className="px-3 text-[13px] font-semibold text-gray-700">
            {activePage}
            <span className="mx-2 text-gray-400">/</span>
            {numPages || '--'}
          </span>
          <div className="w-[1px] h-6 bg-gray-200" />
          <button
            className="p-2 bg-white border-none text-gray-600 cursor-pointer flex items-center justify-center transition-colors hover:bg-gray-50 hover:text-gray-900"
            onClick={zoomOut}
          >
            <Minus size={16} />
          </button>
          <span className="px-3 text-[13px] font-semibold text-gray-700">
            {Math.round(scale * 100)}%
          </span>
          <button
            className="p-2 bg-white border-none text-gray-600 cursor-pointer flex items-center justify-center transition-colors hover:bg-gray-50 hover:text-gray-900"
            onClick={zoomIn}
          >
            <Plus size={16} />
          </button>
        </div>
        <button
          className="w-9 h-9 bg-white border border-gray-200 rounded-lg flex items-center justify-center text-gray-500 cursor-pointer shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>

      <button
        className="absolute bottom-6 right-6 w-10 h-10 bg-white border border-gray-200 rounded-lg flex items-center justify-center text-gray-500 cursor-pointer shadow-sm z-10 transition-colors hover:bg-gray-50"
        onClick={onScrollToTop}
      >
        <ChevronUp size={18} />
      </button>
    </>
  );
}
