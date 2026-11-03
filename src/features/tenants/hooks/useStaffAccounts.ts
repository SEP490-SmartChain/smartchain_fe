import { useCallback, useEffect, useRef, useState } from 'react';

import { staffAccountApi } from '../api/staffAccountApi';

import type {
  StaffAccount,
  StaffAccountFilters,
  StaffAccountStatus,
} from '../types/staffAccount.types';

export function useStaffAccounts(filters: StaffAccountFilters) {
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const requestRevision = useRef(0);

  const loadPage = useCallback(
    async (cursor?: string, shouldAppend = false) => {
      const revision = ++requestRevision.current;
      if (shouldAppend) setIsLoadingMore(true);
      else setIsLoading(true);
      setError(null);
      try {
        const page = await staffAccountApi.list(filters, cursor);
        if (revision !== requestRevision.current) return;
        setAccounts((current) => (shouldAppend ? [...current, ...page.items] : page.items));
        setNextCursor(page.pagination.nextCursor);
      } catch (failure) {
        if (revision === requestRevision.current) {
          setError(failure instanceof Error ? failure : new Error(String(failure)));
        }
      } finally {
        if (revision === requestRevision.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [filters],
  );

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const changeStatus = useCallback(
    async (userId: string, status: StaffAccountStatus): Promise<boolean> => {
      setUpdatingUserId(userId);
      try {
        const changed = await staffAccountApi.changeStatus(userId, status);
        setAccounts((current) =>
          current.map((account) => (account.userId === changed.userId ? changed : account)),
        );
        return true;
      } catch {
        return false;
      } finally {
        setUpdatingUserId(null);
      }
    },
    [],
  );

  return {
    accounts,
    error,
    isLoading,
    isLoadingMore,
    updatingUserId,
    hasNextPage: nextCursor !== null,
    refetch: () => loadPage(),
    loadMore: () => loadPage(nextCursor ?? undefined, true),
    changeStatus,
  };
}
