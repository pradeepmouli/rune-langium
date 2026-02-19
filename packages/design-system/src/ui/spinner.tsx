/**
 * Spinner — loading indicator using lucide-react Loader2.
 *
 * @module
 */

import { Loader2 } from 'lucide-react';
import { cn } from '../utils.js';

function Spinner({ className, ...props }: React.ComponentProps<typeof Loader2>) {
  return <Loader2 data-slot="spinner" className={cn('animate-spin', className)} {...props} />;
}

export { Spinner };
