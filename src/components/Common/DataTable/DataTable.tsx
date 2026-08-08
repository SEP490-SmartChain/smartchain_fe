import React from 'react';

import { useTranslations } from 'next-intl';

import Pagination from '@/components/common/Pagination/Pagination';

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
            <tr>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className="px-4 py-5 text-xs font-medium text-gray-500 border-y border-gray-200 whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="p-12 text-center text-gray-500 italic text-sm"
                >
                  {t('loading_data')}
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="p-12 text-center text-gray-500 italic text-sm"
                >
                  {t('no_data')}
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => (
                <tr
                  /* eslint-disable-next-line react/no-array-index-key */
                  key={rowIndex}
                  className="border-b border-gray-200 transition-colors duration-200 hover:bg-gray-50"
                >
                  {columns.map((col) => (
                    <td
                      key={String(col.key)}
                      className="px-4 py-4 text-[13px] text-gray-600 align-middle"
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
