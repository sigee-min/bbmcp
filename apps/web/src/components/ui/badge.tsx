import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em] transition-colors',
  {
    variants: {
      variant: {
        default: 'border-primary/35 bg-primary/10 text-primary',
        secondary: 'border-border bg-muted/55 text-muted-foreground',
        outline: 'border-border bg-background text-foreground',
        success: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
        warning: 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        danger: 'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

const Badge = ({ className, variant, ...props }: BadgeProps) => {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
};

export { Badge, badgeVariants };
