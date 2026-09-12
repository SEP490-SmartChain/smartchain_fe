import React from 'react';

import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'success' | 'warning' | 'error' | 'info';
  title?: string;
  onClose?: () => void;
}

const variantStyles = {
  success: {
    container:
      'border-[var(--sc-success-border)] bg-[var(--sc-success-bg)] text-[var(--sc-success-dark)]',
    icon: CheckCircle2,
  },
  warning: {
    container:
      'border-[var(--sc-warning-border)] bg-[var(--sc-warning-bg)] text-[var(--sc-warning-dark)]',
    icon: AlertCircle,
  },
  error: {
    container:
      'border-[var(--sc-error-border)] bg-[var(--sc-error-bg)] text-[var(--sc-error-dark)]',
    icon: XCircle,
  },
  info: {
    container: 'border-[var(--sc-info-border)] bg-[var(--sc-info-bg)] text-[var(--sc-info-dark)]',
    icon: Info,
  },
};

export function Alert({
  variant = 'info',
  title,
  children,
  onClose,
  className,
  ...props
}: AlertProps) {
  const styles = variantStyles[variant];
  const Icon = styles.icon;

  return (
    <div
      role="alert"
      className={cn(
        'relative flex gap-3 rounded-xl border p-4 text-sm',
        styles.container,
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="mt-0.5 shrink-0" size={19} />
      <div className="min-w-0 flex-1">
        {title && <div className="mb-1 font-medium">{title}</div>}
        <div>{children}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 self-start rounded-md p-1 transition-colors hover:bg-black/5"
          aria-label="Close alert"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
