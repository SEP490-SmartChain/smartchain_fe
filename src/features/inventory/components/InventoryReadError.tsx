import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';

import { inventoryReadErrorKind } from '../lib/inventoryReadError';

interface InventoryReadErrorProps {
  error: Error;
  title: string;
  onRetry: () => void;
}

export function InventoryReadError({ error, title, onRetry }: InventoryReadErrorProps) {
  const t = useTranslations('Inventory');
  const kind = inventoryReadErrorKind(error);
  return (
    <Alert
      variant={kind === 'forbidden' ? 'warning' : 'error'}
      title={kind === 'forbidden' ? t('readForbidden') : title}
    >
      <p className="mb-3 mt-0 text-sm leading-6">{t(`readErrorHint.${kind}`)}</p>
      {kind !== 'forbidden' && (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          {t('retry')}
        </Button>
      )}
    </Alert>
  );
}
