"use client"

import * as React from "react"

import { AppSidebarRail } from "@/components/app-sidebar-rail"
import { Sidebar, SidebarContent } from "@/components/ui/sidebar"

export function AppSidebarShell({
  children,
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      collapsible="icon"
      variant="floating"
      className="overflow-hidden border-r-0 [&>[data-slot=sidebar-inner]]:border-0 [&>[data-slot=sidebar-inner]]:bg-transparent [&>[data-slot=sidebar-inner]]:shadow-none *:data-[sidebar=sidebar]:flex-row *:data-[sidebar=sidebar]:gap-(--app-sidebar-rail-gap)"
      {...props}
    >
      <Sidebar
        collapsible="none"
        className="w-(--sidebar-width-icon)! shrink-0 rounded-lg border shadow-sm"
      >
        <SidebarContent>
          <AppSidebarRail />
        </SidebarContent>
      </Sidebar>
      <Sidebar
        collapsible="none"
        className="w-(--app-sidebar-panel-width)! min-w-0 shrink-0 rounded-l-lg border-y border-l shadow-sm [&_[data-sidebar=footer]]:pr-4 [&_[data-sidebar=group-action]]:right-4 [&_[data-sidebar=group]]:pr-4 [&_[data-sidebar=header]]:pr-4"
      >
        {children}
      </Sidebar>
    </Sidebar>
  )
}
