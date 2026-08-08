import React, { useState, useMemo, useCallback } from 'react';

import { ExternalLink, Edit2, Trash2, Filter } from 'lucide-react';

import Badge from '@/components/common/Badge/Badge';
import DataTable, { type ColumnDef } from '@/components/common/DataTable/DataTable';
import DataToolbar from '@/components/common/DataToolbar/DataToolbar';
import Pagination from '@/components/common/Pagination/Pagination';
import CustomerForm from '@/features/customers/components/CustomerForm';
import { type Customer } from '@/features/customers/types/customer';

interface CustomersTableProps {
  initialData: Customer[];
}

export default function CustomersTable({ initialData }: CustomersTableProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isFormOpen, setIsFormOpen] = useState(false);
  // Optional: add local search/filter state here if not doing server-side search

  const filterLabel = (title: string) => (
    <div className="flex items-center gap-2">
      {title} <Filter size={12} className="text-gray-400" />
    </div>
  );

  const columns: ColumnDef<Customer>[] = useMemo(
    () => [
      { key: 'id', label: '#' },
      {
        key: 'name',
        label: filterLabel('Full Name'),
        render: (row) => <span className="text-gray-600 text-[13px]">{row.name}</span>,
      },
      {
        key: 'status',
        label: filterLabel('Status'),
        render: (row) => <Badge status={row.status} />,
      },
      {
        key: 'email',
        label: filterLabel('E-Mail'),
        render: (row) => <span className="text-gray-600 text-[13px]">{row.email}</span>,
      },
      {
        key: 'dob',
        label: filterLabel('Date of Birth'),
        render: (row) => <span className="text-gray-600 text-[13px]">{row.dob}</span>,
      },
      {
        key: 'actions',
        label: '',
        render: () => (
          <div className="flex items-center gap-2 justify-end">
            <button className="flex items-center justify-center w-8 h-8 bg-white border border-gray-200 rounded-md text-gray-500 cursor-pointer transition-colors hover:bg-gray-50 hover:text-gray-900">
              <ExternalLink size={14} />
            </button>
            <button className="flex items-center justify-center w-8 h-8 bg-white border border-gray-200 rounded-md text-gray-500 cursor-pointer transition-colors hover:bg-gray-50 hover:text-gray-900">
              <Edit2 size={14} />
            </button>
            <button className="flex items-center justify-center w-8 h-8 bg-white border border-gray-200 rounded-md text-gray-500 cursor-pointer transition-colors hover:bg-gray-50 hover:text-gray-900">
              <Trash2 size={14} />
            </button>
          </div>
        ),
      },
    ],
    [],
  );

  const handlePrimaryAction = useCallback(() => setIsFormOpen(true), []);
  const handleSearch = useCallback((val: string) => console.warn('Searching for:', val), []);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <DataToolbar
        primaryActionLabel="NEW CUSTOMER"
        onPrimaryAction={handlePrimaryAction}
        onSearch={handleSearch}
      />

      <DataTable columns={columns} data={initialData} />

      <Pagination
        currentPage={page}
        totalPages={Math.ceil(initialData.length / pageSize) || 1}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {isFormOpen && (
        <CustomerForm
          onClose={() => setIsFormOpen(false)}
          onSubmitSuccess={() => console.warn('Refresh table data here')}
        />
      )}
    </div>
  );
}
