import React from 'react';

interface BreadcrumbProps {
  items: string[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <div className="text-[13px] text-[#6a6e76] flex items-center gap-2 mb-8">
      {items.map((item, i) => (
        <React.Fragment key={item}>
          {i > 0 && <span className="text-gray-300">/</span>}
          <span className={i === items.length - 1 ? 'text-[#1a1d21] font-medium' : ''}>{item}</span>
        </React.Fragment>
      ))}
    </div>
  );
}
