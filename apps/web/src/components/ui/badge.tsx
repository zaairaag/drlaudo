import type { ComponentProps } from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1 text-xs font-medium leading-4 [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        destructive: 'bg-destructive-soft text-destructive',
        outline: 'border-border bg-card text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Badge({ className, variant, asChild = false, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot.Root : 'span';
  return <Component data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
