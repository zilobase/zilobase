"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import type * as React from "react"

import { cn } from "@/shared/lib/utils"

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
  className,
  ...props
}: TabsPrimitive.List.Props): React.ReactElement {
  return (
    <TabsPrimitive.List
      className={cn(
        "flex w-fit items-center justify-center gap-0.5 rounded-lg p-1 text-content-secondary data-[orientation=vertical]:flex-col",
        className,
      )}
      data-slot="tabs-list"
      {...props}
    />
  )
}

function TabsTab({
  className,
  ...props
}: TabsPrimitive.Tab.Props): React.ReactElement {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "relative inline-flex h-8 shrink-0 grow cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent px-3 py-0.5 text-sm font-medium text-content-secondary outline-none transition-none hover:bg-action-neutral-hover hover:text-action-on-neutral focus-visible:border-action-focus-ring focus-visible:ring-2 focus-visible:ring-action-focus-ring active:bg-action-neutral-pressed active:text-action-on-neutral data-active:bg-action-neutral-hover data-active:text-action-on-neutral data-active:hover:bg-action-neutral-pressed data-active:hover:text-action-on-neutral data-active:active:bg-action-neutral-pressed data-active:active:text-action-on-neutral data-disabled:pointer-events-none data-disabled:opacity-50 data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start dark:text-content-secondary dark:hover:text-content-primary dark:data-active:text-content-primary [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      data-slot="tabs-tab"
      {...props}
    />
  )
}

function TabsPanel({
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

export { TabsTab as TabsTrigger, TabsPanel as TabsContent }
