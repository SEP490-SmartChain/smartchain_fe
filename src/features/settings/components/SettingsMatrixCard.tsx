import React from 'react';

import { Card } from '@/components/Common';

interface SettingsMatrixCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingsMatrixCard({
  title,
  description,
  children,
  className,
}: SettingsMatrixCardProps) {
  return (
    <Card padding="none" className={`overflow-hidden ${className ?? ''}`}>
      <div className="grid lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]">
        <header className="border-b border-[var(--sc-border-default)] p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <h2 className="m-0 text-base font-medium leading-5 text-[var(--sc-text-primary)]">
            {title}
          </h2>
          <p className="mb-0 mt-1 text-sm leading-5 text-[var(--sc-text-secondary)]">
            {description}
          </p>
        </header>
        <div className="min-w-0">{children}</div>
      </div>
    </Card>
  );
}
