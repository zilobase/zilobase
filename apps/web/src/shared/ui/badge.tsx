import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/shared/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-transparent px-2 py-0.5 text-[0.625rem] font-medium whitespace-nowrap transition-all focus-visible:border-action-focus-ring focus-visible:ring-[3px] focus-visible:ring-action-focus-ring has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-action-danger-border aria-invalid:ring-action-danger-border dark:aria-invalid:ring-action-danger-border [&>svg]:pointer-events-none [&>svg]:size-2.5!",
  {
    variants: {
      variant: {
        default: "bg-action-selected text-action-on-selected [a]:hover:bg-action-selected-subtle",
        secondary:
          "bg-action-secondary text-action-on-secondary [a]:hover:bg-action-secondary",
        destructive:
          "bg-feedback-error-subtle text-action-danger-text focus-visible:ring-action-danger-border dark:bg-feedback-error-subtle dark:focus-visible:ring-action-danger-border [a]:hover:bg-feedback-error-subtle",
        outline:
          "border-stroke-default bg-control-background text-content-primary dark:bg-control-background [a]:hover:bg-action-neutral-hover [a]:hover:text-content-secondary",
        ghost:
          "hover:bg-action-neutral-hover hover:text-content-secondary dark:hover:bg-action-neutral-hover",
        link: "text-action-link underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge }
