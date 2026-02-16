import { cn } from '@/lib/utils.js';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-[60px] w-full rounded border border-border-emphasis bg-transparent px-3 py-2 text-sm text-text-primary shadow-xs',
        'placeholder:text-text-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface-base',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'field-sizing-content',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
