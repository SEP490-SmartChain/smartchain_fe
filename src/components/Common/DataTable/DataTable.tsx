import React from 'react';

import { LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Pagination from '@/components/Common/Pagination/Pagination';

export interface ColumnDef<T> {
  key: Extract<keyof T, string> | string;
  label: string | React.ReactNode;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  ariaLabel?: string;
  columns: ColumnDef<T>[];
  data: T[];
  isLoading?: boolean;
  getRowKey?: (row: T) => React.Key;
  pagination?: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  };
}

export default function DataTable<T extends object>({
  ariaLabel,
  columns,
  data,
  isLoading,
  getRowKey,
  pagination,
}: DataTableProps<T>) {
  const t = useTranslations('Common');

  return (
    <div className="flex w-full flex-col">
      <div className="w-full overflow-x-auto">
        <table aria-label={ariaLabel} className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-[var(--sc-bg-secondary)]">
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  className="border-b border-[var(--sc-border-default)] px-4 py-3 text-xs font-medium text-[var(--sc-text-secondary)] whitespace-nowrap"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-[var(--sc-bg-surface)]">
            {isLoading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="p-12 text-center text-sm text-[var(--sc-text-secondary)]"
                >
                  <span className="inline-flex items-center gap-2">
                    <LoaderCircle aria-hidden="true" size={17} className="animate-spin" />
                    {t('loading_data')}
                  </span>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="p-12 text-center text-sm text-[var(--sc-text-secondary)]"
                >
                  {t('no_data')}
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => (
                <tr
                  key={getRowKey ? getRowKey(row) : rowIndex}
                  className="border-b border-[var(--sc-border-default)] transition-colors duration-150 last:border-b-0 hover:bg-[var(--sc-primary-alpha-08)]"
                >
                  {columns.map((column) => (
                    <td
                      key={String(column.key)}
                      className="px-4 py-3.5 text-[13px] text-[var(--sc-text-primary)] align-middle"
                    >
                      {column.render
                        ? column.render(row)
                        : String((row as Record<string, unknown>)[column.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && (
        <Pagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          onPageChange={pagination.onPageChange}
        />
      )}
    </div>
  );
}
