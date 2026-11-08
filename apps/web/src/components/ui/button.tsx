import type { ComponentProps } from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/25 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-brand-800 active:bg-brand-900',
        destructive: 'bg-destructive text-primary-foreground hover:bg-destructive/90 focus-visible:ring-destructive',
        outline: 'border border-input bg-card text-foreground shadow-xs hover:border-brand-200 hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-brand-100',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'px-4 py-2.5',
        sm: 'px-3 py-2 text-xs',
        lg: 'min-h-12 px-6 py-3 text-base',
        icon: 'size-11 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button';
  return (
    <Component
      data-slot="button"
      type={asChild ? type : type ?? 'button'}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
