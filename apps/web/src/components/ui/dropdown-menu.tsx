import type { ComponentProps } from 'react';
import { Check, ChevronRight, Circle } from 'lucide-react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;

const contentClassName = 'z-50 min-w-44 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-float data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95';
const itemClassName = 'relative flex min-h-11 cursor-default items-center gap-2 rounded-md px-3 py-2 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0';

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return <DropdownMenuPortal><DropdownMenuPrimitive.Content data-slot="dropdown-menu-content" sideOffset={sideOffset} className={cn(contentClassName, className)} {...props} /></DropdownMenuPortal>;
}

export function DropdownMenuItem({ className, inset, variant = 'default', ...props }: ComponentProps<typeof DropdownMenuPrimitive.Item> & { inset?: boolean; variant?: 'default' | 'destructive' }) {
  return <DropdownMenuPrimitive.Item data-slot="dropdown-menu-item" className={cn(itemClassName, inset && 'pl-9', variant === 'destructive' && 'text-destructive focus:bg-destructive-soft focus:text-destructive', className)} {...props} />;
}

export function DropdownMenuCheckboxItem({ className, children, ...props }: ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return <DropdownMenuPrimitive.CheckboxItem data-slot="dropdown-menu-checkbox-item" className={cn(itemClassName, 'pl-9', className)} {...props}><span className="absolute left-3 flex size-4 items-center justify-center"><DropdownMenuPrimitive.ItemIndicator><Check aria-hidden="true" className="size-4" /></DropdownMenuPrimitive.ItemIndicator></span>{children}</DropdownMenuPrimitive.CheckboxItem>;
}

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return <DropdownMenuPrimitive.RadioItem data-slot="dropdown-menu-radio-item" className={cn(itemClassName, 'pl-9', className)} {...props}><span className="absolute left-3 flex size-4 items-center justify-center"><DropdownMenuPrimitive.ItemIndicator><Circle aria-hidden="true" className="size-2 fill-current" /></DropdownMenuPrimitive.ItemIndicator></span>{children}</DropdownMenuPrimitive.RadioItem>;
}

export function DropdownMenuLabel({ className, inset, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }) {
  return <DropdownMenuPrimitive.Label data-slot="dropdown-menu-label" className={cn('px-3 py-2 text-xs font-semibold text-muted-foreground', inset && 'pl-9', className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn('-mx-1.5 my-1.5 h-px bg-border', className)} {...props} />;
}

export function DropdownMenuShortcut({ className, ...props }: ComponentProps<'span'>) {
  return <span data-slot="dropdown-menu-shortcut" className={cn('ml-auto text-xs tracking-widest text-muted-foreground', className)} {...props} />;
}

export function DropdownMenuSubTrigger({ className, inset, children, ...props }: ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean }) {
  return <DropdownMenuPrimitive.SubTrigger data-slot="dropdown-menu-sub-trigger" className={cn(itemClassName, 'data-[state=open]:bg-accent', inset && 'pl-9', className)} {...props}>{children}<ChevronRight aria-hidden="true" className="ml-auto" /></DropdownMenuPrimitive.SubTrigger>;
}

export function DropdownMenuSubContent({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return <DropdownMenuPrimitive.SubContent data-slot="dropdown-menu-sub-content" className={cn(contentClassName, className)} {...props} />;
}
