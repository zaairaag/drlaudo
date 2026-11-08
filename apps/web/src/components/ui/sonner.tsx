import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      closeButton
      position="bottom-right"
      icons={{
        success: <CircleCheck aria-hidden="true" className="size-4 text-highlight-strong" />,
        info: <Info aria-hidden="true" className="size-4 text-info" />,
        warning: <TriangleAlert aria-hidden="true" className="size-4 text-warning" />,
        error: <CircleAlert aria-hidden="true" className="size-4 text-destructive" />,
        loading: <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: 'group toast border-border bg-card font-sans text-card-foreground shadow-float',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
          closeButton: 'border-border bg-card text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}
