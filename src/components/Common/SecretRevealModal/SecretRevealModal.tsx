import type { ReactNode } from 'react';

import { AlertTriangle, Check, Copy, Key } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/Common/Button/Button';
import Modal from '@/components/Common/Modal/Modal';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

export interface SecretRevealModalLabels {
  title: string;
  warningTitle: string;
  warningDescription: string;
  secretLabel: string;
  copy: string;
  copied: string;
  copySucceeded: string;
  copyFailed: string;
  storageAdvice: string;
  confirm: string;
}

export interface SecretRevealModalProps {
  isOpen: boolean;
  onClose: () => void;
  secret: string;
  /** id của ô hiển thị secret, để label liên kết đúng khi nhiều modal cùng tồn tại. */
  inputId: string;
  labels: SecretRevealModalLabels;
  details?: ReactNode;
}

/**
 * Hiện một secret đúng một lần (webhook signing secret, API key…). Secret chỉ
 * nằm trong props; component không lưu lại ở bất kỳ đâu.
 */
export function SecretRevealModal({
  isOpen,
  onClose,
  secret,
  inputId,
  labels,
  details,
}: SecretRevealModalProps) {
  const { isCopied, copy } = useCopyToClipboard();

  const handleCopy = async () => {
    if (await copy(secret)) toast.success(labels.copySucceeded);
    else toast.error(labels.copyFailed);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={labels.title} width="600px">
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl border border-[var(--sc-warning-border)] bg-[var(--sc-warning-bg)] p-4 text-[var(--sc-warning-dark)]">
          <AlertTriangle
            className="mt-0.5 shrink-0 text-[var(--sc-warning)]"
            size={20}
            aria-hidden="true"
          />
          <div className="text-sm leading-5">
            <p className="font-semibold">{labels.warningTitle}</p>
            <p className="mt-1 text-xs leading-4">{labels.warningDescription}</p>
          </div>
        </div>

        {details}

        <div>
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]"
          >
            {labels.secretLabel}
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex min-w-0 flex-1 items-center">
              <div className="pointer-events-none absolute left-3 flex items-center text-[var(--sc-text-tertiary)]">
                <Key size={16} aria-hidden="true" />
              </div>
              <input
                id={inputId}
                type="text"
                readOnly
                value={secret}
                className="h-11 w-full rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] pl-10 pr-3 font-mono text-xs font-semibold tracking-wide text-[var(--sc-text-primary)] outline-none select-all focus:border-[var(--sc-primary)]"
              />
            </div>
            <Button
              type="button"
              size="md"
              variant={isCopied ? 'secondary' : 'primary'}
              onClick={handleCopy}
              className="h-11 shrink-0 gap-1.5 px-4 text-xs font-medium"
            >
              {isCopied ? (
                <>
                  <Check size={16} className="text-[var(--sc-success)]" aria-hidden="true" />
                  {labels.copied}
                </>
              ) : (
                <>
                  <Copy size={16} aria-hidden="true" />
                  {labels.copy}
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="rounded-lg bg-[var(--sc-bg-secondary)] p-3 text-xs text-[var(--sc-text-secondary)]">
          {labels.storageAdvice}
        </div>

        <div className="flex justify-end pt-2">
          <Button type="button" onClick={onClose}>
            {labels.confirm}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
