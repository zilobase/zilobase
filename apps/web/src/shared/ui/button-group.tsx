import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Separator } from "@/shared/ui/separator"

const buttonGroupVariants = cva(
  "group/button-group flex items-stretch *:focus-visible:relative *:focus-visible:z-10 has-[>[data-slot=button-group]]:gap-2 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-md [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
  {
    variants: {
      orientation: {
        horizontal: "flex-row",
        vertical: "flex-col",
      },
      variant: {
        connected: "",
        floating:
          "gap-1 rounded-md border border-stroke-default bg-surface-overlay p-1 text-content-primary shadow-lg",
        plain: "gap-1",
        selection:
          "min-w-0 max-w-full overflow-x-auto rounded-md border border-stroke-default bg-surface-overlay text-content-primary shadow-lg [&_[data-slot=button-group-item]]:rounded-none [&_[data-slot=button-group-item]]:border-0 [&_[data-slot=button-group-item]:not(:last-child)]:border-r [&_[data-slot=button-group-item]:not(:last-child)]:border-r-stroke-default",
      },
      density: {
        default: "",
        compact: "",
      },
      width: {
        fit: "w-fit",
        full: "w-full",
      },
    },
    compoundVariants: [
      {
        orientation: "horizontal",
        variant: "connected",
        className:
          "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none [&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-md!",
      },
      {
        orientation: "vertical",
        variant: "connected",
        className:
          "[&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none [&>[data-slot]:not(:has(~[data-slot]))]:rounded-b-md!",
      },
      {
        density: "compact",
        variant: "floating",
        className: "gap-0.5 p-0.5",
      },
    ],
    defaultVariants: {
      density: "default",
      orientation: "horizontal",
      variant: "connected",
      width: "fit",
    },
  }
)

function ButtonGroup({
  className,
  density = "default",
  orientation = "horizontal",
  variant = "connected",
  width = "fit",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof buttonGroupVariants>) {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-density={density}
      data-orientation={orientation}
      data-variant={variant}
      className={cn(
        buttonGroupVariants({ density, orientation, variant, width }),
        className
      )}
      {...props}
    />
  )
}

const buttonGroupItemVariants = cva("", {
  variants: {
    layout: {
      default: "",
      icon: "size-7 px-0",
    },
    tone: {
      default: "",
      accent: "text-action-selected-text",
    },
  },
  defaultVariants: {
    layout: "default",
    tone: "default",
  },
})

function ButtonGroupItem({
  className,
  layout = "default",
  tone = "default",
  variant = "ghost",
  ...props
}: React.ComponentProps<typeof Button> &
  VariantProps<typeof buttonGroupItemVariants>) {
  return (
    <Button
      className={cn(buttonGroupItemVariants({ layout, tone }), className)}
      data-layout={layout}
      data-slot="button-group-item"
      data-tone={tone}
      variant={variant}
      {...props}
    />
  )
}

function ButtonGroupSection({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("relative flex min-w-0 items-stretch", className)}
      data-slot="button-group-section"
      {...props}
    />
  )
}

const buttonGroupTextVariants = cva(
  "flex items-center gap-2 rounded-md px-2.5 text-xs/relaxed font-medium [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border bg-surface-muted",
        plain: "border-none bg-transparent text-content-secondary shadow-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function ButtonGroupText({
  className,
  asChild = false,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & {
  asChild?: boolean
} & VariantProps<typeof buttonGroupTextVariants>) {
  const Comp = asChild ? Slot.Root : "div"

  return (
    <Comp
      className={cn(buttonGroupTextVariants({ variant }), className)}
      data-slot="button-group-text"
      data-variant={variant}
      {...props}
    />
  )
}

function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="button-group-separator"
      orientation={orientation}
      className={cn(
        "relative self-stretch bg-control-background data-horizontal:mx-px data-horizontal:w-auto data-vertical:my-px data-vertical:h-auto",
        className
      )}
      {...props}
    />
  )
}

export {
  ButtonGroup,
  ButtonGroupItem,
  ButtonGroupSeparator,
  ButtonGroupSection,
  ButtonGroupText,
  buttonGroupItemVariants,
  buttonGroupTextVariants,
  buttonGroupVariants,
}
