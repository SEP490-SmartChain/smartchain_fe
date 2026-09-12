import React, { useEffect, useId, useRef } from 'react';

import { createPortal } from 'react-dom';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

export default function Modal({ isOpen, onClose, title, children, width = '400px' }: ModalProps) {
  const t = useTranslations('Common');
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="sc-backdrop-enter fixed inset-0 z-[1000] flex items-center justify-center bg-[rgb(27_27_31/35%)] p-4 backdrop-blur-[3px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="sc-modal-enter flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] shadow-[var(--sc-shadow-popover)]"
        style={{ maxWidth: width }}
      >
        <div className="flex items-center justify-between border-b border-[var(--sc-border-default)] px-5 py-4 sm:px-6">
          <h3 id={titleId} className="m-0 text-lg font-medium text-[var(--sc-text-primary)]">
            {title}
          </h3>
          <button
            type="button"
            className="sc-icon-button"
            onClick={onClose}
            aria-label={t('close')}
          >
            <X size={19} />
          </button>
        </div>
        <div className="overflow-y-auto p-5 sm:p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
