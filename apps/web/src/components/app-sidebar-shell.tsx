"use client"

import * as React from "react"
import { isTauri } from "@tauri-apps/api/core"
import { useTheme } from "next-themes"
import { MonitorIcon, MoonIcon, SunIcon } from "@/shared/components/icons"

import { Button } from "@/shared/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import {
  Sidebar,
  SidebarHeader,
  SidebarTrigger,
} from "@/shared/ui/sidebar"
import { cn } from "@/shared/lib/utils"

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
        "overflow-hidden [&_[data-sidebar=content]]:gap-0.5 [&_[data-sidebar=content]]:pt-0.5 [&_[data-sidebar=content]]:pb-1 [&_[data-sidebar=content]_[data-sidebar=menu-button]]:h-8 [&_[data-sidebar=content]_[data-sidebar=menu-button]]:p-2 [&_[data-sidebar=footer]]:gap-0.5 [&_[data-sidebar=footer]_[data-sidebar=menu-button]]:h-8 [&_[data-sidebar=footer]_[data-sidebar=menu-button]]:p-2 [&_[data-sidebar=group]]:py-0 [&_[data-sidebar=group-action]]:top-1.5 [&_[data-sidebar=group-label]]:h-8 [&_[data-sidebar=group-label]]:rounded-md [&_[data-sidebar=group-label]]:px-2 [&_[data-sidebar=group-label]]:text-xs [&_[data-sidebar=group-label]]:text-muted-foreground [&_[data-sidebar=group-label]]:hover:bg-accent [&_[data-sidebar=group-label]]:hover:text-accent-foreground [&_[data-sidebar=menu]]:gap-0.5",
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
      <div className="flex h-8 items-center">
        <div className="h-full min-w-0 flex-1">{children}</div>
        <div className="flex shrink-0 items-center gap-0.5">
          <ThemeSwitcher />
          <SidebarTrigger className="mr-0.5 shrink-0" />
        </div>
      </div>
      {navigation ? <div className="-mx-2">{navigation}</div> : null}
    </SidebarHeader>
  )
}

function ThemeSwitcher() {
  const { setTheme, theme = "system" } = useTheme()
  const ThemeIcon =
    theme === "light" ? SunIcon : theme === "dark" ? MoonIcon : MonitorIcon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Change theme"
          className="size-7 text-muted-foreground [&_svg]:size-4!"
          size="icon-lg"
          title="Theme"
          type="button"
          variant="ghost"
        >
          <ThemeIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36" side="bottom">
        <DropdownMenuRadioGroup onValueChange={setTheme} value={theme}>
          <DropdownMenuRadioItem value="light">
            <SunIcon />
            <span>Light</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <MoonIcon />
            <span>Dark</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <MonitorIcon />
            <span>System</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
