import * as React from "react"

import { cn } from "@/shared/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-md border border-control-border bg-control-background px-2 py-0.5 text-sm transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs/relaxed file:font-medium file:text-content-primary placeholder:text-content-secondary focus-visible:border-action-focus-ring focus-visible:ring-1 focus-visible:ring-action-focus-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-action-danger-border aria-invalid:ring-1 aria-invalid:ring-action-danger-border md:text-xs/relaxed dark:aria-invalid:border-action-danger-border dark:aria-invalid:ring-action-danger-border",
        className
      )}
      {...props}
    />
  )
}

export { Input }
