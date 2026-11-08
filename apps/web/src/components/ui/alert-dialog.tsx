import type { ComponentProps } from 'react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;

export function AlertDialogOverlay({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return <AlertDialogPrimitive.Overlay data-slot="alert-dialog-overlay" className={cn('fixed inset-0 z-50 bg-foreground/40 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0', className)} {...props} />;
}

export function AlertDialogContent({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn('fixed top-1/2 left-1/2 z-50 grid max-h-[85svh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-xl border bg-card p-6 text-card-foreground shadow-float outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95', className)}
        {...props}
      />
    </AlertDialogPortal>
  );
}

export function AlertDialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-dialog-header" className={cn('flex flex-col gap-2', className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-dialog-footer" className={cn('flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end', className)} {...props} />;
}

export function AlertDialogTitle({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return <AlertDialogPrimitive.Title data-slot="alert-dialog-title" className={cn('font-display text-lg leading-snug font-semibold tracking-tight', className)} {...props} />;
}

export function AlertDialogDescription({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return <AlertDialogPrimitive.Description data-slot="alert-dialog-description" className={cn('text-sm leading-relaxed text-muted-foreground', className)} {...props} />;
}

export function AlertDialogAction({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Action>) {
  return <AlertDialogPrimitive.Action data-slot="alert-dialog-action" className={cn(buttonVariants(), className)} {...props} />;
}

export function AlertDialogCancel({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return <AlertDialogPrimitive.Cancel data-slot="alert-dialog-cancel" className={cn(buttonVariants({ variant: 'outline' }), className)} {...props} />;
}
