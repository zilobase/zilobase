import type { ComponentPropsWithoutRef } from "react"

import { cn } from "@/shared/lib/utils"

export function FloatingWidget({
  className,
  ...props
}: ComponentPropsWithoutRef<"aside">) {
  return (
    <aside
      className={cn(
        "fixed bottom-16 right-4 z-50 flex h-[min(44rem,calc(var(--app-viewport-height,100svh)-6rem))] w-[min(28rem,calc(100vw-2rem))] min-h-0 flex-col overflow-hidden rounded-xl border bg-surface-canvas text-content-primary shadow-2xl",
        className,
      )}
      {...props}
    />
  )
}
