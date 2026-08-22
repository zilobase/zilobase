import type { ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type DatabaseViewToolbarButtonProps = Omit<
  ComponentProps<typeof Button>,
  "size" | "type" | "variant"
>

export function DatabaseViewToolbarButton({
  children,
  className,
  ...props
}: DatabaseViewToolbarButtonProps) {
  return (
    <Button
      {...props}
      className={cn("text-muted-foreground", className)}
      size="icon"
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  )
}
