import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

import { createPortal } from 'react-dom';

import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Filter,
  Info,
  LoaderCircle,
  LockKeyhole,
  LockKeyholeOpen,
  Mail,
  MoreVertical,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  User,
  UserCheck,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert } from '@/components/Common/Alert/Alert';
import { Avatar } from '@/components/Common/Avatar/Avatar';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Can } from '@/components/Common/Can/Can';
import { Card } from '@/components/Common/Card/Card';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { PageHeader } from '@/components/Common/PageHeader/PageHeader';
import Pagination from '@/components/Common/Pagination/Pagination';
import { Select } from '@/components/Common/Select/Select';
import { useAvatarUrl } from '@/hooks/useAvatarUrl';
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

function StaffAvatar({ account }: { account: StaffAccount }) {
  const avatarUrl = useAvatarUrl(account.avatarUrl);

  return (
    <Avatar
      src={avatarUrl}
      fallback={account.fullName}
      size="md"
      className="rounded-full border border-[var(--sc-border-default)] shadow-xs"
    />
  );
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
  const authRevision = useAuthStore((state) => state.revision);
  const currentUserId = useAuthStore((state) => state.user?.userId);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
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
        SELLER_OWNER: t('roleSellerOwner'),
        SELLER_STAFF: t('roleSellerStaff'),
      };
      return labels[role] ?? role;
    },
    [t],
  );

  const summaryStats = useMemo(() => {
    const total = accounts.length;
    const active = accounts.filter((a) => a.status === 'ACTIVE').length;
    const pending = accounts.filter((a) => a.status === 'PENDING').length;
    const locked = accounts.filter((a) => a.status === 'LOCKED').length;
    return { total, active, pending, locked };
  }, [accounts]);

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
  const activeFilterCount =
    Number(Boolean(filters.role)) +
    Number(Boolean(filters.status)) +
    Number(Boolean(fromDate)) +
    Number(Boolean(toDate));

  const handleFilter = (name: keyof StaffAccountFilters, value: string) => {
    setCurrentPage(1);
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
    setFromDate('');
    setToDate('');
    setCurrentPage(1);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
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
    return sortDirection === 'asc' ? (
      <ArrowUp size={13} className="text-[var(--sc-primary)]" />
    ) : (
      <ArrowDown size={13} className="text-[var(--sc-primary)]" />
    );
  };

  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    toast.success(t('emailCopied', { email: text }));
    setTimeout(() => setCopiedText(null), 2000);
  };

  const fromIndex = visibleAccounts.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const toIndex = Math.min(currentPage * PAGE_SIZE, sortedAccounts.length);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Can capability="iam.users.manage">
            <Button
              type="button"
              onClick={() => setAddModalOpen(true)}
              className="shadow-sm transition-transform active:scale-95"
            >
              <Plus size={16} aria-hidden="true" />
              {t('inviteTitle')}
            </Button>
          </Can>
        }
      />

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card padding="sm" className="relative overflow-hidden border-[var(--sc-border-default)]">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary-dark)]">
              <Users size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--sc-text-secondary)] truncate">
                {t('totalStaff')}
              </p>
              <p className="text-xl font-bold tracking-tight text-[var(--sc-text-primary)]">
                {summaryStats.total}
              </p>
            </div>
          </div>
        </Card>

        <Card padding="sm" className="relative overflow-hidden border-[var(--sc-border-default)]">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sc-success-bg)] text-[var(--sc-success-dark)] border border-[var(--sc-success-border)]">
              <UserCheck size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--sc-text-secondary)] truncate">
                {t('activeAccounts')}
              </p>
              <p className="text-xl font-bold tracking-tight text-[var(--sc-success-dark)]">
                {summaryStats.active}
              </p>
            </div>
          </div>
        </Card>

        <Card padding="sm" className="relative overflow-hidden border-[var(--sc-border-default)]">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sc-warning-bg)] text-[var(--sc-warning-dark)] border border-[var(--sc-warning-border)]">
              <Clock size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--sc-text-secondary)] truncate">
                {t('pending')}
              </p>
              <p className="text-xl font-bold tracking-tight text-[var(--sc-warning-dark)]">
                {summaryStats.pending}
              </p>
            </div>
          </div>
        </Card>

        <Card padding="sm" className="relative overflow-hidden border-[var(--sc-border-default)]">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sc-error-bg)] text-[var(--sc-error-dark)] border border-[var(--sc-error-border)]">
              <UserX size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--sc-text-secondary)] truncate">
                {t('lockedAccounts')}
              </p>
              <p className="text-xl font-bold tracking-tight text-[var(--sc-error-dark)]">
                {summaryStats.locked}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {error ? (
        <Alert variant="error" title={t('loadError')}>
          <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
            {t('retry')}
          </Button>
        </Alert>
      ) : (
        <section
          className="rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] shadow-[var(--sc-shadow-section)] overflow-hidden"
          aria-label={t('tableLabel')}
        >
          {/* Refined Action & Search Toolbar */}
          <div className="flex flex-col gap-3 border-b border-[var(--sc-border-default)] p-3.5 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: Search input */}
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex h-10 w-full max-w-sm items-center rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-3 text-sm transition-[border-color,box-shadow] focus-within:border-[var(--sc-primary)] focus-within:ring-2 focus-within:ring-[var(--sc-primary-alpha-08)] hover:border-[var(--sc-border-strong)]">
                <Search
                  size={16}
                  aria-hidden="true"
                  className="shrink-0 text-[var(--sc-text-tertiary)]"
                />
                <input
                  type="search"
                  value={filters.search}
                  placeholder={t('searchPlaceholder')}
                  onChange={(event) => handleFilter('search', event.target.value)}
                  className="h-full w-full border-0 bg-transparent px-2 text-sm text-[var(--sc-text-primary)] outline-none placeholder:text-[var(--sc-text-tertiary)]"
                />
                {filters.search && (
                  <button
                    type="button"
                    aria-label={t('reset')}
                    onClick={() => handleFilter('search', '')}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--sc-text-tertiary)] transition-colors hover:bg-[var(--sc-bg-secondary)] hover:text-[var(--sc-text-primary)]"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Right: Filter trigger & refresh button */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((current) => !current)}
                className={cn(
                  'flex h-10 items-center gap-2 rounded-xl border border-[var(--sc-border-default)] px-3.5 text-sm font-medium text-[var(--sc-text-primary)] transition-all hover:bg-[var(--sc-bg-secondary)] active:scale-95',
                  filtersOpen &&
                    'border-[var(--sc-primary-light)] bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary-dark)] font-semibold',
                )}
              >
                <Filter size={15} aria-hidden="true" />
                <span>{t('filter')}</span>
                {activeFilterCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--sc-primary)] px-1.5 text-[11px] font-semibold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                aria-label={t('retry')}
                title={t('retry')}
                onClick={() => void refetch()}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--sc-border-default)] text-[var(--sc-text-secondary)] transition-all hover:bg-[var(--sc-bg-secondary)] hover:text-[var(--sc-text-primary)] active:scale-95"
              >
                <RefreshCw size={15} className={cn(isLoading && 'animate-spin')} />
              </button>
            </div>
          </div>

          {/* Filter Drawer */}
          {filtersOpen && (
            <div className="border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/50 p-4 transition-all animate-in slide-in-from-top-1 duration-150">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_170px_170px_auto] items-end">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--sc-text-secondary)]">
                    {t('roleFilter')}
                  </label>
                  <Select
                    aria-label={t('roleFilter')}
                    value={filters.role}
                    placeholder={t('allRoles')}
                    isPlaceholderDisabled={false}
                    options={[
                      { value: 'SELLER_OWNER', label: t('roleSellerOwner') },
                      { value: 'SELLER_STAFF', label: t('roleSellerStaff') },
                    ]}
                    onChange={(event) => handleFilter('role', event.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--sc-text-secondary)]">
                    {t('statusFilter')}
                  </label>
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
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--sc-text-secondary)]">
                    {t('fromDate')}
                  </label>
                  <Input
                    type="date"
                    aria-label={t('fromDate')}
                    value={fromDate}
                    onChange={(event) => {
                      setFromDate(event.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--sc-text-secondary)]">
                    {t('toDate')}
                  </label>
                  <Input
                    type="date"
                    aria-label={t('toDate')}
                    value={toDate}
                    onChange={(event) => {
                      setToDate(event.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>

                <div className="flex pb-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={resetFilters}
                    className="h-10 text-xs font-medium gap-1.5 text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]"
                  >
                    <RotateCcw size={13} />
                    {t('reset')}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Polished Table */}
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[850px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/70">
                  <th className="w-10 px-3 py-3.5" />
                  <th className="min-w-60 px-4 py-3.5">
                    <button
                      type="button"
                      onClick={() => toggleSort('profile')}
                      className="group inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--sc-text-secondary)] transition-colors hover:text-[var(--sc-text-primary)]"
                    >
                      <span>{t('profile')}</span>
                      {renderSortIcon('profile')}
                    </button>
                  </th>
                  <th className="min-w-44 px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-[var(--sc-text-secondary)]">
                    {t('assignedRole')}
                  </th>
                  <th className="min-w-36 px-4 py-3.5">
                    <button
                      type="button"
                      onClick={() => toggleSort('lastSessionAt')}
                      className="group inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--sc-text-secondary)] transition-colors hover:text-[var(--sc-text-primary)]"
                    >
                      <span>{t('lastActivity')}</span>
                      {renderSortIcon('lastSessionAt')}
                    </button>
                  </th>
                  <th className="min-w-28 px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-[var(--sc-text-secondary)]">
                    {t('date')}
                  </th>
                  <th className="min-w-28 px-4 py-3.5">
                    <button
                      type="button"
                      onClick={() => toggleSort('status')}
                      className="group inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--sc-text-secondary)] transition-colors hover:text-[var(--sc-text-primary)]"
                    >
                      <span>{t('status')}</span>
                      {renderSortIcon('status')}
                    </button>
                  </th>
                  <th className="w-12 px-3 py-3.5 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sc-border-default)] bg-[var(--sc-bg-surface)]">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-16 text-center text-sm text-[var(--sc-text-secondary)]"
                    >
                      <span className="inline-flex items-center gap-2.5 font-medium">
                        <LoaderCircle size={18} className="animate-spin text-[var(--sc-primary)]" />
                        {t('loading')}
                      </span>
                    </td>
                  </tr>
                ) : visibleAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-16 text-center">
                      <div className="mx-auto flex max-w-sm flex-col items-center justify-center text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--sc-bg-secondary)] text-[var(--sc-text-tertiary)]">
                          <Users size={24} />
                        </div>
                        <h4 className="mt-3 text-base font-semibold text-[var(--sc-text-primary)]">
                          {t('noAccounts')}
                        </h4>
                        <p className="mt-1 text-xs text-[var(--sc-text-secondary)] leading-relaxed">
                          {t('noAccountsDescription')}
                        </p>
                        {activeFilterCount > 0 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={resetFilters}
                            className="mt-4 gap-1.5 text-xs"
                          >
                            <RotateCcw size={12} />
                            {t('clearFilters')}
                          </Button>
                        )}
                      </div>
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
                        <tr
                          className={cn(
                            'transition-colors duration-150 hover:bg-[var(--sc-bg-secondary)]/60',
                            isExpanded && 'bg-[var(--sc-bg-secondary)]/30',
                          )}
                        >
                          {/* Expand chevron */}
                          <td className="px-3 py-3.5 align-middle">
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
                              className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-lg text-[var(--sc-text-secondary)] transition-all hover:bg-[var(--sc-bg-secondary)] hover:text-[var(--sc-text-primary)] active:scale-95',
                                isExpanded &&
                                  'text-[var(--sc-primary)] bg-[var(--sc-primary-alpha-08)]',
                              )}
                            >
                              <ChevronRight
                                size={16}
                                className={cn(
                                  'transition-transform duration-200',
                                  isExpanded && 'rotate-90',
                                )}
                              />
                            </button>
                          </td>

                          {/* Profile: Avatar + Full Name + Email + Self Tag */}
                          <td className="px-4 py-3.5 align-middle">
                            <div className="flex min-w-0 items-center gap-3">
                              <StaffAvatar account={account} />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-sm font-semibold text-[var(--sc-text-primary)]">
                                    {account.fullName}
                                  </span>
                                  {isSelf && (
                                    <span className="inline-flex shrink-0 items-center rounded-md border border-[var(--sc-primary-light)] bg-[var(--sc-primary-lighter)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--sc-primary-dark)]">
                                      {t('currentAccount')}
                                    </span>
                                  )}
                                </div>
                                <span className="block truncate text-xs text-[var(--sc-text-secondary)]">
                                  {account.email}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Assigned Role: Semantic Pill Badges */}
                          <td className="px-4 py-3.5 align-middle">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {visibleRoles.map((role) => {
                                const isOwner = role === 'SELLER_OWNER';
                                return (
                                  <span
                                    key={role}
                                    className={cn(
                                      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border shadow-2xs',
                                      isOwner
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                                        : 'border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)]',
                                    )}
                                  >
                                    {isOwner ? (
                                      <ShieldCheck
                                        size={12}
                                        className="text-emerald-600 dark:text-emerald-400"
                                      />
                                    ) : (
                                      <User size={12} className="text-[var(--sc-text-tertiary)]" />
                                    )}
                                    <span>{roleLabel(role)}</span>
                                  </span>
                                );
                              })}
                              {additionalRoles > 0 && (
                                <span className="inline-flex rounded-full border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--sc-text-secondary)]">
                                  {t('moreRoles', { count: additionalRoles })}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Last Activity: Status Dot + Relative time */}
                          <td className="px-4 py-3.5 align-middle">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'h-2 w-2 shrink-0 rounded-full',
                                  account.status === 'ACTIVE'
                                    ? 'bg-[var(--sc-success)]'
                                    : account.status === 'PENDING'
                                      ? 'bg-[var(--sc-warning)]'
                                      : 'bg-[var(--sc-error)]',
                                )}
                              />
                              <div>
                                <span className="block text-xs font-medium text-[var(--sc-text-primary)]">
                                  {account.status === 'ACTIVE'
                                    ? t('signedIn')
                                    : account.status === 'PENDING'
                                      ? t('pending')
                                      : t('accountLocked')}
                                </span>
                                <span className="block text-[11px] text-[var(--sc-text-tertiary)]">
                                  {relativeTime(account.lastSessionAt, locale, t('never'))}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Date */}
                          <td className="px-4 py-3.5 text-xs font-medium text-[var(--sc-text-secondary)] tabular-nums align-middle">
                            {account.lastSessionAt
                              ? new Date(account.lastSessionAt).toLocaleDateString(locale, {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : '—'}
                          </td>

                          {/* Status Badge */}
                          <td className="px-4 py-3.5 align-middle">
                            <Badge
                              status={
                                account.status === 'ACTIVE'
                                  ? 'success'
                                  : account.status === 'PENDING'
                                    ? 'warning'
                                    : 'error'
                              }
                              label={
                                account.status === 'ACTIVE'
                                  ? t('active')
                                  : account.status === 'PENDING'
                                    ? t('pending')
                                    : t('blocked')
                              }
                              size="sm"
                              variant="solid"
                            />
                          </td>

                          {/* Actions button */}
                          <td className="px-3 py-3.5 text-right align-middle">
                            <button
                              type="button"
                              aria-label={t('userActions', { name: account.fullName })}
                              aria-haspopup="menu"
                              onClick={(event) => openActionMenu(event, account)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--sc-text-secondary)] transition-all hover:bg-[var(--sc-bg-secondary)] hover:text-[var(--sc-text-primary)] active:scale-95"
                            >
                              <MoreVertical size={16} />
                            </button>
                          </td>
                        </tr>

                        {/* Expandable detail card */}
                        {isExpanded && (
                          <tr className="border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/25 animate-in fade-in duration-150">
                            <td colSpan={7} className="p-3 sm:p-4">
                              <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-4 sm:p-5 shadow-xs">
                                {/* Top Bar: Identity & Actions */}
                                <div className="flex flex-col gap-3 border-b border-[var(--sc-border-default)] pb-4 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="flex items-center gap-3">
                                    <StaffAvatar account={account} />
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <h4 className="text-sm font-bold text-[var(--sc-text-primary)]">
                                          {account.fullName}
                                        </h4>
                                        {isSelf && (
                                          <span className="rounded-md border border-[var(--sc-primary-light)] bg-[var(--sc-primary-lighter)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--sc-primary-dark)]">
                                            {t('currentAccount')}
                                          </span>
                                        )}
                                        <Badge
                                          status={
                                            account.status === 'ACTIVE'
                                              ? 'success'
                                              : account.status === 'PENDING'
                                                ? 'warning'
                                                : 'error'
                                          }
                                          label={
                                            account.status === 'ACTIVE'
                                              ? t('active')
                                              : account.status === 'PENDING'
                                                ? t('pending')
                                                : t('blocked')
                                          }
                                          size="sm"
                                          variant="solid"
                                        />
                                      </div>
                                      <p className="mt-0.5 text-xs text-[var(--sc-text-secondary)]">
                                        {t('accountIdentifier')}:{' '}
                                        <span className="font-mono text-[11px] text-[var(--sc-text-tertiary)]">
                                          {account.userId}
                                        </span>
                                      </p>
                                    </div>
                                  </div>

                                  {/* Direct Lock/Unlock action in header */}
                                  <div className="flex items-center gap-2 self-start sm:self-auto">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={account.status === 'ACTIVE' ? 'danger' : 'outline'}
                                      disabled={
                                        isSelf ||
                                        updatingUserId === account.userId ||
                                        account.status === 'PENDING'
                                      }
                                      isLoading={updatingUserId === account.userId}
                                      title={isSelf ? t('cannotLockSelf') : undefined}
                                      onClick={() => setSelectedAccount(account)}
                                      className="gap-1.5 text-xs font-medium"
                                    >
                                      {account.status === 'ACTIVE' ? (
                                        <LockKeyhole size={14} />
                                      ) : (
                                        <LockKeyholeOpen size={14} />
                                      )}
                                      {account.status === 'ACTIVE' ? t('lock') : t('unlock')}
                                    </Button>
                                  </div>
                                </div>

                                {/* 3 Information Tiles */}
                                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                  {/* Contact Information */}
                                  <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/40 p-3.5">
                                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--sc-text-secondary)]">
                                      <Mail size={14} className="text-[var(--sc-primary)]" />
                                      <span>{t('contactInfo')}</span>
                                    </div>
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="truncate text-xs font-semibold text-[var(--sc-text-primary)]">
                                          {account.email}
                                        </span>
                                        <button
                                          type="button"
                                          aria-label={t('copyEmail')}
                                          title={t('copyEmail')}
                                          onClick={() => handleCopy(account.email)}
                                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--sc-text-tertiary)] transition-colors hover:bg-[var(--sc-bg-secondary)] hover:text-[var(--sc-text-primary)] active:scale-95"
                                        >
                                          {copiedText === account.email ? (
                                            <Check size={12} className="text-[var(--sc-success)]" />
                                          ) : (
                                            <Copy size={12} />
                                          )}
                                        </button>
                                      </div>
                                      <div className="flex items-center gap-2 text-xs text-[var(--sc-text-secondary)]">
                                        <Phone
                                          size={13}
                                          className="shrink-0 text-[var(--sc-text-tertiary)]"
                                        />
                                        <span className="truncate">
                                          {account.phone || t('notProvided')}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Role & Scope */}
                                  <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/40 p-3.5">
                                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--sc-text-secondary)]">
                                      <ShieldCheck
                                        size={14}
                                        className="text-teal-600 dark:text-teal-400"
                                      />
                                      <span>{t('roleAndPermissions')}</span>
                                    </div>
                                    <div className="space-y-1.5">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        {account.roles.map((role) => (
                                          <span
                                            key={role}
                                            className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
                                          >
                                            {roleLabel(role)}
                                          </span>
                                        ))}
                                      </div>
                                      <p className="text-[11px] leading-relaxed text-[var(--sc-text-secondary)]">
                                        {account.roles.includes('SELLER_OWNER')
                                          ? t('ownerRoleHint')
                                          : t('staffRoleHint')}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Activity & Security */}
                                  <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/40 p-3.5">
                                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--sc-text-secondary)]">
                                      <Clock
                                        size={14}
                                        className="text-amber-600 dark:text-amber-400"
                                      />
                                      <span>{t('activityAndSecurity')}</span>
                                    </div>
                                    <div className="space-y-1.5">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={cn(
                                            'h-2 w-2 rounded-full',
                                            account.status === 'ACTIVE'
                                              ? 'bg-[var(--sc-success)]'
                                              : account.status === 'PENDING'
                                                ? 'bg-[var(--sc-warning)]'
                                                : 'bg-[var(--sc-error)]',
                                          )}
                                        />
                                        <span className="text-xs font-semibold text-[var(--sc-text-primary)]">
                                          {account.lastSessionAt
                                            ? new Date(account.lastSessionAt).toLocaleString(locale)
                                            : t('never')}
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-[var(--sc-text-tertiary)]">
                                        {account.lastSessionAt
                                          ? relativeTime(account.lastSessionAt, locale, t('never'))
                                          : t('never')}
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                {/* Security Guidance Banner */}
                                <div className="mt-3.5 flex items-center gap-2.5 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/60 px-3.5 py-2.5 text-xs text-[var(--sc-text-secondary)]">
                                  {isSelf ? (
                                    <>
                                      <ShieldAlert
                                        size={15}
                                        className="shrink-0 text-amber-600 dark:text-amber-400"
                                      />
                                      <span>{t('selfAccountHint')}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Info
                                        size={15}
                                        className="shrink-0 text-[var(--sc-primary)]"
                                      />
                                      <span>{t('staffAccountHint')}</span>
                                    </>
                                  )}
                                </div>
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

          {/* Table Footer with Record Counter & Pagination */}
          <div className="flex flex-col gap-3 border-t border-[var(--sc-border-default)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-[var(--sc-text-secondary)] font-medium">
              {t('showingResults', {
                from: fromIndex,
                to: toIndex,
                total: sortedAccounts.length,
              })}
            </span>

            <div className="relative flex items-center justify-end">
              <Pagination
                currentPage={Math.min(currentPage, totalPages)}
                totalPages={totalPages}
                onPageChange={(page) => void handlePageChange(page)}
              />
              {isLoadingMore && (
                <span className="ml-3 inline-flex items-center gap-1.5 text-xs text-[var(--sc-text-secondary)]">
                  <LoaderCircle size={14} className="animate-spin text-[var(--sc-primary)]" />
                  {t('loading')}
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Floating Action Menu Popover */}
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
              className="sc-popover-enter fixed z-[90] w-44 overflow-hidden rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-1.5 shadow-[var(--sc-shadow-popover)]"
              style={{ top: actionMenu.top, left: actionMenu.left }}
            >
              <button
                type="button"
                role="menuitem"
                disabled={
                  actionMenu.account.userId === currentUserId ||
                  actionMenu.account.status === 'PENDING'
                }
                onClick={() => {
                  setSelectedAccount(actionMenu.account);
                  setActionMenu(null);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--sc-text-primary)] hover:bg-[var(--sc-bg-secondary)] disabled:pointer-events-none disabled:opacity-40 transition-colors"
              >
                {actionMenu.account.status === 'ACTIVE' ? (
                  <LockKeyhole size={14} className="text-[var(--sc-error)]" />
                ) : (
                  <LockKeyholeOpen size={14} className="text-[var(--sc-success)]" />
                )}
                <span>{actionMenu.account.status === 'ACTIVE' ? t('lock') : t('unlock')}</span>
              </button>
            </div>
          </>,
          document.body,
        )}

      {/* Modal: Invite staff account */}
      <Can capability="iam.users.manage">
        {addModalOpen && (
          <AddStaffAccountModal
            key={authRevision}
            isOpen={addModalOpen}
            onClose={() => setAddModalOpen(false)}
            onSuccess={() => {
              setCurrentPage(1);
              void refetch();
            }}
          />
        )}
      </Can>

      {/* Modal: Confirm Lock / Unlock */}
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
