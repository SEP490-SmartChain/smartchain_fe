import { useState } from 'react';

import { Download, Filter, Search, WalletCards } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Avatar, Badge, Button, Card, CardHeader, Input } from '@/components/Common';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';

interface Invoice {
  id: string;
  plan: string;
  customer: string;
  amount: number;
  date: string;
  status: 'paid' | 'scheduled';
}

const invoices: Invoice[] = [
  {
    id: 'HD20392WL5D',
    plan: 'Starter',
    customer: 'Henry Ward',
    amount: 267,
    date: '16/08/2026',
    status: 'paid',
  },
  {
    id: 'SK58293AN2K',
    plan: 'Basic',
    customer: 'Ella Bell',
    amount: 699,
    date: '25/08/2026',
    status: 'scheduled',
  },
  {
    id: 'FB20394GM1C',
    plan: 'Enterprise',
    customer: 'Benjamin Cooper',
    amount: 389,
    date: '07/09/2026',
    status: 'paid',
  },
  {
    id: 'WM29830XP6B',
    plan: 'Starter',
    customer: 'Harper Rogers',
    amount: 899,
    date: '29/08/2026',
    status: 'paid',
  },
  {
    id: 'CA10473JQ3R',
    plan: 'Basic',
    customer: 'Lucas Murphy',
    amount: 199,
    date: '27/08/2026',
    status: 'scheduled',
  },
];

export default function BillingPage() {
  const t = useTranslations('Billing');
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const filteredInvoices = invoices.filter((invoice) =>
    `${invoice.id} ${invoice.customer}`
      .toLocaleLowerCase(locale)
      .includes(query.toLocaleLowerCase(locale)),
  );
  const columns: ColumnDef<Invoice>[] = [
    {
      key: 'id',
      label: t('invoice'),
      render: (invoice) => <span className="font-medium">#{invoice.id}</span>,
    },
    { key: 'plan', label: t('plan') },
    {
      key: 'customer',
      label: t('customer'),
      render: (invoice) => (
        <span className="flex min-w-44 items-center gap-3">
          <Avatar fallback={invoice.customer} />
          <span className="font-medium">{invoice.customer}</span>
        </span>
      ),
    },
    { key: 'amount', label: t('amount'), render: (invoice) => `$${invoice.amount.toFixed(2)}` },
    { key: 'date', label: t('date') },
    {
      key: 'status',
      label: t('status'),
      render: (invoice) => (
        <Badge
          status={invoice.status === 'paid' ? 'success' : 'warning'}
          label={t(invoice.status)}
        />
      ),
    },
    {
      key: 'download',
      label: '',
      render: (invoice) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`${t('download')} ${invoice.id}`}
        >
          <Download size={16} />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="sr-only">{t('title')}</h1>
      <Card>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]">
            <WalletCards size={23} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-sm text-[var(--sc-text-secondary)]">{t('currentPlan')}</p>
            <h2 className="mb-0 mt-1 text-xl font-medium leading-6 text-[var(--sc-text-primary)]">
              {t('basic')}
            </h2>
            <p className="mb-0 mt-1 text-xs text-[var(--sc-text-tertiary)]">{t('features')}</p>
          </div>
          <div className="sm:text-right">
            <p className="m-0 text-3xl font-medium leading-9 text-[var(--sc-text-primary)]">
              $699 <span className="text-xs font-normal text-[var(--sc-text-secondary)]">USD</span>
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-2">
              {t('changePlan')}
            </Button>
          </div>
        </div>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="p-4 sm:p-6">
          <CardHeader title={t('history')} description={t('historyDescription')} />
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              type="search"
              aria-label={t('search')}
              placeholder={t('search')}
              leftIcon={<Search size={17} />}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="sm:max-w-sm"
            />
            <Button type="button" variant="secondary" onClick={() => toast.info(t('filterReady'))}>
              <Filter size={16} />
              {t('filter')}
            </Button>
          </div>
        </div>
        <DataTable
          ariaLabel={t('history')}
          columns={columns}
          data={filteredInvoices}
          getRowKey={(invoice) => invoice.id}
        />
      </Card>
    </div>
  );
}
