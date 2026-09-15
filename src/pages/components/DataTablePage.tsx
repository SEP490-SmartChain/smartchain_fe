import { useState } from 'react';

import { Eye, Plus, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Avatar, Badge, Button, Card, CardHeader, Input } from '@/components/Common';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';

import ComponentPageShell from './ComponentPageShell';

interface DemoOrder {
  id: string;
  customer: string;
  channel: string;
  total: number;
  status: 'paid' | 'pending' | 'review';
}

const orders: DemoOrder[] = [
  {
    id: 'SC-1048',
    customer: 'An Phát Retail',
    channel: 'Website',
    total: 12450000,
    status: 'paid',
  },
  {
    id: 'SC-1047',
    customer: 'Minh Long Store',
    channel: 'Marketplace',
    total: 8920000,
    status: 'pending',
  },
  {
    id: 'SC-1046',
    customer: 'Northwind Việt Nam',
    channel: 'B2B',
    total: 24180000,
    status: 'review',
  },
  { id: 'SC-1045', customer: 'Lotus Home', channel: 'Website', total: 6750000, status: 'paid' },
  {
    id: 'SC-1044',
    customer: 'Hải Đăng Mart',
    channel: 'Marketplace',
    total: 15340000,
    status: 'paid',
  },
  { id: 'SC-1043', customer: 'Nova Commerce', channel: 'B2B', total: 32800000, status: 'pending' },
  {
    id: 'SC-1042',
    customer: 'Sông Hàn Shop',
    channel: 'Website',
    total: 4590000,
    status: 'review',
  },
  { id: 'SC-1041', customer: 'Green Box', channel: 'Marketplace', total: 9710000, status: 'paid' },
];

const badgeStatus = {
  paid: 'success',
  pending: 'warning',
  review: 'info',
} as const;

export default function DataTablePage() {
  const t = useTranslations('Components');
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 4;
  const filteredOrders = orders.filter((order) =>
    `${order.id} ${order.customer}`
      .toLocaleLowerCase(locale)
      .includes(query.toLocaleLowerCase(locale)),
  );
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const visibleOrders = filteredOrders.slice((page - 1) * pageSize, page * pageSize);

  const columns: ColumnDef<DemoOrder>[] = [
    {
      key: 'id',
      label: t('order'),
      render: (order) => <span className="font-medium">{order.id}</span>,
    },
    {
      key: 'customer',
      label: t('customer'),
      render: (order) => (
        <span className="flex min-w-48 items-center gap-3">
          <Avatar fallback={order.customer} size="md" />
          <span className="font-medium">{order.customer}</span>
        </span>
      ),
    },
    { key: 'channel', label: t('channel') },
    {
      key: 'total',
      label: t('total'),
      render: (order) =>
        new Intl.NumberFormat(locale, { style: 'currency', currency: 'VND' }).format(order.total),
    },
    {
      key: 'status',
      label: t('status'),
      render: (order) => (
        <Badge status={badgeStatus[order.status]} label={t(order.status)} variant="solid" />
      ),
    },
    {
      key: 'actions',
      label: t('actions'),
      render: (order) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => toast.info(`${t('view')} ${order.id}`)}
        >
          <Eye size={15} />
          {t('view')}
        </Button>
      ),
    },
  ];

  return (
    <ComponentPageShell title={t('managedOrders')}>
      <Card padding="none" className="overflow-hidden">
        <div className="p-4 sm:p-6">
          <CardHeader
            title={t('managedOrders')}
            description={t('managedOrdersDescription')}
            action={
              <Button type="button" size="sm" onClick={() => toast.success(t('createOrder'))}>
                <Plus size={15} />
                {t('createOrder')}
              </Button>
            }
          />
          <Input
            type="search"
            aria-label={t('searchOrders')}
            placeholder={t('searchOrders')}
            leftIcon={<Search size={17} />}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            className="max-w-md"
          />
        </div>
        <DataTable
          ariaLabel={t('managedOrders')}
          columns={columns}
          data={visibleOrders}
          getRowKey={(order) => order.id}
          pagination={{ currentPage: page, totalPages, onPageChange: setPage }}
        />
      </Card>
    </ComponentPageShell>
  );
}
