import { useEffect, useRef, useState } from 'react';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { productApi } from '../api/productApi';

import type { Product } from '../types/product.types';

export function DeactivateProductModal({
  product,
  onClose,
  onChanged,
}: {
  readonly product: Product | null;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  const t = useTranslations('ProductCatalog');
  const principal = useAuthStore((state) => state.user);
  const [reason, setReason] = useState('');
  const [work, setWork] = useState<{ stockUnits: number; openOrders: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const revision = useRef(0);
  useEffect(() => {
    const token = ++revision.current;
    setReason('');
    setWork(null);
    setError(null);
    setSaving(false);
    if (product) {
      void productApi
        .outstanding(product.id)
        .then((result) => {
          if (token === revision.current) setWork(result);
        })
        .catch((failure) => {
          if (token === revision.current) {
            setError(failure instanceof ApiError ? failure.message : t('deactivationLoadError'));
          }
        });
    }
    return () => {
      revision.current++;
    };
  }, [product, principal, t]);
  const save = async () => {
    if (!product || !work || saving || reason.trim().length < 3) return;
    const token = revision.current;
    setSaving(true);
    setError(null);
    try {
      await productApi.deactivate(product.id, {
        reason: reason.trim(),
        expectedUpdatedAt: product.updatedAt,
      });
      if (token !== revision.current) return;
      toast.success(t('deactivated'));
      onChanged();
      onClose();
    } catch (failure) {
      if (token === revision.current) {
        setError(failure instanceof ApiError ? failure.message : t('deactivationSaveError'));
        if (failure instanceof ApiError && failure.status === 409) onChanged();
      }
    } finally {
      if (token === revision.current) setSaving(false);
    }
  };
  return (
    <Modal isOpen={product !== null} onClose={onClose} title={t('deactivationTitle')} width="520px">
      <form
        className="space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <p className="text-sm text-[var(--sc-text-primary)]">
          {product?.sku} — {product?.name}
        </p>
        {error && <Alert variant="error" title={error} />}
        {work ? (
          <Alert
            variant="warning"
            title={t('outstandingWork', { stock: work.stockUnits, orders: work.openOrders })}
          >
            {t('deactivationHint')}
          </Alert>
        ) : (
          !error && <p role="status">{t('deactivationLoading')}</p>
        )}
        <Input
          label={t('deactivationReason')}
          required
          minLength={3}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={!work || saving || reason.trim().length < 3}>
            {t('deactivate')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
