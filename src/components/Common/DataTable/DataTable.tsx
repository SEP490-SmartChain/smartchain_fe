import React from 'react';

import { useTranslations } from 'next-intl';

import Pagination from '@/components/Common/Pagination/Pagination';

export interface ColumnDef<T> {
  key: Extract<keyof T, string> | string;
  label: string | React.ReactNode;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  isLoading?: boolean;
  pagination?: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  };
}

export default function DataTable<T extends object>({
  columns,
  data,
  isLoading,
  pagination,
}: DataTableProps<T>) {
  const t = useTranslations('Common');

  return (
    <div className="w-full flex flex-col">
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-[#F7F8FA]">
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className="px-4 py-4 text-xs font-semibold text-[#6A6E76] uppercase tracking-wider border-y border-[#E5E7EB] whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {isLoading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="p-12 text-center text-[#6A6E76] italic text-sm"
                >
                  {t('loading_data')}
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="p-12 text-center text-[#6A6E76] italic text-sm"
                >
                  {t('no_data')}
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => (
                <tr
                  /* eslint-disable-next-line react/no-array-index-key */
                  key={rowIndex}
                  className="border-b border-[#E5E7EB] transition-colors duration-200 hover:bg-[#FCFCFD]"
                >
                  {columns.map((col) => (
                    <td
                      key={String(col.key)}
                      className="px-4 py-4 text-[13px] text-[#1A1D21] align-middle"
                    >
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? '')}
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
