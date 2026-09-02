import React from 'react';

import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: Array<{ value: string; label: string }>;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, options, className, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-[#1A1D21] mb-2"
          >
            {label}
            {props.required && <span className="text-[#EF4444] ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'w-full px-4 py-2.5 pr-10 text-sm text-[#1A1D21]',
              'bg-white border rounded-lg appearance-none',
              'transition-all duration-200 outline-none cursor-pointer',
              'focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/20',
              'disabled:bg-[#F7F8FA] disabled:text-[#9CA3AF] disabled:cursor-not-allowed',
              error
                ? 'border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]/20'
                : 'border-[#E5E7EB]',
              className,
            )}
            {...props}
          >
            <option value="" disabled>
              Select an option
            </option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#6A6E76]">
            <ChevronDown size={16} />
          </div>
        </div>

        {error && <p className="mt-1.5 text-xs text-[#EF4444] font-medium">{error}</p>}

        {helperText && !error && <p className="mt-1.5 text-xs text-[#6A6E76]">{helperText}</p>}
      </div>
    );
  },
);
Select.displayName = 'Select';
