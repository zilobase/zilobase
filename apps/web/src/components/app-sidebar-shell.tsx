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
        "overflow-hidden [&_[data-sidebar=content]]:gap-0.5 [&_[data-sidebar=content]]:py-1 [&_[data-sidebar=content]_[data-sidebar=menu-button]]:h-8 [&_[data-sidebar=content]_[data-sidebar=menu-button]]:p-2 [&_[data-sidebar=footer]]:gap-0.5 [&_[data-sidebar=footer]_[data-sidebar=menu-button]]:h-8 [&_[data-sidebar=footer]_[data-sidebar=menu-button]]:p-2 [&_[data-sidebar=group]]:py-0 [&_[data-sidebar=group-action]]:top-1.5 [&_[data-sidebar=group-label]]:h-8 [&_[data-sidebar=group-label]]:rounded-md [&_[data-sidebar=group-label]]:px-2 [&_[data-sidebar=group-label]]:text-xs [&_[data-sidebar=group-label]]:text-sidebar-foreground/55 [&_[data-sidebar=group-label]]:hover:bg-sidebar-accent [&_[data-sidebar=group-label]]:hover:text-sidebar-accent-foreground [&_[data-sidebar=menu]]:gap-0.5",
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
      className={cn("gap-0", hasOverlayTitleBar && "pt-9")}
      data-tauri-drag-region={hasOverlayTitleBar ? "deep" : undefined}
    >
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">{children}</div>
        <SidebarTrigger className="shrink-0" />
      </div>
      {navigation}
    </SidebarHeader>
  )
}
