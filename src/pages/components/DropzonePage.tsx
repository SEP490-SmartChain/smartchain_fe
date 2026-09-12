import { useState } from 'react';

import { FileCheck2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Card, CardHeader, Dropzone } from '@/components/Common';

import ComponentPageShell from './ComponentPageShell';

export default function DropzonePage() {
  const t = useTranslations('Components');
  const [files, setFiles] = useState<File[]>([]);

  return (
    <ComponentPageShell title={t('uploadDocuments')}>
      <Card>
        <CardHeader
          title={t('uploadDocuments')}
          description={t('uploadDocumentsDescription')}
          action={
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]">
              <FileCheck2 size={18} />
            </span>
          }
        />
        <Dropzone
          files={files}
          onFilesChange={setFiles}
          accept=".pdf,.png,.jpg,.jpeg,.csv,.xls,.xlsx"
          maxSizeMb={10}
        />
        <p className="mb-0 mt-4 text-xs text-[var(--sc-text-tertiary)]">{t('acceptedFiles')}</p>
      </Card>
    </ComponentPageShell>
  );
}
