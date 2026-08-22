"use client"

import * as React from "react"
import { isTauri } from "@tauri-apps/api/core"

import {
  Sidebar,
  SidebarHeader,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export function AppSidebarShell({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      aria-label="Application sidebar"
      collapsible="offcanvas"
      className={cn(
        "overflow-hidden [&_[data-sidebar=content]]:gap-0.5 [&_[data-sidebar=content]]:pt-0.5 [&_[data-sidebar=content]]:pb-1 [&_[data-sidebar=content]_[data-sidebar=menu-button]]:h-8 [&_[data-sidebar=content]_[data-sidebar=menu-button]]:p-2 [&_[data-sidebar=footer]]:gap-0.5 [&_[data-sidebar=footer]_[data-sidebar=menu-button]]:h-8 [&_[data-sidebar=footer]_[data-sidebar=menu-button]]:p-2 [&_[data-sidebar=group]]:py-0 [&_[data-sidebar=group-action]]:top-1.5 [&_[data-sidebar=group-label]]:h-8 [&_[data-sidebar=group-label]]:rounded-md [&_[data-sidebar=group-label]]:px-2 [&_[data-sidebar=group-label]]:text-xs [&_[data-sidebar=group-label]]:text-sidebar-foreground/55 [&_[data-sidebar=group-label]]:hover:bg-sidebar-accent [&_[data-sidebar=group-label]]:hover:text-sidebar-accent-foreground [&_[data-sidebar=menu]]:gap-0.5",
        className,
      )}
      {...props}
    >
      {children}
    </Sidebar>
  )
}

export function AppSidebarHeader({
  children,
  navigation,
}: {
  children: React.ReactNode
  navigation?: React.ReactNode
}) {
  const hasOverlayTitleBar =
    isTauri() &&
    (navigator.userAgent.includes("Mac") ||
      navigator.userAgent.includes("Linux"))

  return (
    <SidebarHeader
      className={cn("gap-0.5 pb-0", hasOverlayTitleBar && "pt-9")}
      data-tauri-drag-region={hasOverlayTitleBar ? "deep" : undefined}
    >
      <div className="group/workspace-row flex h-8 items-center rounded-md transition-colors hover:bg-sidebar-accent focus-within:bg-sidebar-accent [&_[data-sidebar=menu]]:h-full [&_[data-sidebar=menu-item]]:h-full [&_[data-sidebar=menu-button]]:h-full [&_[data-sidebar=menu-button]]:hover:bg-transparent [&_[data-sidebar=menu-button][data-open]]:bg-transparent">
        <div className="h-full min-w-0 flex-1">{children}</div>
        <SidebarTrigger className="mr-0.5 size-7 shrink-0 rounded-md hover:bg-sidebar-foreground/10 focus-visible:bg-sidebar-foreground/10 group-hover/workspace-row:text-sidebar-accent-foreground" />
      </div>
      {navigation}
    </SidebarHeader>
  )
}
