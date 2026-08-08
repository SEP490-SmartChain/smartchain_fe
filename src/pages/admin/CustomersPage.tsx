import React, { useState, useEffect } from 'react';

import Breadcrumb from '@/components/common/Breadcrumb';
import CustomersTable from '@/features/customers/components/CustomersTable';
import { fetchCustomersMock } from '@/features/customers/mocks/customersMock';
import { type Customer } from '@/features/customers/types/customer';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    fetchCustomersMock().then(setCustomers);
  }, []);

  return (
    <div className="py-8 px-10 bg-[#f5f6f8] min-h-[calc(100vh-4.5rem)]">
      <div className="mb-8">
        <h1 className="text-[2rem] font-semibold text-[#1a1d21] m-0 mb-2 tracking-tight">
          Customers&apos; List
        </h1>
        <Breadcrumb items={['Dashboard', "Customers' List"]} />
      </div>

      <CustomersTable initialData={customers} />
    </div>
  );
}
