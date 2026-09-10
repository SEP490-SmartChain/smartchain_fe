import React, { useState } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem {
  id: string;
  label: string;
  badge?: string | number;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  variant?: 'underline' | 'pills';
}

export function Tabs({ tabs, activeId, onChange, className, variant = 'underline' }: TabsProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap gap-2',
        variant === 'underline' && 'border-b border-[#E2E8F0] gap-6',
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = activeId === tab.id;

        if (variant === 'pills') {
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[#0F766E] text-white'
                  : 'bg-white text-[#475569] hover:bg-[#F1F5F9] border border-[#E2E8F0]',
              )}
            >
              {tab.icon && (
                <span className={cn(isActive ? 'text-white' : 'text-[#94A3B8]')}>{tab.icon}</span>
              )}
              {tab.label}
              {tab.badge !== undefined && (
                <span
                  className={cn(
                    'ml-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold',
                    isActive ? 'bg-white/20 text-white' : 'bg-[#F1F5F9] text-[#64748B]',
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        }

        // Underline variant
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'group flex items-center gap-2 pb-3 pt-1 text-sm font-medium border-b-2 transition-colors relative -mb-[1px]',
              isActive
                ? 'border-[#0F766E] text-[#0F766E]'
                : 'border-transparent text-[#475569] hover:text-[#0F172A] hover:border-[#CBD5E1]',
            )}
          >
            {tab.icon && (
              <span
                className={cn(
                  isActive ? 'text-[#0F766E]' : 'text-[#94A3B8] group-hover:text-[#64748B]',
                )}
              >
                {tab.icon}
              </span>
            )}
            {tab.label}
            {tab.badge !== undefined && (
              <span
                className={cn(
                  'ml-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold transition-colors',
                  isActive
                    ? 'bg-[#F0FDFA] text-[#0F766E]'
                    : 'bg-[#F1F5F9] text-[#64748B] group-hover:bg-[#E2E8F0]',
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
