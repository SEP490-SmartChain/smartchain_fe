import { useState } from 'react';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/Common/Button/Button';
import Modal from '@/components/Common/Modal/Modal';

import { apiKeyApi } from '../api/apiKeyApi';

import type { ApiKey } from '../types/apiKey.types';

interface ApiKeyRevokeModalProps {
  readonly apiKey: ApiKey | null;
  readonly onClose: () => void;
  /** Gọi sau khi thu hồi (hoặc khi key đã đổi trạng thái) để bảng tải lại. */
  readonly onChanged: () => void;
}

export function ApiKeyRevokeModal({ apiKey, onClose, onChanged }: ApiKeyRevokeModalProps) {
  const t = useTranslations('ApiKeys');
  const [isRevoking, setIsRevoking] = useState(false);

  const handleRevoke = async () => {
    if (!apiKey) return;
    setIsRevoking(true);
    try {
      await apiKeyApi.revoke(apiKey.id);
      toast.success(t('revokeSuccess', { name: apiKey.name }));
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : t('revokeError'));
    } finally {
      setIsRevoking(false);
      onChanged();
      onClose();
    }
  };

  return (
    <Modal isOpen={apiKey !== null} onClose={onClose} title={t('revokeTitle')} width="480px">
      <div className="space-y-5 p-5 sm:p-6">
        <p className="m-0 text-sm leading-5 text-[var(--sc-text-secondary)]">
          {t('revokeDescription', { name: apiKey?.name ?? '' })}
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isRevoking}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant="danger"
            isLoading={isRevoking}
            onClick={() => void handleRevoke()}
          >
            {t('revokeConfirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
