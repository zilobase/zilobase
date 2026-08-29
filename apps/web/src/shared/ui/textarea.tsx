import * as React from "react"

import { cn } from "@/shared/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full resize-none rounded-md border border-control-border bg-control-background px-2 py-2 text-sm transition-colors outline-none placeholder:text-content-secondary focus-visible:border-action-focus-ring focus-visible:ring-2 focus-visible:ring-action-focus-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-action-danger-border aria-invalid:ring-2 aria-invalid:ring-action-danger-border md:text-xs/relaxed",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
