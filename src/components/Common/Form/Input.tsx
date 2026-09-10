import React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const reactId = React.useId();
    const generatedId = id || reactId;

    return (
      <div className="flex flex-col gap-1.5 mb-4">
        {label && (
          <label htmlFor={generatedId} className="text-sm font-medium text-[#1A1D21]">
            {label}
          </label>
        )}
        <input
          id={generatedId}
          ref={ref}
          className={cn(
            'w-full px-3.5 py-2.5 text-sm border rounded-md bg-white text-[#1A1D21] placeholder:text-[#9CA3AF] transition-all duration-200 outline-none',
            'focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/20',
            'disabled:bg-[#F7F8FA] disabled:cursor-not-allowed disabled:opacity-70',
            error
              ? 'border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]/20'
              : 'border-[#E5E7EB]',
            className,
          )}
          {...props}
        />
        {error && <span className="text-xs text-[#EF4444] mt-0.5 font-medium">{error}</span>}
      </div>
    );
  },
);
Input.displayName = 'Input';
