import React, { useEffect } from 'react';

import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { notifyInlineError } from '@/lib/errorNotifications';
import { cn } from '@/lib/utils';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'success' | 'warning' | 'error' | 'info';
  title?: string;
  compact?: boolean;
  notify?: boolean;
  onClose?: () => void;
}

const variantStyles = {
  success: {
    tone: 'border-[var(--sc-success-border)] bg-[var(--sc-success-bg)] text-[var(--sc-success-dark)]',
    icon: CheckCircle2,
  },
  warning: {
    tone: 'border-[var(--sc-warning-border)] bg-[var(--sc-warning-bg)] text-[var(--sc-warning-dark)]',
    icon: AlertCircle,
  },
  error: {
    tone: 'border-[var(--sc-error-border)] bg-[var(--sc-error-bg)] text-[var(--sc-error-dark)]',
    icon: XCircle,
  },
  info: {
    tone: 'border-[var(--sc-info-border)] bg-[var(--sc-info-bg)] text-[var(--sc-info-dark)]',
    icon: Info,
  },
};

export function Alert({
  variant = 'info',
  title,
  children,
  compact = false,
  notify = true,
  onClose,
  className,
  ...props
}: AlertProps) {
  const t = useTranslations('Notifications');
  const styles = variantStyles[variant];
  const Icon = styles.icon;
  const message = title || (typeof children === 'string' ? children : undefined);

  useEffect(() => {
    if (variant === 'error' && notify) notifyInlineError(message, compact);
  }, [variant, notify, message, compact]);

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] text-[var(--sc-text-primary)] shadow-[var(--sc-shadow-section)]',
        compact ? 'gap-2 p-2 text-xs leading-4' : 'gap-3 p-3 text-sm leading-5',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center border',
          compact ? 'size-5 rounded-md' : 'size-8 rounded-lg',
          styles.tone,
        )}
      >
        <Icon aria-hidden="true" size={compact ? 13 : 17} />
      </span>
      <div className={cn('min-w-0 flex-1 wrap-anywhere', compact ? 'py-0.5' : 'py-1.5')}>
        {title && <div className="font-semibold">{title}</div>}
        {children !== null && children !== undefined && (
          <div className={cn(title && 'mt-1 text-[var(--sc-text-secondary)]')}>{children}</div>
        )}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--sc-text-secondary)] transition-colors hover:bg-[var(--sc-bg-secondary)]"
          aria-label={t('dismiss')}
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
