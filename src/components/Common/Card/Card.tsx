import React from 'react';

import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'bordered' | 'elevated';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const variants = {
  default:
    'border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] shadow-[var(--sc-shadow-section)]',
  bordered: 'border border-[var(--sc-border-strong)] bg-[var(--sc-bg-surface)]',
  elevated:
    'border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] shadow-[var(--sc-shadow-popover)]',
};

const paddings = {
  none: '',
  sm: 'p-4',
  md: 'p-[18px] sm:p-6',
  lg: 'p-6 sm:p-8',
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ children, variant = 'default', padding = 'md', className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl transition-[border-color,box-shadow,transform] duration-200',
        variants[variant],
        paddings[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
Card.displayName = 'Card';

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function CardHeader({ title, description, action, className, ...props }: CardHeaderProps) {
  return (
    <div className={cn('mb-6 flex items-start justify-between gap-4', className)} {...props}>
      <div>
        <h3 className="m-0 text-lg font-medium text-[var(--sc-text-primary)]">{title}</h3>
        {description && (
          <p className="mb-0 mt-1 text-sm leading-5 text-[var(--sc-text-secondary)]">
            {description}
          </p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function CardContent({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mt-6 border-t border-[var(--sc-border-default)] pt-6', className)}
      {...props}
    >
      {children}
    </div>
  );
}
