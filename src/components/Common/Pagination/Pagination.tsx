import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

const pageButton =
  'flex h-9 w-9 items-center justify-center rounded-lg border text-[13px] transition-[color,background-color,border-color,transform] duration-150';

export default function Pagination({
  currentPage,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const t = useTranslations('Common');
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--sc-border-default)] px-4 py-4">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={cn(
            pageButton,
            'border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] text-[var(--sc-text-secondary)] hover:border-[var(--sc-primary-light)] hover:bg-[var(--sc-primary-alpha-08)]',
            currentPage === 1 && 'pointer-events-none opacity-45',
          )}
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label={t('previous_page')}
        >
          <ChevronLeft size={16} />
        </button>
        {pages.map((page) => (
          <button
            type="button"
            key={page}
            className={cn(
              pageButton,
              page === currentPage
                ? 'border-[var(--sc-primary)] bg-[var(--sc-primary)] font-medium text-white'
                : 'border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] text-[var(--sc-text-secondary)] hover:border-[var(--sc-primary-light)] hover:bg-[var(--sc-primary-alpha-08)]',
            )}
            onClick={() => onPageChange(page)}
            aria-current={page === currentPage ? 'page' : undefined}
          >
            {page}
          </button>
        ))}
        <button
          type="button"
          className={cn(
            pageButton,
            'border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] text-[var(--sc-text-secondary)] hover:border-[var(--sc-primary-light)] hover:bg-[var(--sc-primary-alpha-08)]',
            currentPage === totalPages && 'pointer-events-none opacity-45',
          )}
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label={t('next_page')}
        >
          <ChevronRight size={16} />
        </button>
      </div>
      {onPageSizeChange && (
        <label className="flex items-center gap-2 text-[13px] text-[var(--sc-text-secondary)]">
          <select
            className="h-9 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-3 text-[13px] outline-none transition-colors hover:border-[var(--sc-primary-light)] focus:border-[var(--sc-primary)]"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
          {t('per_page')}
        </label>
      )}
    </div>
  );
}
