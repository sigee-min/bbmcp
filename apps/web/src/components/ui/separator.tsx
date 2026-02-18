import * as React from 'react';
import { cn } from '../../lib/utils';

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
}

export const Separator = ({ className, orientation = 'horizontal', ...props }: SeparatorProps) => (
  <div
    aria-hidden="true"
    className={cn(
      'shrink-0 bg-border/70',
      orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      className
    )}
    {...props}
  />
);
