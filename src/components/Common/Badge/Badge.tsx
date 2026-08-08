import React from 'react';

import { cn } from '@/lib/utils';

interface BadgeProps {
  status: 'Approved' | 'Blocked' | 'Rejected' | string;
}

const statusColors: Record<string, string> = {
  Approved: 'bg-green-500',
  Blocked: 'bg-gray-600',
  Rejected: 'bg-red-500',
  default: 'bg-gray-300',
};

export default function Badge({ status }: BadgeProps) {
  const statusColor = statusColors[status] || statusColors.default;

  return (
    <div className="flex items-center gap-2">
      <span className={cn('w-2 h-2 rounded-full', statusColor)} />
      <span className="text-gray-600 text-[13px]">{status}</span>
    </div>
  );
}
