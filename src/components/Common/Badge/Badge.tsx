import { cn } from '@/lib/utils';

interface BadgeProps {
  status: 'success' | 'warning' | 'error' | 'info' | 'default' | string;
  label: string;
  variant?: 'dot' | 'solid' | 'outline';
  size?: 'sm' | 'md';
}

const statusStyles = {
  success: {
    dot: 'bg-[var(--sc-success)]',
    solid:
      'border-[var(--sc-success-border)] bg-[var(--sc-success-bg)] text-[var(--sc-success-dark)]',
    outline: 'border-[var(--sc-success)] bg-transparent text-[var(--sc-success-dark)]',
  },
  warning: {
    dot: 'bg-[var(--sc-warning)]',
    solid:
      'border-[var(--sc-warning-border)] bg-[var(--sc-warning-bg)] text-[var(--sc-warning-dark)]',
    outline: 'border-[var(--sc-warning)] bg-transparent text-[var(--sc-warning-dark)]',
  },
  error: {
    dot: 'bg-[var(--sc-error)]',
    solid: 'border-[var(--sc-error-border)] bg-[var(--sc-error-bg)] text-[var(--sc-error-dark)]',
    outline: 'border-[var(--sc-error)] bg-transparent text-[var(--sc-error-dark)]',
  },
  info: {
    dot: 'bg-[var(--sc-info)]',
    solid: 'border-[var(--sc-info-border)] bg-[var(--sc-info-bg)] text-[var(--sc-info-dark)]',
    outline: 'border-[var(--sc-info)] bg-transparent text-[var(--sc-info-dark)]',
  },
  default: {
    dot: 'bg-[var(--sc-text-tertiary)]',
    solid:
      'border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)]',
    outline: 'border-[var(--sc-border-strong)] bg-transparent text-[var(--sc-text-secondary)]',
  },
};

export function Badge({ status, label, variant = 'solid', size = 'sm' }: BadgeProps) {
  const style = statusStyles[status as keyof typeof statusStyles] || statusStyles.default;

  if (variant === 'dot') {
    return (
      <span className="inline-flex items-center gap-2">
        <span className={cn('h-2 w-2 rounded-full', style.dot)} />
        <span className="text-[13px] font-medium text-[var(--sc-text-secondary)]">{label}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border',
        size === 'md'
          ? 'px-2.5 py-1 text-sm font-normal leading-[18px]'
          : 'px-2 py-1 text-xs font-medium leading-4',
        variant === 'solid' ? style.solid : style.outline,
      )}
    >
      {label}
    </span>
  );
}
