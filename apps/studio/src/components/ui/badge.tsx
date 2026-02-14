import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils.js"

const badgeVariants = cva(
  "inline-flex items-center rounded-[var(--radius-sm)] px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-accent)] text-white",
        secondary:
          "bg-[var(--color-surface-overlay)] text-[var(--color-text-secondary)] border border-[var(--color-border-default)]",
        success:
          "bg-[var(--color-enum-badge)] text-[var(--color-enum-text)]",
        warning:
          "bg-[var(--color-choice-badge)] text-[var(--color-choice-text)]",
        error:
          "bg-[var(--color-error-bg)] text-[var(--color-error-text)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant }), className)}
        {...props}
      />
    )
  }
)
Badge.displayName = "Badge"

export { Badge, badgeVariants }
