import { useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { productApi } from '../api/productApi';
import { readSkuWorkbook } from '../lib/readSkuWorkbook';

const schema = z.object({ file: z.instanceof(File) });
type FormValues = z.infer<typeof schema>;
type ImportResult = Awaited<ReturnType<typeof productApi.importRows>>;
interface Props {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}

export function ImportProductsModal({ isOpen, onClose, onChanged }: Props) {
  const t = useTranslations('ProductCatalog');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const handleImport = async ({ file }: FormValues) => {
    setResult(null);
    setError(null);
    const principal = useAuthStore.getState().user;
    try {
      const rows = await readSkuWorkbook(file);
      if (principal !== useAuthStore.getState().user) return;
      const response = await productApi.importRows(rows);
      if (principal !== useAuthStore.getState().user) return;
      setResult(response);
      onChanged();
    } catch (failure) {
      if (principal !== useAuthStore.getState().user) return;
      setError(failure instanceof ApiError ? failure.message : t('workbookError'));
    }
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('importTitle')} width="720px">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => void handleSubmit(handleImport)(event)}
      >
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('importHint')}</p>
        <a
          className="text-[var(--sc-primary)] underline"
          href="/templates/sku-import-template.xlsx"
          download
        >
          {t('downloadTemplate')}
        </a>
        <Input
          label={t('workbookFile')}
          type="file"
          accept=".xlsx"
          disabled={isSubmitting}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) setValue('file', file);
            setResult(null);
            setError(null);
          }}
          error={errors.file ? t('selectWorkbook') : undefined}
        />
        {error && <Alert variant="error" title={error} />}
        {result && (
          <div aria-live="polite">
            <p>
              {t('importSummary', {
                created: result.created,
                unchanged: result.unchanged,
                rejected: result.rejected,
              })}
            </p>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-left text-sm" aria-label={t('importResults')}>
                <thead>
                  <tr>
                    <th>{t('row')}</th>
                    <th>{t('fieldSku')}</th>
                    <th>{t('columnStatus')}</th>
                    <th>{t('invalidFields')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item) => (
                    <tr key={item.row}>
                      <td>{item.row}</td>
                      <td>{item.sku ?? '—'}</td>
                      <td>{t(`importStatus.${item.status}`)}</td>
                      <td>{item.fields?.join(', ') ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t('discard')}
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {t('import')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
