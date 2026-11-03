import { useEffect, useState } from 'react';

import { ApiError } from '@/services/apiClient';

import { ruleApi } from '../api/ruleApi';

import type { RuleKind, RuleRecord } from '../types/rule.types';

export function useRuleList(kind: RuleKind, fallback: string) {
  const [items, setItems] = useState<RuleRecord[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setItems([]);
    setError(null);
    void (async () => {
      const all: RuleRecord[] = [];
      const seen = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await ruleApi.list(kind, cursor, controller.signal);
        all.push(...page.items);
        if (all.length > 500 || new Set(all.map((r) => r.id)).size !== all.length) {
          throw new Error('Invalid collection');
        }
        cursor = page.pagination.hasNext ? (page.pagination.nextCursor ?? undefined) : undefined;
        if (cursor) {
          if (seen.has(cursor)) throw new Error('Invalid cursor');
          seen.add(cursor);
        }
      } while (cursor);
      if (active) setItems(all);
    })()
      .catch((failure) => {
        if (active) {
          setItems([]);
          setError(failure instanceof ApiError ? failure.message : fallback);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [kind, retry, fallback]);
  return { items, isLoading, error, reload: () => setRetry((n) => n + 1) };
}
