import React from 'react';

import { AlertCircle, CheckCircle2, Info, XCircle, X } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'success' | 'warning' | 'error' | 'info';
  title?: string;
  onClose?: () => void;
}

const variantStyles = {
  success: {
    container: 'bg-[#F0FDFA] border-[#99F6E4] text-[#0F766E]',
    icon: CheckCircle2,
    iconColor: 'text-[#0F766E]',
  },
  warning: {
    container: 'bg-[#FEF3C7] border-[#FCD34D] text-[#D97706]',
    icon: AlertCircle,
    iconColor: 'text-[#F59E0B]',
  },
  error: {
    container: 'bg-[#FEF2F2] border-[#FCA5A5] text-[#EF4444]',
    icon: XCircle,
    iconColor: 'text-[#EF4444]',
  },
  info: {
    container: 'bg-[#EFF6FF] border-[#BFDBFE] text-[#3B82F6]',
    icon: Info,
    iconColor: 'text-[#3B82F6]',
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
        'relative flex gap-3 p-4 rounded-lg border',
        styles.container,
        className,
      )}
      {...props}
    >
      <div className={cn('flex-shrink-0 mt-0.5', styles.iconColor)}>
        <Icon size={20} />
      </div>

      <div className="flex-1 text-sm">
        {title && <div className="font-semibold mb-1">{title}</div>}
        <div className={!title ? 'font-medium' : ''}>{children}</div>
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className={cn(
            'flex-shrink-0 p-1 rounded-md transition-colors hover:bg-black/5',
            styles.iconColor,
          )}
          aria-label="Close alert"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
