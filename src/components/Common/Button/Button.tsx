import React from 'react';

import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const variants = {
  primary:
    'bg-[#0F766E] text-white border border-[#0F766E] hover:bg-[#0d645d] hover:shadow-md font-semibold',
  secondary:
    'bg-white text-[#475569] border border-[#E2E8F0] hover:bg-[#F8FAFC] hover:border-[#CBD5E1]',
  outline:
    'bg-transparent text-[#0F766E] border border-[#0F766E] hover:bg-[#F0FDFA] hover:border-[#0d645d]',
  danger: 'bg-[#EF4444] text-white border border-[#EF4444] hover:bg-[#DC2626]',
  ghost:
    'bg-transparent text-[#475569] border border-transparent hover:bg-[#F8FAFC] hover:text-[#0F172A]',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
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
  ) => {
    return (
      <button
        ref={ref}
        disabled={isLoading || disabled}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium rounded-md transition-all duration-200 ease-in-out whitespace-nowrap',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {isLoading && <Loader2 className="animate-spin" size={16} />}
        <span>{children}</span>
      </button>
    );
  },
);
Button.displayName = 'Button';
