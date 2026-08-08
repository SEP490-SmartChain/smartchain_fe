import React from 'react';

import { cn } from '@/lib/utils';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

const baseBtnClass =
  'flex items-center justify-center w-8 h-8 rounded-md text-[13px] cursor-pointer transition-all duration-200';
const pageBtnClass = cn(
  baseBtnClass,
  'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50',
);
const pageBtnActiveClass = cn(
  baseBtnClass,
  'bg-white border border-blue-500 text-blue-500 font-semibold',
);
const pageBtnDisabledClass = cn(
  baseBtnClass,
  'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed',
);

export default function Pagination({
  currentPage,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  // Generate basic page numbers for demo
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="flex items-center gap-6 mt-6 pt-6 border-t border-gray-200">
      <div className="flex items-center gap-1">
        <button
          className={currentPage === 1 ? pageBtnDisabledClass : pageBtnClass}
          onClick={() => currentPage > 1 && onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          &lt;
        </button>
        {pages.map((page) => (
          <button
            key={page}
            className={page === currentPage ? pageBtnActiveClass : pageBtnClass}
            onClick={() => onPageChange(page)}
          >
            {page}
          </button>
        ))}
        <button
          className={currentPage === totalPages ? pageBtnDisabledClass : pageBtnClass}
          onClick={() => currentPage < totalPages && onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          &gt;
        </button>
      </div>
      {onPageSizeChange && (
        <div className="flex items-center gap-2">
          <select
            className="py-1.5 pl-3 pr-8 border border-gray-200 rounded-md text-[13px] text-gray-600 appearance-none bg-no-repeat bg-[position:right_0.5rem_center] bg-[size:1rem] bg-[url('data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22_fill=%22none%22_viewBox=%220_0_24_24%22_stroke=%22%239ca3af%22%3E%3Cpath_stroke-linecap=%22round%22_stroke-linejoin=%22round%22_stroke-width=%222%22_d=%22M19_9l-7_7-7-7%22%3E%3C/path%3E%3C/svg%3E')]"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
          <span className="text-[13px] text-gray-500">/Page</span>
        </div>
      )}
    </div>
  );
}
