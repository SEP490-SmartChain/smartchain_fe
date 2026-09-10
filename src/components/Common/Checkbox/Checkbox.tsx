import React from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2.5 cursor-pointer group">
          <div className="relative flex items-center justify-center w-4 h-4 shrink-0">
            <input
              type="checkbox"
              ref={ref}
              className={cn(
                'peer appearance-none w-4 h-4 border rounded-sm transition-all duration-200 cursor-pointer',
                'bg-white border-[#CBD5E1]',
                'hover:border-[#0F766E]',
                'checked:bg-[#0F766E] checked:border-[#0F766E]',
                'focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20',
                'disabled:bg-[#F1F5F9] disabled:border-[#E2E8F0] disabled:cursor-not-allowed disabled:checked:bg-[#CBD5E1]',
                error &&
                  'border-[#EF4444] checked:bg-[#EF4444] checked:border-[#EF4444] focus:ring-[#EF4444]/20 hover:border-[#EF4444]',
                className,
              )}
              {...props}
            />
            <Check
              size={12}
              strokeWidth={3}
              className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity"
            />
          </div>
          {label && (
            <span
              className={cn(
                'text-sm text-[#475569] group-hover:text-[#0F172A] transition-colors',
                props.disabled && 'text-[#94A3B8] group-hover:text-[#94A3B8]',
              )}
            >
              {label}
            </span>
          )}
        </label>
        {error && <span className="text-xs text-[#EF4444] ml-6">{error}</span>}
      </div>
    );
  },
);

Checkbox.displayName = 'Checkbox';
