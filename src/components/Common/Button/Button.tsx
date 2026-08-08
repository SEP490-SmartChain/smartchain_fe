import React from 'react';

import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const variants = {
  primary: 'bg-blue-600 text-white border border-blue-600 hover:bg-blue-700',
  secondary: 'bg-gray-100 text-gray-900 border border-gray-200 hover:bg-gray-200',
  outline:
    'bg-transparent text-gray-700 border border-gray-300 hover:bg-gray-50 hover:text-gray-900',
  danger: 'bg-red-600 text-white border border-red-600 hover:bg-red-700',
  ghost:
    'bg-transparent text-gray-700 border border-transparent hover:bg-gray-100 hover:text-gray-900',
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
