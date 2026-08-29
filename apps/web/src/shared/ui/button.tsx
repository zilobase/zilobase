import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/shared/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-xs/relaxed font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-action-focus-ring focus-visible:ring-2 focus-visible:ring-action-focus-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-action-danger-border aria-invalid:ring-2 aria-invalid:ring-action-danger-border dark:aria-invalid:border-action-danger-border dark:aria-invalid:ring-action-danger-border [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-action-primary text-action-on-primary hover:bg-action-primary-hover",
        outline:
          "border-stroke-default hover:bg-action-neutral-hover hover:text-action-on-neutral active:bg-action-neutral-pressed active:text-action-on-neutral aria-expanded:bg-action-neutral-hover aria-expanded:text-action-on-neutral aria-expanded:hover:bg-action-neutral-pressed aria-expanded:hover:text-action-on-neutral dark:bg-control-background",
        secondary:
          "bg-action-secondary text-action-on-secondary hover:bg-action-secondary-hover active:bg-action-neutral-pressed active:text-action-on-neutral aria-expanded:bg-action-secondary aria-expanded:text-action-on-secondary",
        ghost:
          "hover:bg-action-neutral-hover hover:text-action-on-neutral active:bg-action-neutral-pressed active:text-action-on-neutral aria-expanded:bg-action-neutral-hover aria-expanded:text-action-on-neutral aria-expanded:hover:bg-action-neutral-pressed aria-expanded:hover:text-action-on-neutral",
        destructive:
          "bg-action-danger text-action-on-danger hover:bg-action-danger-hover focus-visible:border-action-danger-border focus-visible:ring-action-danger-border",
        link: "text-action-link underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-7 gap-1 px-2 text-xs/relaxed has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-5 gap-1 px-2 text-[0.625rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-2.5",
        sm: "h-6 gap-1 px-2 text-xs/relaxed has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        lg: "h-8 gap-1 px-2.5 text-xs/relaxed has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-4",
        icon: "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-xs": "size-5 [&_svg:not([class*='size-'])]:size-2.5",
        "icon-sm": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-lg": "size-8 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  children,
  trailingDivider = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    trailingDivider?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"
  const content =
    trailingDivider && !asChild ? addTrailingDivider(children) : children

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {content}
    </Comp>
  )
}

function addTrailingDivider(children: React.ReactNode) {
  const items = React.Children.toArray(children)

  if (items.length < 2) return children

  const trailingItem = items.pop()

  return (
    <>
      {items}
      <span
        aria-hidden="true"
        className="mx-1 w-px self-stretch bg-current opacity-25"
        data-slot="button-trailing-divider"
      />
      {trailingItem}
    </>
  )
}

export { Button, buttonVariants }
