import type { ComponentProps } from 'react';
import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay data-slot="dialog-overlay" className={cn('fixed inset-0 z-50 bg-foreground/40 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0', className)} {...props} />;
}

export function DialogContent({ className, children, showCloseButton = true, ...props }: ComponentProps<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn('fixed top-1/2 left-1/2 z-50 grid max-h-[85svh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-xl border bg-card p-6 text-card-foreground shadow-float outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95', className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none" aria-label="Fechar">
            <X aria-hidden="true" className="size-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('flex flex-col gap-2 pr-8', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="dialog-footer" className={cn('flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn('font-display text-lg leading-snug font-semibold tracking-tight', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn('text-sm leading-relaxed text-muted-foreground', className)} {...props} />;
}
