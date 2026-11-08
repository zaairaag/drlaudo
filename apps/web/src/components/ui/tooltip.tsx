import type { ComponentProps } from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export function TooltipProvider({ delayDuration = 300, ...props }: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({ className, sideOffset = 6, children, ...props }: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn('z-50 max-w-64 rounded-md bg-foreground px-3 py-2 text-xs leading-relaxed text-background shadow-float data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95', className)}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-foreground" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}
