import React from 'react';

interface BreadcrumbProps {
  items: string[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <div className="text-[13px] text-[#6A6E76] flex items-center gap-2 mb-8">
      {items.map((item, i) => (
        <React.Fragment key={item}>
          {i > 0 && <span className="text-[#D1D5DB]">/</span>}
          <span className={i === items.length - 1 ? 'text-[#1A1D21] font-semibold' : 'hover:text-[#0F766E] transition-colors cursor-pointer'}>{item}</span>
        </React.Fragment>
      ))}
    </div>
  );
}
