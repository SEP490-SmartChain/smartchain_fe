import { useEffect, useRef, useState } from 'react';

import { useLocation } from 'react-router-dom';

import { BookOpen, CalendarDays, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';
import { SearchableSelect } from '@/components/Common/Select/SearchableSelect';
import { Select } from '@/components/Common/Select/Select';
import { useAccess } from '@/hooks/useAccess';
import { notificationTarget } from '@/lib/notificationTarget';
import { useAuthStore } from '@/stores/authStore';
import { useLocaleStore } from '@/stores/localeStore';

import { CloseoutSettlement } from './CloseoutSettlement';
import { PayoutStatementDetail } from './PayoutStatementDetail';
import { commercialApi } from '../api/commercialApi';
import { payoutApi } from '../api/payoutApi';

import type { LedgerEntry, PayoutStatement, PayoutSummary } from '../schemas/payoutSchema';

function SellerMoney({ tenantId, initialId }: { tenantId?: string; initialId: string | null }) {
  const t = useTranslations('Payouts');
  const locale = useLocaleStore((s) => s.locale);
  const [summary, setSummary] = useState<PayoutSummary | null>(null),
    [statements, setStatements] = useState<PayoutStatement[]>([]),
    [ledger, setLedger] = useState<LedgerEntry[]>([]),
    [statementCursor, setStatementCursor] = useState<string | null>(null),
    [ledgerCursor, setLedgerCursor] = useState<string | null>(null),
    [tab, setTab] = useState<'statements' | 'ledger'>('statements'),
    [accountKind, setAccountKind] = useState<'OPERATING' | 'DEPOSIT'>('OPERATING'),
    [selected, setSelected] = useState<string | null>(initialId),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [moreLoading, setMoreLoading] = useState(false),
    [revision, setRevision] = useState(0);
  const request = useRef<AbortController | null>(null),
    moreBusy = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    request.current = abort;
    setLoading(true);
    setError(null);
    void Promise.all([
      payoutApi.summary(tenantId, abort.signal),
      payoutApi.list({ tenantId }, abort.signal),
      payoutApi.ledger({ tenantId, accountKind }, abort.signal),
    ])
      .then(([totals, page, entries]) => {
        if (!abort.signal.aborted) {
          setSummary(totals);
          setStatements(page.items);
          setStatementCursor(page.pagination.nextCursor);
          setLedger(entries.items);
          setLedgerCursor(entries.pagination.nextCursor);
        }
      })
      .catch((failure) => {
        if (!abort.signal.aborted) {
          setError(failure instanceof Error ? failure.message : t('loadError'));
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [tenantId, accountKind, revision, t]);
  const money = (value: string) =>
    `${BigInt(value).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')} VND`;
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      dateStyle: 'medium',
    }).format(new Date(value));
  const more = async () => {
    const current = request.current;
    if (!current || moreBusy.current) return;
    moreBusy.current = true;
    setMoreLoading(true);
    setError(null);
    try {
      if (tab === 'statements' && statementCursor) {
        const page = await payoutApi.list({ tenantId, cursor: statementCursor }, current.signal);
        if (!current.signal.aborted) {
          setStatements((old) => [...old, ...page.items]);
          setStatementCursor(page.pagination.nextCursor);
        }
      } else if (tab === 'ledger' && ledgerCursor) {
        const page = await payoutApi.ledger(
          { tenantId, accountKind, cursor: ledgerCursor },
          current.signal,
        );
        if (!current.signal.aborted) {
          setLedger((old) => [...old, ...page.items]);
          setLedgerCursor(page.pagination.nextCursor);
        }
      }
    } catch (failure) {
      if (!current.signal.aborted) {
        setError(failure instanceof Error ? failure.message : t('loadError'));
      }
    } finally {
      moreBusy.current = false;
      if (!current.signal.aborted) setMoreLoading(false);
    }
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('readOnlyMoney')}</p>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={16} aria-hidden />
          {t('refresh')}
        </Button>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {loading ? (
        <Card>
          <p role="status">{t('loading')}</p>
        </Card>
      ) : (
        summary && (
          <>
            {summary.isDebtBlocked && (
              <Alert variant="warning" title={t('debtBlocked')}>
                <p>{t('debtHelp')}</p>
                <p className="mt-2">
                  {t('debt')}: {money(summary.debtVnd)} · {t('creditLimit')}:{' '}
                  {money(summary.creditLimitVnd)} · {t('dueDays', { days: summary.debtDueDays })}
                </p>
              </Alert>
            )}
            {!summary.isDebtBlocked && summary.debtVnd !== '0' && (
              <Alert variant="info" title={t('debtWithinLimit')}>
                <p>
                  {t('debt')}: {money(summary.debtVnd)} · {t('creditLimit')}:{' '}
                  {money(summary.creditLimitVnd)} · {t('dueDays', { days: summary.debtDueDays })}
                </p>
                <p className="mt-2">{t('debtWithinLimitHelp')}</p>
              </Alert>
            )}
            <CloseoutSettlement
              tenantId={tenantId}
              onChanged={() => setRevision((value) => value + 1)}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ['operating', summary.operatingBalanceVnd],
                ['deposit', summary.depositBalanceVnd],
                ['debt', summary.debtVnd],
              ].map(([label, amount]) => (
                <Card key={label} padding="md">
                  <p className="text-sm text-[var(--sc-text-secondary)]">{t(label)}</p>
                  <p className="mt-3 text-xl font-semibold tabular-nums">{money(amount)}</p>
                  <p className="mt-2 text-xs text-[var(--sc-text-secondary)]">
                    {t(`${label}Hint`)}
                  </p>
                </Card>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3" role="group" aria-label={t('view')}>
              <Button
                variant={tab === 'statements' ? 'primary' : 'outline'}
                aria-pressed={tab === 'statements'}
                onClick={() => setTab('statements')}
              >
                <CalendarDays size={17} aria-hidden />
                {t('statements')}
              </Button>
              <Button
                variant={tab === 'ledger' ? 'primary' : 'outline'}
                aria-pressed={tab === 'ledger'}
                onClick={() => setTab('ledger')}
              >
                <BookOpen size={17} aria-hidden />
                {t('ledger')}
              </Button>
            </div>
            {tab === 'statements' ? (
              <Card padding="none">
                <div className="border-b border-[var(--sc-border-default)] p-5">
                  <h2 className="text-lg font-semibold">{t('statements')}</h2>
                  <p className="mt-1 text-sm text-[var(--sc-text-secondary)]">{t('cycleHelp')}</p>
                </div>
                <div className="divide-y divide-[var(--sc-border-default)]">
                  {statements.length ? (
                    statements.map((row) => (
                      <div
                        key={row.id}
                        className="flex flex-wrap items-center justify-between gap-4 p-5"
                      >
                        <div>
                          <div className="mb-2 flex flex-wrap items-center gap-3">
                            <span className="font-semibold">
                              {date(row.periodStart)} – {date(row.periodEnd)}
                            </span>
                            <Badge
                              status={
                                row.status === 'PAID'
                                  ? 'success'
                                  : row.status === 'APPROVED'
                                    ? 'info'
                                    : 'default'
                              }
                              label={t(`status.${row.status}`)}
                            />
                          </div>
                          <p className="text-xs text-[var(--sc-text-secondary)]">
                            {t('deadline')}: {date(row.reviewDeadlineAt)} · {t('vietnamTime')}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-semibold tabular-nums">
                            {money(row.approvedAmountVnd ?? row.eligibleAmountVnd)}
                          </span>
                          <Button variant="outline" onClick={() => setSelected(row.id)}>
                            {t('detail')}
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="p-12 text-center text-sm text-[var(--sc-text-secondary)]">
                      {t('emptyStatements')}
                    </p>
                  )}
                </div>
              </Card>
            ) : (
              <div className="space-y-4">
                <Select
                  className="max-w-xs"
                  aria-label={t('account')}
                  value={accountKind}
                  options={[
                    { value: 'OPERATING', label: t('operating') },
                    { value: 'DEPOSIT', label: t('deposit') },
                  ]}
                  onChange={(event) => {
                    if (event.target.value === 'OPERATING' || event.target.value === 'DEPOSIT') {
                      setAccountKind(event.target.value);
                    }
                  }}
                />
                <Card padding="none" className="overflow-x-auto">
                  <table className="w-full text-left text-sm" aria-label={t('ledger')}>
                    <thead className="bg-[var(--sc-bg-secondary)]">
                      <tr>
                        {['postedAt', 'source', 'amount', 'reference'].map((label) => (
                          <th key={label} className="p-4">
                            {t(label)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((entry) => (
                        <tr key={entry.id} className="border-t border-[var(--sc-border-default)]">
                          <td className="whitespace-nowrap p-4">{date(entry.postedAt)}</td>
                          <td className="p-4">
                            {t.has(`entry.${entry.entryType}`)
                              ? t(`entry.${entry.entryType}`)
                              : entry.entryType}
                          </td>
                          <td className="whitespace-nowrap p-4 font-medium tabular-nums">
                            {money(entry.amountVnd)}
                          </td>
                          <td className="max-w-xs break-all p-4 text-xs text-[var(--sc-text-secondary)]">
                            <details>
                              <summary>{entry.sourceType}</summary>
                              {entry.sourceId}
                              {entry.reversesEntryId && (
                                <p>
                                  {t('reverses')}: {entry.reversesEntryId}
                                </p>
                              )}
                            </details>
                          </td>
                        </tr>
                      ))}
                      {!ledger.length && (
                        <tr>
                          <td
                            colSpan={4}
                            className="p-12 text-center text-[var(--sc-text-secondary)]"
                          >
                            {t('emptyLedger')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </Card>
              </div>
            )}
            {(tab === 'statements' ? statementCursor : ledgerCursor) && (
              <Button variant="outline" isLoading={moreLoading} onClick={() => void more()}>
                {t('more')}
              </Button>
            )}
          </>
        )
      )}
      {selected && (
        <PayoutStatementDetail
          key={selected}
          id={selected}
          tenantId={tenantId}
          onClose={() => setSelected(null)}
          onChanged={() => setRevision((value) => value + 1)}
        />
      )}
    </div>
  );
}
function FinancialSellerPicker() {
  const linkedStatement = notificationTarget(useLocation().search, 'statementId');
  const t = useTranslations('Payouts');
  const { actorScope } = useAccess();
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]),
    [selected, setSelected] = useState(''),
    [error, setError] = useState<string | null>(null),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    if (actorScope === 'PLATFORM') {
      void commercialApi
        .financialSellers(abort.signal)
        .then((rows) => {
          if (!abort.signal.aborted) {
            setSellers(rows);
            setError(null);
          }
        })
        .catch((failure) => {
          if (!abort.signal.aborted) {
            setError(failure instanceof Error ? failure.message : t('loadError'));
          }
        });
    }
    return () => abort.abort();
  }, [actorScope, retry, t]);
  return (
    <section className="space-y-6 sc-page-enter">
      <header>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--sc-primary)]">
          {t('eyebrow')}
        </p>
        <h1 className="text-2xl font-semibold sm:text-3xl">{t('title')}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--sc-text-secondary)]">
          {t('description')}
        </p>
      </header>
      {error && (
        <Alert variant="error">
          {error}
          <Button variant="ghost" onClick={() => setRetry((value) => value + 1)}>
            {t('refresh')}
          </Button>
        </Alert>
      )}
      {actorScope === 'PLATFORM' && (
        <SearchableSelect
          label={t('seller')}
          placeholder={t('chooseSeller')}
          searchPlaceholder={t('searchSeller')}
          value={selected}
          options={sellers.map((seller) => ({ value: seller.id, label: seller.name }))}
          onChange={(val) => setSelected(val)}
        />
      )}
      {actorScope === 'TENANT' || selected ? (
        <SellerMoney
          key={`${selected || 'own'}:${linkedStatement ?? ''}`}
          tenantId={selected || undefined}
          initialId={linkedStatement}
        />
      ) : (
        <Alert>{t('chooseSeller')}</Alert>
      )}
    </section>
  );
}
export function SellerPayoutWorkspace() {
  const revision = useAuthStore((s) => s.revision);
  const { can } = useAccess();
  const t = useTranslations('Payouts');
  if (!can('invoice.view')) return <Alert variant="error">{t('forbidden')}</Alert>;
  return <FinancialSellerPicker key={revision} />;
}
