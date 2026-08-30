import React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, label, ...props }, ref) => {
    return (
      <label className="flex items-center gap-3 cursor-pointer group">
        <div className="relative inline-flex items-center">
          <input
            type="checkbox"
            className="sr-only peer"
            ref={ref}
            {...props}
          />
          <div 
            className={cn(
              "w-10 h-5.5 bg-[#CBD5E1] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#0F766E]/30 rounded-full peer transition-colors duration-200",
              "peer-checked:bg-[#0F766E]",
              "peer-disabled:opacity-50 peer-disabled:cursor-not-allowed",
              className
            )}
          ></div>
          <div 
            className={cn(
              "absolute left-[2px] top-[2px] bg-white border border-[#CBD5E1] rounded-full h-[18px] w-[18px] transition-all duration-200",
              "peer-checked:translate-x-[18px] peer-checked:border-white shadow-sm"
            )}
          ></div>
        </div>
        {label && (
          <span className={cn(
            "text-sm font-medium text-[#475569] group-hover:text-[#0F172A] transition-colors",
            props.disabled && "text-[#94A3B8] group-hover:text-[#94A3B8]"
          )}>
            {label}
          </span>
        )}
      </label>
    );
  }
);

Switch.displayName = 'Switch';
