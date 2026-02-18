import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils.js';

function Spinner({ className, ...props }: React.ComponentProps<typeof Loader2>) {
  return <Loader2 data-slot="spinner" className={cn('animate-spin', className)} {...props} />;
}

export { Spinner };
