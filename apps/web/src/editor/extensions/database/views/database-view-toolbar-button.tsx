import type { ComponentProps } from "react"

import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/lib/utils"

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
