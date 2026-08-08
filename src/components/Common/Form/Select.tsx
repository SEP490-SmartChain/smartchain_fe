import React from 'react';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className, options, id, ...props }, ref) => {
    const t = useTranslations('Common');
    const reactId = React.useId();
    const generatedId = id || reactId;

    return (
      <div className="flex flex-col gap-1.5 mb-4">
        {label && (
          <label htmlFor={generatedId} className="text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <select
          id={generatedId}
          ref={ref}
          className={cn(
            'w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-md bg-white text-gray-900 transition-all duration-200 outline-none',
            'focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10',
            'disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-70',
            'appearance-none bg-no-repeat bg-[position:right_0.75rem_center] bg-[size:16px] pr-10',
            "bg-[url('data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2216%22_height=%2216%22_viewBox=%220_0_24_24%22_fill=%22none%22_stroke=%22%236b7280%22_stroke-width=%222%22_stroke-linecap=%22round%22_stroke-linejoin=%22round%22%3E%3Cpolyline_points=%226_9_12_15_18_9%22%3E%3C/polyline%3E%3C/svg%3E')]",
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/10',
            className,
          )}
          {...props}
        >
          <option value="" disabled>
            {t('select_option')}
          </option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <span className="text-xs text-red-600 mt-0.5">{error}</span>}
      </div>
    );
  },
);
Select.displayName = 'Select';
