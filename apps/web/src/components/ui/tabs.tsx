"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import type * as React from "react"

import { cn } from "@/lib/utils"

export type TabsVariant = "default" | "line" | "tab" | "underline"

export function Tabs({
  className,
  ...props
}: TabsPrimitive.Root.Props): React.ReactElement {
  return (
    <TabsPrimitive.Root
      className={cn(
        "flex gap-2 data-[orientation=horizontal]:flex-col data-[orientation=vertical]:flex-row",
        className,
      )}
      data-slot="tabs"
      {...props}
    />
  )
}

export function TabsList({
  variant = "default",
  className,
  children,
  ...props
}: TabsPrimitive.List.Props & {
  variant?: TabsVariant
}): React.ReactElement {
  const isLineVariant = variant === "line" || variant === "underline"

  return (
    <TabsPrimitive.List
      className={cn(
        "group/tabs-list relative z-0 flex w-fit items-center justify-center gap-0.5 text-muted-foreground data-[orientation=vertical]:flex-col",
        variant === "default" &&
          "rounded-lg bg-muted p-[3px] dark:bg-input/30",
        variant === "tab" && "rounded-lg p-[3px]",
        isLineVariant &&
          "bg-transparent data-[orientation=horizontal]:py-1 data-[orientation=vertical]:px-1",
        className,
      )}
      data-slot="tabs-list"
      data-variant={variant}
      {...props}
    >
      {children}
      {variant !== "tab" && (
        <TabsPrimitive.Indicator
          className={cn(
            "absolute bottom-0 left-0 h-(--active-tab-height) w-(--active-tab-width) translate-x-(--active-tab-left) -translate-y-(--active-tab-bottom) transition-[width,translate] duration-200 ease-in-out",
            isLineVariant
              ? "z-10 bg-foreground data-[orientation=horizontal]:h-0.5 data-[orientation=horizontal]:translate-y-px data-[orientation=vertical]:w-0.5 data-[orientation=vertical]:-translate-x-px"
              : "-z-1 rounded-md bg-background shadow-sm/5 dark:bg-input",
          )}
          data-slot="tab-indicator"
        />
      )}
    </TabsPrimitive.List>
  )
}

export function TabsTab({
  className,
  ...props
}: TabsPrimitive.Tab.Props): React.ReactElement {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "relative inline-flex h-7 shrink-0 grow cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-1.5 py-0.5 text-xs font-medium text-foreground/60 outline-none transition-[color,background-color,box-shadow] hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 data-disabled:pointer-events-none data-disabled:opacity-50 data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start data-active:text-foreground dark:text-muted-foreground dark:hover:text-foreground dark:data-active:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        "group-data-[variant=tab]/tabs-list:transition-none group-data-[variant=tab]/tabs-list:data-active:bg-muted",
        "group-data-[variant=line]/tabs-list:hover:bg-accent group-data-[variant=underline]/tabs-list:hover:bg-accent",
        className,
      )}
      data-slot="tabs-tab"
      {...props}
    />
  )
}

export function TabsPanel({
  className,
  ...props
}: TabsPrimitive.Panel.Props): React.ReactElement {
  return (
    <TabsPrimitive.Panel
      className={cn("flex-1 text-xs/relaxed outline-none", className)}
      data-slot="tabs-content"
      {...props}
    />
  )
}

export { TabsPrimitive, TabsTab as TabsTrigger, TabsPanel as TabsContent }
