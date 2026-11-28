import React from 'react';

import { LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Pagination from '@/components/Common/Pagination/Pagination';

export interface ColumnDef<T> {
  key: Extract<keyof T, string> | string;
  label: string | React.ReactNode;
  render?: (row: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  headerClassName?: string;
  cellClassName?: string;
}

const ALIGN_CLASS = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

interface DataTableProps<T> {
  ariaLabel?: string;
  columns: ColumnDef<T>[];
  data: T[];
  isLoading?: boolean;
  dense?: boolean;
  getRowKey?: (row: T) => React.Key;
  getRowId?: (row: T) => string | undefined;
  getRowClassName?: (row: T) => string | undefined;
  renderRowDetails?: (row: T, columnCount: number) => React.ReactNode;
  emptyMessage?: React.ReactNode;
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
  dense = false,
  getRowKey,
  getRowId,
  getRowClassName,
  renderRowDetails,
  emptyMessage,
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
                  className={`border-b border-[var(--sc-border-default)] whitespace-nowrap text-[var(--sc-text-secondary)] ${
                    dense
                      ? 'px-2.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.03em] first:pl-4 last:pr-4'
                      : 'px-4 py-3 text-xs font-medium'
                  } ${ALIGN_CLASS[column.align ?? 'left']} ${column.headerClassName ?? ''}`}
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
                  {emptyMessage ?? t('no_data')}
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => {
                const customRowClass = getRowClassName?.(row);
                return (
                  <React.Fragment key={getRowKey ? getRowKey(row) : rowIndex}>
                    <tr
                      id={getRowId?.(row)}
                      className={`border-b border-[var(--sc-border-default)] transition-colors duration-150 last:border-b-0 ${
                        customRowClass ?? 'hover:bg-[var(--sc-primary-alpha-08)]'
                      }`}
                    >
                      {columns.map((column) => (
                        <td
                          key={String(column.key)}
                          className={`${
                            dense ? 'px-2.5 py-3 first:pl-4 last:pr-4' : 'px-4 py-3.5'
                          } text-[13px] text-[var(--sc-text-primary)] align-middle ${ALIGN_CLASS[column.align ?? 'left']} ${column.cellClassName ?? ''}`}
                        >
                          {column.render
                            ? column.render(row)
                            : String((row as Record<string, unknown>)[column.key] ?? '')}
                        </td>
                      ))}
                    </tr>
                    {renderRowDetails?.(row, columns.length)}
                  </React.Fragment>
                );
              })
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
