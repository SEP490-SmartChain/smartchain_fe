import { useCallback, useEffect, useRef, useState } from 'react';

import { webhookApi } from '../api/webhookApi';
import type {
  CreateWebhookPayload,
  UpdateWebhookPayload,
  WebhookEndpoint,
  WebhookTestResult,
} from '../types/webhook.types';

export function useWebhooks() {
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Per-endpoint action states
  const [testingId, setTestingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, WebhookTestResult>>({});

  const requestRevision = useRef(0);

  const fetchWebhooks = useCallback(async () => {
    const revision = ++requestRevision.current;
    setIsLoading(true);
    setError(null);
    try {
      const data = await webhookApi.list(true);
      if (revision !== requestRevision.current) return;
      setWebhooks(data);
    } catch (err) {
      if (revision === requestRevision.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (revision === requestRevision.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchWebhooks();
  }, [fetchWebhooks]);

  const createWebhook = useCallback(
    async (payload: CreateWebhookPayload): Promise<WebhookEndpoint> => {
      const created = await webhookApi.create(payload);
      setWebhooks((prev) => [created, ...prev]);
      return created;
    },
    [],
  );

  const updateWebhook = useCallback(
    async (id: string, payload: UpdateWebhookPayload): Promise<WebhookEndpoint> => {
      const updated = await webhookApi.update(id, payload);
      setWebhooks((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updated } : item)),
      );
      return updated;
    },
    [],
  );

  const deleteWebhook = useCallback(async (id: string): Promise<boolean> => {
    setDeletingId(id);
    try {
      await webhookApi.delete(id);
      setWebhooks((prev) => prev.filter((item) => item.id !== id));
      return true;
    } catch {
      return false;
    } finally {
      setDeletingId(null);
    }
  }, []);

  const toggleStatus = useCallback(async (id: string, currentStatus: boolean): Promise<boolean> => {
    setTogglingId(id);
    try {
      const updated = await webhookApi.update(id, { isActive: !currentStatus });
      setWebhooks((prev) =>
        prev.map((item) => (item.id === id ? { ...item, isActive: updated.isActive } : item)),
      );
      return true;
    } catch {
      return false;
    } finally {
      setTogglingId(null);
    }
  }, []);

  const testPing = useCallback(async (id: string): Promise<WebhookTestResult> => {
    setTestingId(id);
    try {
      const result = await webhookApi.testPing(id);
      setTestResults((prev) => ({ ...prev, [id]: result }));
      return result;
    } catch (err) {
      const fallbackResult: WebhookTestResult = {
        success: false,
        message: err instanceof Error ? err.message : 'Connection failed',
      };
      setTestResults((prev) => ({ ...prev, [id]: fallbackResult }));
      return fallbackResult;
    } finally {
      setTestingId(null);
    }
  }, []);

  return {
    webhooks,
    isLoading,
    error,
    testingId,
    togglingId,
    deletingId,
    testResults,
    refetch: fetchWebhooks,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    toggleStatus,
    testPing,
  };
}
