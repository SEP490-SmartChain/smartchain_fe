import { useCallback, useEffect, useRef, useState } from 'react';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { carrierCredentialApi } from '../api/carrierCredentialApi';

import type {
  CarrierCredential,
  CarrierCredentialFilters,
  CarrierSummary,
  CreateCarrierCredentialInput,
  PingTestResult,
  UpdateCarrierCredentialInput,
} from '../types/carrierCredential.types';

export function useCarrierCredentials(initialFilters: CarrierCredentialFilters = {}) {
  const t = useTranslations('CarrierCredentials');
  const [credentials, setCredentials] = useState<readonly CarrierCredential[]>([]);
  const [availableCarriers, setAvailableCarriers] = useState<readonly CarrierSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [filters, setFilters] = useState<CarrierCredentialFilters>(initialFilters);
  const [pingingId, setPingingId] = useState<string | null>(null);
  const [pingResults, setPingResults] = useState<Record<string, PingTestResult>>({});
  const requestRevision = useRef(0);

  // Tải danh mục các hãng vận chuyển có sẵn
  useEffect(() => {
    let isMounted = true;
    void carrierCredentialApi.getAvailableCarriers().then((carriers) => {
      if (isMounted) setAvailableCarriers(carriers);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Tải danh sách cấu hình kết nối của Tenant
  const loadCredentials = useCallback(async () => {
    const revision = ++requestRevision.current;
    setIsLoading(true);
    setError(null);
    try {
      const items = await carrierCredentialApi.list(filters);
      if (revision !== requestRevision.current) return;
      setCredentials(items);
    } catch (failure) {
      if (revision === requestRevision.current) {
        setError(failure instanceof Error ? failure : new Error(String(failure)));
      }
    } finally {
      if (revision === requestRevision.current) {
        setIsLoading(false);
      }
    }
  }, [filters]);

  useEffect(() => {
    void loadCredentials();
  }, [loadCredentials]);

  // Tạo mới cấu hình kết nối hãng
  const createCredential = useCallback(
    async (payload: CreateCarrierCredentialInput): Promise<CarrierCredential> => {
      const created = await carrierCredentialApi.create(payload);
      setCredentials((prev) => [created, ...prev]);
      return created;
    },
    [],
  );

  // Cập nhật cấu hình kết nối hãng
  const updateCredential = useCallback(
    async (id: string, payload: UpdateCarrierCredentialInput): Promise<CarrierCredential> => {
      const updated = await carrierCredentialApi.update(id, payload);
      setCredentials((prev) => prev.map((item) => (item.id === id ? updated : item)));
      return updated;
    },
    [],
  );

  // Gỡ kết nối hãng (Soft Delete)
  const deleteCredential = useCallback(async (id: string): Promise<boolean> => {
    await carrierCredentialApi.delete(id);
    setCredentials((prev) => prev.filter((item) => item.id !== id));
    return true;
  }, []);

  // Kiểm tra kết nối hãng (Ping Test)
  const testPing = useCallback(
    async (id: string): Promise<PingTestResult | null> => {
      setPingingId(id);
      try {
        const result = await carrierCredentialApi.pingTest(id);
        setPingResults((prev) => ({ ...prev, [id]: result }));
        // Cập nhật trạng thái tức thì trong danh sách
        setCredentials((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: result.status,
                  lastPingAt: result.testedAt,
                  lastPingMessage: result.message,
                }
              : item,
          ),
        );
        if (result.status === 'CONNECTED') {
          toast.success(result.message);
        } else {
          toast.error(result.message);
        }
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : t('card.pingError');
        toast.error(message);
        return null;
      } finally {
        setPingingId(null);
      }
    },
    [t],
  );

  return {
    credentials,
    availableCarriers,
    isLoading,
    error,
    filters,
    setFilters,
    pingingId,
    pingResults,
    reload: loadCredentials,
    createCredential,
    updateCredential,
    deleteCredential,
    testPing,
  };
}
