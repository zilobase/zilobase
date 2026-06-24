"use client"

import * as React from "react"

import { Sidebar } from "@/components/ui/sidebar"

export function AppSidebarShell({
  children,
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" className="overflow-hidden" {...props}>
      {children}
    </Sidebar>
  )
}
