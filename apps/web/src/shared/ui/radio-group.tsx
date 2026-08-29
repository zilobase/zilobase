import * as React from "react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

import { cn } from "@/shared/lib/utils"

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid w-full gap-3", className)}
      {...props}
    />
  )
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "group/radio-group-item peer relative flex aspect-square size-4 shrink-0 rounded-full border border-control-border outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-action-focus-ring focus-visible:ring-3 focus-visible:ring-action-focus-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-action-danger-border aria-invalid:ring-3 aria-invalid:ring-action-danger-border aria-invalid:aria-checked:border-action-selected-border dark:bg-control-background dark:aria-invalid:border-action-danger-border dark:aria-invalid:ring-action-danger-border data-checked:border-action-selected-border data-checked:bg-action-selected data-checked:text-action-on-selected dark:data-checked:bg-action-selected",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-4 items-center justify-center"
      >
        <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-action-on-selected" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem }
