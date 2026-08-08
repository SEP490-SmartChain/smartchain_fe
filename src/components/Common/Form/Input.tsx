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
          <label htmlFor={generatedId} className="text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <input
          id={generatedId}
          ref={ref}
          className={cn(
            'w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-md bg-white text-gray-900 transition-all duration-200 outline-none',
            'focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10',
            'disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-70',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/10',
            className,
          )}
          {...props}
        />
        {error && <span className="text-xs text-red-600 mt-0.5">{error}</span>}
      </div>
    );
  },
);
Input.displayName = 'Input';
