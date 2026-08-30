import React from 'react';

import { cn } from '@/lib/utils';

interface BadgeProps {
  status: 'success' | 'warning' | 'error' | 'info' | 'default' | string;
  label: string;
  variant?: 'dot' | 'solid' | 'outline';
}

const statusStyles = {
  success: {
    dot: 'bg-[#0F766E]',
    solid: 'bg-[#F0FDFA] text-[#0F766E] border-[#99F6E4]',
    outline: 'bg-transparent text-[#0F766E] border-[#0F766E]',
  },
  warning: {
    dot: 'bg-[#F59E0B]',
    solid: 'bg-[#FEF3C7] text-[#D97706] border-[#FCD34D]',
    outline: 'bg-transparent text-[#F59E0B] border-[#F59E0B]',
  },
  error: {
    dot: 'bg-[#EF4444]',
    solid: 'bg-[#FEF2F2] text-[#EF4444] border-[#FCA5A5]',
    outline: 'bg-transparent text-[#EF4444] border-[#EF4444]',
  },
  info: {
    dot: 'bg-[#3B82F6]',
    solid: 'bg-[#EFF6FF] text-[#3B82F6] border-[#BFDBFE]',
    outline: 'bg-transparent text-[#3B82F6] border-[#3B82F6]',
  },
  default: {
    dot: 'bg-[#9CA3AF]',
    solid: 'bg-[#F7F8FA] text-[#6A6E76] border-[#E5E7EB]',
    outline: 'bg-transparent text-[#6A6E76] border-[#D1D5DB]',
  },
};

export function Badge({ status, label, variant = 'solid' }: BadgeProps) {
  const style = statusStyles[status as keyof typeof statusStyles] || statusStyles.default;

  if (variant === 'dot') {
    return (
      <div className="flex items-center gap-2">
        <span className={cn('w-2 h-2 rounded-full', style.dot)} />
        <span className="text-[#6A6E76] text-[13px] font-medium">{label}</span>
      </div>
    );
  }

  if (variant === 'solid') {
    return (
      <span
        className={cn(
          'inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border',
          style.solid,
        )}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border',
        style.outline,
      )}
    >
      {label}
    </span>
  );
}
