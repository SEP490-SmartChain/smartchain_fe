import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

import { createPortal } from 'react-dom';

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Filter,
  LoaderCircle,
  LockKeyhole,
  LockKeyholeOpen,
  MoreVertical,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import profileAvatar from '@/assets/images/settings/profile-avatar.png';
import { Alert } from '@/components/Common/Alert/Alert';
import { Avatar } from '@/components/Common/Avatar/Avatar';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Can } from '@/components/Common/Can/Can';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import Pagination from '@/components/Common/Pagination/Pagination';
import { Select } from '@/components/Common/Select/Select';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

import { AddStaffAccountModal } from './AddStaffAccountModal';
import { useStaffAccounts } from '../hooks/useStaffAccounts';

import type {
  StaffAccount,
  StaffAccountFilters,
  StaffAccountStatus,
  StaffRole,
} from '../types/staffAccount.types';

const INITIAL_FILTERS: StaffAccountFilters = { search: '', role: '', status: '' };
const PAGE_SIZE = 10;

type SortKey = 'profile' | 'lastSessionAt' | 'status';
type SortDirection = 'asc' | 'desc';

interface ActionMenuState {
  account: StaffAccount;
  top: number;
  left: number;
}

function relativeTime(timestamp: string | null, locale: string, fallback: string) {
  if (!timestamp) return fallback;

  const elapsedSeconds = Math.round((new Date(timestamp).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const absoluteSeconds = Math.abs(elapsedSeconds);

  if (absoluteSeconds < 60) return formatter.format(elapsedSeconds, 'second');
  if (absoluteSeconds < 3600) return formatter.format(Math.round(elapsedSeconds / 60), 'minute');
  if (absoluteSeconds < 86400) return formatter.format(Math.round(elapsedSeconds / 3600), 'hour');
  return formatter.format(Math.round(elapsedSeconds / 86400), 'day');
}

export function StaffAccountDirectory() {
  const t = useTranslations('StaffAccounts');
  const locale = useLocale();
  const currentUserId = useAuthStore((state) => state.user?.userId);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<StaffAccount | null>(null);
  const [actionMenu, setActionMenu] = useState<ActionMenuState | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('profile');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const {
    accounts,
    error,
    isLoading,
    isLoadingMore,
    updatingUserId,
    hasNextPage,
    refetch,
    loadMore,
    changeStatus,
  } = useStaffAccounts(filters);

  useEffect(() => {
    if (!actionMenu) return;
    const closeMenu = () => setActionMenu(null);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [actionMenu]);

  const roleLabel = useCallback(
    (role: StaffRole): string => {
      const labels: Record<StaffRole, string> = {
        TENANT_ADMIN: t('roleTenantAdmin'),
        DISPATCHER: t('roleDispatcher'),
        ACCOUNTANT: t('roleAccountant'),
      };
      return labels[role];
    },
    [t],
  );

  const sortedAccounts = useMemo(() => {
    const fromTimestamp = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toTimestamp = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;
    const withinDateRange = accounts.filter((account) => {
      if (!fromTimestamp && !toTimestamp) return true;
      if (!account.lastSessionAt) return false;
      const timestamp = new Date(account.lastSessionAt).getTime();
      return (
        (!fromTimestamp || timestamp >= fromTimestamp) && (!toTimestamp || timestamp <= toTimestamp)
      );
    });

    return [...withinDateRange].sort((left, right) => {
      let comparison = 0;
      if (sortKey === 'profile') comparison = left.fullName.localeCompare(right.fullName, locale);
      if (sortKey === 'status') comparison = left.status.localeCompare(right.status, locale);
      if (sortKey === 'lastSessionAt') {
        comparison = (left.lastSessionAt ?? '').localeCompare(right.lastSessionAt ?? '');
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [accounts, fromDate, locale, sortDirection, sortKey, toDate]);

  const loadedPageCount = Math.max(1, Math.ceil(sortedAccounts.length / PAGE_SIZE));
  const totalPages = loadedPageCount + (hasNextPage ? 1 : 0);
  const visibleAccounts = sortedAccounts.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const selectableAccounts = visibleAccounts.filter((account) => account.userId !== currentUserId);
  const allVisibleSelected =
    selectableAccounts.length > 0 &&
    selectableAccounts.every((account) => selectedIds.has(account.userId));
  const activeFilterCount =
    Number(Boolean(filters.role)) +
    Number(Boolean(filters.status)) +
    Number(Boolean(fromDate)) +
    Number(Boolean(toDate));

  const handleFilter = (name: keyof StaffAccountFilters, value: string) => {
    setCurrentPage(1);
    setSelectedIds(new Set());
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
    setFromDate('');
    setToDate('');
    setCurrentPage(1);
    setSelectedIds(new Set());
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        selectableAccounts.forEach((account) => next.delete(account.userId));
      } else {
        selectableAccounts.forEach((account) => next.add(account.userId));
      }
      return next;
    });
  };

  const toggleSelected = (userId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handlePageChange = async (page: number) => {
    if (page > loadedPageCount && hasNextPage) await loadMore();
    setCurrentPage(page);
    setExpandedUserId(null);
    setActionMenu(null);
  };

  const handleConfirm = async () => {
    if (!selectedAccount) return;
    const nextStatus: StaffAccountStatus =
      selectedAccount.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE';
    const wasChanged = await changeStatus(selectedAccount.userId, nextStatus);
    if (!wasChanged) return;
    toast.success(nextStatus === 'LOCKED' ? t('lockSuccess') : t('unlockSuccess'));
    setSelectedAccount(null);
  };

  const openActionMenu = (event: React.MouseEvent<HTMLButtonElement>, account: StaffAccount) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setActionMenu({
      account,
      top: bounds.bottom + 6,
      left: Math.max(8, bounds.right - 168),
    });
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="m-0 text-lg font-medium leading-6 text-[var(--sc-text-primary)]">
          {t('title')}
        </h1>
        <Can capability="iam.users.manage">
          <Button type="button" onClick={() => setAddModalOpen(true)}>
            <Plus size={17} aria-hidden="true" />
            {t('addNew')}
          </Button>
        </Can>
      </header>

      {error ? (
        <Alert variant="error" title={t('loadError')}>
          <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
            {t('retry')}
          </Button>
        </Alert>
      ) : (
        <section className="sc-surface overflow-hidden" aria-label={t('tableLabel')}>
          <div className="flex min-h-[54px] items-center border-b border-[var(--sc-border-default)] px-3 sm:px-4">
            <button
              type="button"
              aria-label={t('deleteSelected')}
              title={t('deleteSelected')}
              disabled={selectedIds.size === 0}
              onClick={() => toast.info(t('bulkDeleteUnavailable'))}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--sc-text-tertiary)] transition-[background-color,color,transform] hover:bg-[var(--sc-error-bg)] hover:text-[var(--sc-error)] active:scale-95 disabled:pointer-events-none disabled:opacity-35"
            >
              <Trash2 size={17} aria-hidden="true" />
            </button>
            <span className="mx-3 h-6 w-px bg-[var(--sc-border-default)]" />
            <label className="relative flex min-w-0 max-w-[420px] flex-1 items-center">
              <span className="sr-only">{t('searchLabel')}</span>
              <Search
                size={17}
                aria-hidden="true"
                className="pointer-events-none absolute left-1 text-[var(--sc-text-tertiary)]"
              />
              <input
                type="search"
                value={filters.search}
                placeholder={t('searchHere')}
                onChange={(event) => handleFilter('search', event.target.value)}
                className="h-10 w-full border-0 bg-transparent pl-8 pr-3 text-base leading-5 text-[var(--sc-text-primary)] outline-none placeholder:text-[var(--sc-text-tertiary)] focus-visible:shadow-none"
              />
            </label>
            <button
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((current) => !current)}
              className={cn(
                'ml-auto flex h-9 items-center gap-2 rounded-lg px-3 text-base leading-5 text-[var(--sc-text-primary)] transition-colors hover:bg-[var(--sc-primary-alpha-08)]',
                filtersOpen && 'bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary-dark)]',
              )}
            >
              <Filter size={16} aria-hidden="true" />
              {t('filter')}
              {activeFilterCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--sc-primary)] px-1.5 text-[11px] font-medium text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {filtersOpen && (
            <div className="sc-card-enter grid gap-3 border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_170px_170px_auto]">
              <Select
                aria-label={t('roleFilter')}
                value={filters.role}
                placeholder={t('allRoles')}
                isPlaceholderDisabled={false}
                options={[
                  { value: 'TENANT_ADMIN', label: t('roleTenantAdmin') },
                  { value: 'DISPATCHER', label: t('roleDispatcher') },
                  { value: 'ACCOUNTANT', label: t('roleAccountant') },
                ]}
                onChange={(event) => handleFilter('role', event.target.value)}
              />
              <Select
                aria-label={t('statusFilter')}
                value={filters.status}
                placeholder={t('allStatuses')}
                isPlaceholderDisabled={false}
                options={[
                  { value: 'ACTIVE', label: t('active') },
                  { value: 'LOCKED', label: t('locked') },
                ]}
                onChange={(event) => handleFilter('status', event.target.value)}
              />
              <Input
                type="date"
                aria-label={t('fromDate')}
                value={fromDate}
                onChange={(event) => {
                  setFromDate(event.target.value);
                  setCurrentPage(1);
                }}
              />
              <Input
                type="date"
                aria-label={t('toDate')}
                value={toDate}
                onChange={(event) => {
                  setToDate(event.target.value);
                  setCurrentPage(1);
                }}
              />
              <Button type="button" size="sm" variant="ghost" onClick={resetFilters}>
                {t('reset')}
              </Button>
            </div>
          )}

          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="bg-[var(--sc-primary-alpha-08)]">
                  <th className="w-14 border-b border-[var(--sc-border-default)] px-4 py-3">
                    <Checkbox
                      aria-label={t('selectAll')}
                      checked={allVisibleSelected}
                      disabled={selectableAccounts.length === 0}
                      onChange={toggleAllVisible}
                    />
                  </th>
                  <th className="w-12 border-b border-[var(--sc-border-default)] px-2 py-3" />
                  <th className="min-w-56 border-b border-[var(--sc-border-default)] px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('profile')}
                      className="inline-flex items-center gap-1.5 text-sm font-normal leading-[18px] text-[var(--sc-text-primary)]"
                    >
                      {t('profile')}
                      {renderSortIcon('profile')}
                    </button>
                  </th>
                  <th className="min-w-44 border-b border-[var(--sc-border-default)] px-4 py-3 text-sm font-normal leading-[18px] text-[var(--sc-text-primary)]">
                    {t('assignedRole')}
                  </th>
                  <th className="min-w-36 border-b border-[var(--sc-border-default)] px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('lastSessionAt')}
                      className="inline-flex items-center gap-1.5 text-sm font-normal leading-[18px] text-[var(--sc-text-primary)]"
                    >
                      {t('lastActivity')}
                      {renderSortIcon('lastSessionAt')}
                    </button>
                  </th>
                  <th className="min-w-28 border-b border-[var(--sc-border-default)] px-4 py-3 text-sm font-normal leading-[18px] text-[var(--sc-text-primary)]">
                    {t('date')}
                  </th>
                  <th className="min-w-24 border-b border-[var(--sc-border-default)] px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('status')}
                      className="inline-flex items-center gap-1.5 text-sm font-normal leading-[18px] text-[var(--sc-text-primary)]"
                    >
                      {t('status')}
                      {renderSortIcon('status')}
                    </button>
                  </th>
                  <th className="w-14 border-b border-[var(--sc-border-default)] px-3 py-3" />
                </tr>
              </thead>
              <tbody className="bg-[var(--sc-bg-surface)]">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="p-12 text-center text-sm text-[var(--sc-text-secondary)]"
                    >
                      <span className="inline-flex items-center gap-2">
                        <LoaderCircle size={17} className="animate-spin" />
                        {t('loading')}
                      </span>
                    </td>
                  </tr>
                ) : visibleAccounts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="p-12 text-center text-sm text-[var(--sc-text-secondary)]"
                    >
                      {t('noAccounts')}
                    </td>
                  </tr>
                ) : (
                  visibleAccounts.map((account) => {
                    const isExpanded = expandedUserId === account.userId;
                    const isSelf = account.userId === currentUserId;
                    const visibleRoles = account.roles.slice(0, 2);
                    const additionalRoles = account.roles.length - visibleRoles.length;

                    return (
                      <Fragment key={account.userId}>
                        <tr className="border-b border-[var(--sc-border-default)] transition-colors hover:bg-[var(--sc-primary-alpha-08)]">
                          <td className="px-4 py-3.5">
                            <Checkbox
                              aria-label={t('selectUser', { name: account.fullName })}
                              checked={selectedIds.has(account.userId)}
                              disabled={isSelf}
                              onChange={() => toggleSelected(account.userId)}
                            />
                          </td>
                          <td className="px-2 py-3.5">
                            <button
                              type="button"
                              aria-label={
                                isExpanded
                                  ? t('collapseUser', { name: account.fullName })
                                  : t('expandUser', { name: account.fullName })
                              }
                              aria-expanded={isExpanded}
                              onClick={() =>
                                setExpandedUserId((current) =>
                                  current === account.userId ? null : account.userId,
                                )
                              }
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--sc-text-secondary)] transition-[background-color,color,transform] hover:bg-[var(--sc-bg-secondary)] hover:text-[var(--sc-primary-dark)] active:scale-95"
                            >
                              {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                            </button>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex min-w-0 items-center gap-3">
                              <Avatar
                                src={isSelf ? profileAvatar : undefined}
                                fallback={account.fullName}
                                size="lg"
                                className="rounded-full border-[var(--sc-border-default)]"
                              />
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium leading-[18px] text-[var(--sc-text-primary)]">
                                  {account.fullName}
                                </span>
                                <span className="mt-0.5 block truncate text-xs leading-4 text-[var(--sc-text-tertiary)]">
                                  {account.email}
                                </span>
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-sm leading-[18px] text-[var(--sc-text-primary)]">
                            <span>{visibleRoles.map(roleLabel).join(', ')}</span>
                            {additionalRoles > 0 && (
                              <span className="ml-2 inline-flex rounded-full border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-2 py-0.5 text-[11px] text-[var(--sc-text-secondary)]">
                                {t('moreRoles', { count: additionalRoles })}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="block text-sm leading-[18px] text-[var(--sc-text-primary)]">
                              {account.status === 'ACTIVE' ? t('signedIn') : t('accountLocked')}
                            </span>
                            <span className="mt-0.5 block text-xs text-[var(--sc-text-tertiary)]">
                              {relativeTime(account.lastSessionAt, locale, t('never'))}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-sm leading-[18px] text-[var(--sc-text-primary)]">
                            {account.lastSessionAt
                              ? new Date(account.lastSessionAt).toLocaleDateString(locale, {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : '—'}
                          </td>
                          <td className="px-4 py-3.5">
                            <Badge
                              status={account.status === 'ACTIVE' ? 'success' : 'error'}
                              label={account.status === 'ACTIVE' ? t('active') : t('blocked')}
                              size="md"
                            />
                          </td>
                          <td className="px-3 py-3.5 text-right">
                            <button
                              type="button"
                              aria-label={t('userActions', { name: account.fullName })}
                              aria-haspopup="menu"
                              onClick={(event) => openActionMenu(event, account)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--sc-text-secondary)] transition-[background-color,color,transform] hover:bg-[var(--sc-bg-secondary)] hover:text-[var(--sc-text-primary)] active:scale-95"
                            >
                              <MoreVertical size={17} />
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]">
                            <td colSpan={8} className="px-6 py-5">
                              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1fr_1.2fr_auto] xl:items-center">
                                {[
                                  [t('emailAddress'), account.email],
                                  [t('contactNumber'), t('notProvided')],
                                  [
                                    t('assignedRole'),
                                    account.roles.map(roleLabel).join(', ') || t('notProvided'),
                                  ],
                                  [
                                    t('lastLogin'),
                                    account.lastSessionAt
                                      ? new Date(account.lastSessionAt).toLocaleString(locale)
                                      : t('never'),
                                  ],
                                ].map(([label, value]) => (
                                  <div key={label} className="min-w-0">
                                    <span className="block text-xs text-[var(--sc-text-tertiary)]">
                                      {label}
                                    </span>
                                    <span className="mt-1 block truncate text-[13px] text-[var(--sc-text-primary)]">
                                      {value}
                                    </span>
                                  </div>
                                ))}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={account.status === 'ACTIVE' ? 'danger' : 'outline'}
                                  disabled={isSelf || updatingUserId === account.userId}
                                  isLoading={updatingUserId === account.userId}
                                  title={isSelf ? t('cannotLockSelf') : undefined}
                                  onClick={() => setSelectedAccount(account)}
                                >
                                  {account.status === 'ACTIVE' ? (
                                    <LockKeyhole size={14} />
                                  ) : (
                                    <LockKeyholeOpen size={14} />
                                  )}
                                  {account.status === 'ACTIVE' ? t('lock') : t('unlock')}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="relative">
            <Pagination
              currentPage={Math.min(currentPage, totalPages)}
              totalPages={totalPages}
              onPageChange={(page) => void handlePageChange(page)}
            />
            {isLoadingMore && (
              <span className="absolute right-4 top-1/2 inline-flex -translate-y-1/2 items-center gap-2 text-xs text-[var(--sc-text-secondary)]">
                <LoaderCircle size={14} className="animate-spin" />
                {t('loading')}
              </span>
            )}
          </div>
        </section>
      )}

      {actionMenu &&
        createPortal(
          <>
            <button
              type="button"
              aria-label={t('closeActions')}
              className="fixed inset-0 z-[80] cursor-default bg-transparent"
              onClick={() => setActionMenu(null)}
            />
            <div
              role="menu"
              className="sc-popover-enter fixed z-[90] w-40 overflow-hidden rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-1.5 shadow-[var(--sc-shadow-popover)]"
              style={{ top: actionMenu.top, left: actionMenu.left }}
            >
              <button
                type="button"
                role="menuitem"
                disabled={actionMenu.account.userId === currentUserId}
                onClick={() => {
                  setSelectedAccount(actionMenu.account);
                  setActionMenu(null);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-[var(--sc-text-primary)] hover:bg-[var(--sc-bg-secondary)] disabled:pointer-events-none disabled:opacity-40"
              >
                {actionMenu.account.status === 'ACTIVE' ? (
                  <LockKeyhole size={15} />
                ) : (
                  <LockKeyholeOpen size={15} />
                )}
                {actionMenu.account.status === 'ACTIVE' ? t('lock') : t('unlock')}
              </button>
            </div>
          </>,
          document.body,
        )}

      <AddStaffAccountModal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} />

      <Modal
        isOpen={selectedAccount !== null}
        onClose={() => setSelectedAccount(null)}
        title={
          selectedAccount?.status === 'ACTIVE' ? t('confirmLockTitle') : t('confirmUnlockTitle')
        }
      >
        <p className="mt-0 text-sm leading-6 text-[var(--sc-text-secondary)]">
          {selectedAccount?.status === 'ACTIVE'
            ? t('confirmLockDescription', { name: selectedAccount?.fullName ?? '' })
            : t('confirmUnlockDescription', { name: selectedAccount?.fullName ?? '' })}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => setSelectedAccount(null)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant={selectedAccount?.status === 'ACTIVE' ? 'danger' : 'primary'}
            isLoading={updatingUserId === selectedAccount?.userId}
            onClick={() => void handleConfirm()}
          >
            {selectedAccount?.status === 'ACTIVE' ? t('confirmLock') : t('confirmUnlock')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
