import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils.js"

const badgeVariants = cva(
  "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-white",
        secondary:
          "bg-surface-overlay text-text-secondary border border-border-default",
        success:
          "bg-enum-badge text-enum-text",
        warning:
          "bg-choice-badge text-choice-text",
        error:
          "bg-error-bg text-error-text",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
