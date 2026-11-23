import { useEffect, useRef, useState } from 'react';

import { useLocation } from 'react-router-dom';

import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  Landmark,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
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
import {
  ledgerEntryLabelKey,
  payoutReadError,
  type LedgerEntry,
  type PayoutStatement,
  type PayoutSummary,
} from '../schemas/payoutSchema';

function SellerMoney({
  tenantId,
  initialId,
  headerActions,
}: {
  tenantId?: string;
  initialId: string | null;
  headerActions?: React.ReactNode;
}) {
  const t = useTranslations('Payouts');
  const locale = useLocaleStore((s) => s.locale);
  const [summary, setSummary] = useState<PayoutSummary | null>(null),
    [statements, setStatements] = useState<PayoutStatement[]>([]),
    [ledger, setLedger] = useState<LedgerEntry[]>([]),
    [statementCursor, setStatementCursor] = useState<string | null>(null),
    [ledgerCursor, setLedgerCursor] = useState<string | null>(null),
    [tab, setTab] = useState<'statements' | 'ledger'>('ledger'),
    [accountKind, setAccountKind] = useState<'' | 'OPERATING' | 'DEPOSIT'>(''),
    [selected, setSelected] = useState<string | null>(initialId),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [moreLoading, setMoreLoading] = useState(false),
    [revision, setRevision] = useState(0);
  const request = useRef<AbortController | null>(null),
    moreBusy = useRef(false);

  useEffect(() => {
    if (initialId) setTab('statements');
  }, [initialId]);

  useEffect(() => {
    const abort = new AbortController();
    request.current = abort;
    setLoading(true);
    setError(null);
    void Promise.all([
      payoutApi.summary(tenantId, abort.signal),
      payoutApi.list({ tenantId }, abort.signal),
      payoutApi.ledger({ tenantId, accountKind: accountKind || undefined }, abort.signal),
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
          setSummary(null);
          setStatements([]);
          setLedger([]);
          setStatementCursor(null);
          setLedgerCursor(null);
          setError(payoutReadError(failure, t('loadError')));
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [tenantId, accountKind, revision, t]);

  const money = (value: string) =>
    `${BigInt(value).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')} VND`;
  const signedMoney = (value: string) => {
    const amount = BigInt(value);
    const formatted = `${amount.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')} VND`;
    return amount > BigInt(0) ? `+${formatted}` : formatted;
  };
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
          { tenantId, accountKind: accountKind || undefined, cursor: ledgerCursor },
          current.signal,
        );
        if (!current.signal.aborted) {
          setLedger((old) => [...old, ...page.items]);
          setLedgerCursor(page.pagination.nextCursor);
        }
      }
    } catch (failure) {
      if (!current.signal.aborted) {
        setError(payoutReadError(failure, t('loadError')));
      }
    } finally {
      moreBusy.current = false;
      if (!current.signal.aborted) setMoreLoading(false);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Unified Card 1: Financial Header, 3-Column Balances & Closeout Settlement */}
      <Card
        padding="none"
        className="border border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)]"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--sc-border-default)] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary)]">
              <Landmark size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="m-0 text-base font-semibold text-[var(--sc-text-primary)] sm:text-lg">
                  {t('title')}
                </h1>
                {summary?.isDebtBlocked && <Badge status="error" label={t('debtBlocked')} />}
                {summary && !summary.isDebtBlocked && summary.debtVnd !== '0' && (
                  <Badge status="info" label={t('debtWithinLimit')} />
                )}
              </div>
              <p className="mb-0 mt-0.5 text-xs text-[var(--sc-text-secondary)]">
                {t('description')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {headerActions}
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => setRevision((value) => value + 1)}
            >
              <RefreshCw size={14} aria-hidden="true" />
              {t('refresh')}
            </Button>
          </div>
        </div>

        {error && (
          <div className="border-b border-[var(--sc-border-default)] px-5 py-3 sm:px-6">
            <Alert variant="error" compact>
              {error}
            </Alert>
          </div>
        )}

        {loading ? (
          <div className="px-5 py-6 text-sm text-[var(--sc-text-secondary)] sm:px-6">
            <p role="status" className="m-0">
              {t('loading')}
            </p>
          </div>
        ) : (
          summary && (
            <>
              {/* 3-Column Divided Financial Strip */}
              <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--sc-text-secondary)]">
                    <Wallet size={14} className="text-[var(--sc-primary)]" aria-hidden="true" />
                    <span>{t('operating')}</span>
                  </div>
                  <p
                    className={`mb-0 mt-1.5 text-xl font-bold tabular-nums ${
                      BigInt(summary.operatingBalanceVnd) < BigInt(0)
                        ? 'text-[var(--sc-error-dark)]'
                        : BigInt(summary.operatingBalanceVnd) > BigInt(0)
                          ? 'text-[var(--sc-primary)]'
                          : 'text-[var(--sc-text-primary)]'
                    }`}
                  >
                    {money(summary.operatingBalanceVnd)}
                  </p>
                  <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">
                    {t('operatingHint')}
                  </p>
                </div>

                <div className="px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--sc-text-secondary)]">
                    <ShieldCheck
                      size={14}
                      className="text-[var(--sc-primary)]"
                      aria-hidden="true"
                    />
                    <span>{t('deposit')}</span>
                  </div>
                  <p className="mb-0 mt-1.5 text-xl font-bold tabular-nums text-[var(--sc-text-primary)]">
                    {money(summary.depositBalanceVnd)}
                  </p>
                  <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">
                    {t('depositHint')}
                  </p>
                </div>

                <div className="px-5 py-4 sm:px-6">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-[var(--sc-text-secondary)]">
                    <span className="flex items-center gap-1.5">
                      <AlertCircle
                        size={14}
                        className={
                          BigInt(summary.debtVnd) > BigInt(0)
                            ? 'text-[var(--sc-warning)]'
                            : 'text-[var(--sc-text-tertiary)]'
                        }
                        aria-hidden="true"
                      />
                      <span>{t('debt')}</span>
                    </span>
                    <span className="rounded bg-[var(--sc-bg-secondary)] px-1.5 py-0.5 text-[11px] font-normal text-[var(--sc-text-secondary)]">
                      {t('creditLimit')}: {money(summary.creditLimitVnd)}
                    </span>
                  </div>
                  <p
                    className={`mb-0 mt-1.5 text-xl font-bold tabular-nums ${
                      BigInt(summary.debtVnd) > BigInt(0)
                        ? 'text-[var(--sc-warning-dark)]'
                        : 'text-[var(--sc-text-primary)]'
                    }`}
                  >
                    {money(summary.debtVnd)}
                  </p>
                  <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">
                    {summary.isDebtBlocked
                      ? t('debtHelp')
                      : `${t('debtHint')} · ${t('dueDays', { days: summary.debtDueDays })}`}
                  </p>
                </div>
              </div>

              {/* Integrated Closeout Settlement Strip */}
              <CloseoutSettlement
                tenantId={tenantId}
                onChanged={() => setRevision((value) => value + 1)}
              />
            </>
          )
        )}
      </Card>

      {/* Unified Card 2: Statements & Ledger Explorer */}
      {!loading && summary && (
        <Card
          padding="none"
          className="border border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)]"
        >
          {/* Toolbar: Segmented View Switcher + Account Filter */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sc-border-default)] px-5 py-3.5 sm:px-6">
            <div
              className="inline-flex rounded-lg bg-[var(--sc-bg-secondary)] p-1"
              role="group"
              aria-label={t('view')}
            >
              <button
                type="button"
                aria-pressed={tab === 'ledger'}
                onClick={() => setTab('ledger')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  tab === 'ledger'
                    ? 'bg-[var(--sc-bg-surface)] text-[var(--sc-primary)] shadow-xs'
                    : 'text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]'
                }`}
              >
                <BookOpen size={14} aria-hidden="true" />
                {t('ledger')}
              </button>
              <button
                type="button"
                aria-pressed={tab === 'statements'}
                onClick={() => setTab('statements')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  tab === 'statements'
                    ? 'bg-[var(--sc-bg-surface)] text-[var(--sc-primary)] shadow-xs'
                    : 'text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]'
                }`}
              >
                <CalendarDays size={14} aria-hidden="true" />
                {t('statements')}
                {statements.length > 0 && (
                  <span className="rounded-full bg-[var(--sc-primary-alpha-12)] px-1.5 py-0.2 text-[10px] font-bold text-[var(--sc-primary)]">
                    {statements.length}
                  </span>
                )}
              </button>
            </div>

            {tab === 'ledger' ? (
              <div className="w-full sm:w-64">
                <Select
                  aria-label={t('account')}
                  value={accountKind}
                  options={[
                    { value: '', label: `${t('operating')} & ${t('deposit')}` },
                    { value: 'OPERATING', label: t('operating') },
                    { value: 'DEPOSIT', label: t('deposit') },
                  ]}
                  onChange={(event) => {
                    const val = event.target.value;
                    if (val === '' || val === 'OPERATING' || val === 'DEPOSIT') {
                      setAccountKind(val);
                    }
                  }}
                />
              </div>
            ) : (
              <p className="m-0 text-xs text-[var(--sc-text-secondary)]">{t('cycleHelp')}</p>
            )}
          </div>

          {tab === 'statements' ? (
            <div className="divide-y divide-[var(--sc-border-default)]">
              {statements.length ? (
                statements.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-[var(--sc-bg-secondary)]/30 sm:px-6"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-sm font-semibold text-[var(--sc-text-primary)]">
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
                      <p className="mb-0 mt-1 text-xs text-[var(--sc-text-secondary)]">
                        {t('deadline')}: {date(row.reviewDeadlineAt)} · {t('vietnamTime')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-base font-semibold tabular-nums text-[var(--sc-text-primary)]">
                        {money(row.approvedAmountVnd ?? row.eligibleAmountVnd)}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => setSelected(row.id)}>
                        {t('detail')}
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="m-0 px-5 py-10 text-center text-sm text-[var(--sc-text-secondary)]">
                  {t('emptyStatements')}
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" aria-label={t('ledger')}>
                <thead className="border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/60 text-xs font-semibold uppercase tracking-wider text-[var(--sc-text-secondary)]">
                  <tr>
                    <th className="px-5 py-3 sm:px-6">{t('postedAt')}</th>
                    <th className="px-5 py-3 sm:px-6">{t('source')}</th>
                    <th className="px-5 py-3 text-right sm:px-6">{t('amount')}</th>
                    <th className="px-5 py-3 sm:px-6">{t('reference')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--sc-border-default)]">
                  {ledger.map((entry) => {
                    const isPositive = BigInt(entry.amountVnd) > BigInt(0);
                    return (
                      <tr
                        key={entry.id}
                        className="transition-colors hover:bg-[var(--sc-bg-secondary)]/30"
                      >
                        <td className="whitespace-nowrap px-5 py-3.5 text-xs text-[var(--sc-text-secondary)] sm:px-6">
                          {date(entry.postedAt)}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-[var(--sc-text-primary)] sm:px-6">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>
                              {t.has(ledgerEntryLabelKey(entry))
                                ? t(ledgerEntryLabelKey(entry))
                                : entry.entryType}
                            </span>
                            {entry.accountKind === 'DEPOSIT' && (
                              <Badge status="info" size="sm" label={t('deposit')} />
                            )}
                          </div>
                        </td>
                        <td
                          className={`whitespace-nowrap px-5 py-3.5 text-right font-semibold tabular-nums sm:px-6 ${
                            isPositive
                              ? 'text-[var(--sc-success-dark)]'
                              : 'text-[var(--sc-text-primary)]'
                          }`}
                        >
                          {signedMoney(entry.amountVnd)}
                        </td>
                        <td className="max-w-xs px-5 py-3.5 text-xs text-[var(--sc-text-secondary)] sm:px-6">
                          <span className="inline-flex items-center rounded-md border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/60 px-2.5 py-1 text-xs font-medium text-[var(--sc-text-secondary)]">
                            {t.has(`sourceType.${entry.sourceType}`)
                              ? t(`sourceType.${entry.sourceType}`)
                              : entry.sourceType}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {!ledger.length && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-5 py-10 text-center text-sm text-[var(--sc-text-secondary)]"
                      >
                        {t('emptyLedger')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer: Read-only caption & Load more */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/40 px-5 py-2.5 text-xs text-[var(--sc-text-secondary)] sm:px-6">
            <span>{t('readOnlyMoney')}</span>
            {(tab === 'statements' ? statementCursor : ledgerCursor) && (
              <Button
                size="sm"
                variant="outline"
                isLoading={moreLoading}
                onClick={() => void more()}
              >
                {t('more')}
              </Button>
            )}
          </div>
        </Card>
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
    [selected, setSelected] = useState(
      () => sessionStorage.getItem('orca_platform_selected_seller') || '',
    ),
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
            setSelected((prev) => {
              if (prev && rows.some((r) => r.id === prev)) return prev;
              const preferred =
                rows.find((r) => r.id === 'd9ff7a86-17fd-49ff-b3fa-bdb60afc94bb')?.id ||
                rows[0]?.id ||
                '';
              if (preferred) sessionStorage.setItem('orca_platform_selected_seller', preferred);
              return preferred;
            });
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

  const sellerSelector =
    actorScope === 'PLATFORM' ? (
      <div className="w-64">
        <SearchableSelect
          placeholder={t('chooseSeller')}
          searchPlaceholder={t('searchSeller')}
          value={selected}
          options={sellers.map((seller) => ({ value: seller.id, label: seller.name }))}
          onChange={(val) => {
            setSelected(val);
            if (val) sessionStorage.setItem('orca_platform_selected_seller', val);
          }}
        />
      </div>
    ) : null;

  return (
    <section className="space-y-3.5 sc-page-enter">
      {error && (
        <Alert variant="error">
          {error}
          <Button variant="ghost" onClick={() => setRetry((value) => value + 1)}>
            {t('refresh')}
          </Button>
        </Alert>
      )}
      {actorScope === 'TENANT' || selected ? (
        <SellerMoney
          key={`${selected || 'own'}:${linkedStatement ?? ''}`}
          tenantId={selected || undefined}
          initialId={linkedStatement}
          headerActions={sellerSelector}
        />
      ) : (
        <Card
          padding="none"
          className="border border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sc-border-default)] px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary)]">
                <Landmark size={18} aria-hidden="true" />
              </span>
              <div>
                <h1 className="m-0 text-base font-semibold text-[var(--sc-text-primary)] sm:text-lg">
                  {t('title')}
                </h1>
                <p className="mb-0 mt-0.5 text-xs text-[var(--sc-text-secondary)]">
                  {t('description')}
                </p>
              </div>
            </div>
            {sellerSelector}
          </div>
          <div className="px-5 py-8 text-center text-sm text-[var(--sc-text-secondary)] sm:px-6">
            {t('chooseSeller')}
          </div>
        </Card>
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
