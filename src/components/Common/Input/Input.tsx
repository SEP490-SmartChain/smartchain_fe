import React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { 
      label, 
      error, 
      helperText, 
      leftIcon, 
      rightIcon, 
      className, 
      id, 
      ...props 
    },
    ref,
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-semibold text-[#0F172A] mb-2"
          >
            {label}
            {props.required && <span className="text-[#EF4444] ml-1">*</span>}
          </label>
        )}
        
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#475569]">
              {leftIcon}
            </div>
          )}
          
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full px-4 py-2.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8]',
              'bg-white border rounded-lg',
              'transition-all duration-200 outline-none shadow-sm',
              'focus:border-transparent focus:ring-2 focus:ring-[#0F766E]',
              'disabled:bg-[#F8FAFC] disabled:text-[#94A3B8] disabled:cursor-not-allowed',
              error
                ? 'border-[#EF4444] focus:ring-[#EF4444]'
                : 'border-[#E2E8F0]',
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              className,
            )}
            {...props}
          />
          
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#475569]">
              {rightIcon}
            </div>
          )}
        </div>
        
        {error && (
          <p className="mt-1.5 text-xs text-[#EF4444] font-medium">{error}</p>
        )}
        
        {helperText && !error && (
          <p className="mt-1.5 text-xs text-[#475569]">{helperText}</p>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';
