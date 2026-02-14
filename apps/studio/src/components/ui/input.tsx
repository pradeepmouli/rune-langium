import * as React from "react"

import { cn } from "@/lib/utils.js"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "h-8 w-full rounded-[var(--radius-md)] border border-[var(--color-border-emphasis)] bg-[var(--color-surface-sunken)] px-3 py-1 text-sm text-[var(--color-text-primary)]",
          "placeholder:text-[var(--color-text-muted)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1",
          "disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
