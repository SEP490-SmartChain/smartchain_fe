import { useId, useState } from 'react';

import { FileText, UploadCloud, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

export interface DropzoneProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  maxSizeMb?: number;
  disabled?: boolean;
  className?: string;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Dropzone({
  files,
  onFilesChange,
  accept,
  multiple = true,
  maxSizeMb = 10,
  disabled = false,
  className,
}: DropzoneProps) {
  const inputId = useId();
  const t = useTranslations('Common');
  const [isDragging, setDragging] = useState(false);
  const [rejectedCount, setRejectedCount] = useState(0);

  const addFiles = (incoming: FileList | File[]) => {
    if (disabled) return;
    const maxBytes = maxSizeMb * 1024 * 1024;
    const candidates = Array.from(incoming);
    const acceptedFiles = candidates.filter((file) => file.size <= maxBytes);
    setRejectedCount(candidates.length - acceptedFiles.length);

    if (!multiple) {
      onFilesChange(acceptedFiles.slice(0, 1));
      return;
    }

    const uniqueFiles = [...files, ...acceptedFiles].filter(
      (file, index, list) =>
        list.findIndex(
          (candidate) =>
            candidate.name === file.name &&
            candidate.size === file.size &&
            candidate.lastModified === file.lastModified,
        ) === index,
    );
    onFilesChange(uniqueFiles);
  };

  return (
    <div className={className}>
      <input
        id={inputId}
        type="file"
        className="sr-only"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => {
          if (event.target.files) addFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <label
        htmlFor={inputId}
        className={cn(
          'flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition-[border-color,background-color,transform]',
          isDragging
            ? 'scale-[1.01] border-[var(--sc-primary)] bg-[var(--sc-primary-alpha-08)]'
            : 'border-[var(--sc-border-strong)] bg-[var(--sc-bg-secondary)] hover:border-[var(--sc-primary)] hover:bg-[var(--sc-primary-alpha-08)]',
          disabled && 'pointer-events-none cursor-not-allowed opacity-60',
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(event.dataTransfer.files);
        }}
      >
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]">
          <UploadCloud size={23} strokeWidth={1.6} />
        </span>
        <span className="text-sm font-medium text-[var(--sc-text-primary)]">
          {t('dropzone_title')}
        </span>
        <span className="mt-1 text-xs leading-4 text-[var(--sc-text-secondary)]">
          {t('dropzone_hint', { size: maxSizeMb })}
        </span>
      </label>

      {rejectedCount > 0 && (
        <p role="alert" className="mb-0 mt-2 text-xs text-[var(--sc-error-dark)]">
          {t('dropzone_rejected', { count: rejectedCount, size: maxSizeMb })}
        </p>
      )}

      {files.length > 0 && (
        <ul className="mt-4 space-y-2">
          {files.map((file) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="flex items-center gap-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]">
                <FileText size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--sc-text-primary)]">
                  {file.name}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--sc-text-tertiary)]">
                  {formatFileSize(file.size)}
                </span>
              </span>
              <button
                type="button"
                className="sc-icon-button h-8 w-8"
                aria-label={t('remove_file', { name: file.name })}
                onClick={() => onFilesChange(files.filter((candidate) => candidate !== file))}
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
