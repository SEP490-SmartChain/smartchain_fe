import React from 'react';

import { LoaderCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const variants = {
  primary:
    'border-[var(--sc-primary)] bg-[var(--sc-primary)] text-white hover:border-[var(--sc-primary-hover)] hover:bg-[var(--sc-primary-hover)] hover:shadow-[0_6px_14px_rgb(15_118_110/20%)]',
  secondary:
    'border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] text-[var(--sc-text-primary)] hover:border-[var(--sc-primary-light)] hover:bg-[var(--sc-primary-alpha-08)] hover:shadow-[0_4px_10px_rgb(15_23_42/8%)]',
  outline:
    'border-[var(--sc-primary-light)] bg-[var(--sc-bg-surface)] text-[var(--sc-primary-dark)] hover:border-[var(--sc-primary)] hover:bg-[var(--sc-primary-alpha-08)] hover:shadow-[0_4px_10px_rgb(15_118_110/10%)]',
  danger:
    'border-[var(--sc-error)] bg-[var(--sc-error)] text-white hover:border-[var(--sc-error-dark)] hover:bg-[var(--sc-error-dark)] hover:shadow-[0_6px_14px_rgb(239_68_68/18%)]',
  ghost:
    'border-transparent bg-transparent text-[var(--sc-text-secondary)] shadow-none hover:bg-[var(--sc-primary-alpha-08)] hover:text-[var(--sc-text-primary)]',
};

const sizes = {
  sm: 'h-9 px-3 text-xs leading-4',
  md: 'h-[42px] px-4 text-sm leading-[18px]',
  lg: 'h-12 px-[18px] text-base leading-5',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      className,
      isLoading = false,
      disabled,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      disabled={isLoading || disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium shadow-[var(--sc-shadow-button)]',
        'transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out',
        'hover:-translate-y-px active:scale-[0.98] active:translate-y-0 disabled:pointer-events-none disabled:translate-y-0 disabled:scale-100 disabled:opacity-60 disabled:shadow-[var(--sc-shadow-button)]',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {isLoading && <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
