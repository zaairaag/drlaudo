import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] gap-x-3 gap-y-1 rounded-lg border p-4 text-sm has-[>svg]:grid-cols-[auto_1fr] [&>svg]:col-start-1 [&>svg]:row-span-2 [&>svg]:mt-0.5 [&>svg]:size-4',
  {
    variants: {
      variant: {
        default: 'border-brand-100 bg-secondary text-secondary-foreground',
        destructive: 'border-destructive/20 bg-destructive-soft text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Alert({ className, variant, ...props }: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 data-slot="alert-title" className={cn('col-start-2 font-semibold leading-snug', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-description" className={cn('col-start-2 text-sm leading-relaxed [&_a]:underline [&_a]:underline-offset-4', className)} {...props} />;
}
